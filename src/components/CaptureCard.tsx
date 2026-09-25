import { useRef, useState } from 'react'
import { describeError } from '../errors.ts'
import type { NewLeadExtras } from '../hooks/useLeads.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Quad, RGBAImage } from '../scan/document.ts'
import { extractFields } from '../scan/extract.ts'
import { recognize, type OcrProgress } from '../scan/ocr.ts'
import { canvasToJpeg, findDocument, loadPhoto, makeDocument, toCanvas } from '../scan/scanImage.ts'
import { EMPTY_FIELDS, hasContent, type Lead, type LeadFields } from '../types.ts'
import { LeadForm, type FormLists } from './LeadForm.tsx'
import { ScanModal } from './ScanModal.tsx'

interface Props {
  lists: FormLists
  /** この端末の登録者名 */
  member: string
  leads: Lead[]
  exhibition: string
  /** 登録者名が入っているか（入っていなければ登録させない） */
  memberReady: boolean
  onSave: (fields: LeadFields, extras: NewLeadExtras) => Promise<Lead>
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'adjust'; image: RGBAImage; quad: Quad; found: boolean }
  | { kind: 'processing' }
  | { kind: 'ocr'; progress: OcrProgress }

type Message = { kind: 'ok' | 'error'; text: string; detail?: string } | null

/**
 * 名刺・バッジの読み取りと、新しいリードの入力。
 * 撮影 → 四隅を合わせる → 書類のように補正 → 文字を読み取って入力欄を埋める → 確認して保存
 */
export function CaptureCard({ lists, member, leads, exhibition, memberReady, onSave }: Props) {
  const { t } = useI18n()
  const cameraRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [fields, setFields] = useState<LeadFields>(EMPTY_FIELDS)
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [message, setMessage] = useState<Message>(null)
  const [saving, setSaving] = useState(false)
  /** 前回の画像を選んだ方法（撮影 / 画像を選ぶ）。「再撮影」で同じ方法を開く */
  const [source, setSource] = useState<'camera' | 'pick'>('camera')
  /** OCR が入れた欄とその値。再撮影の時、手で直していない欄だけ消すために使う */
  const [ocrFilled, setOcrFilled] = useState<Partial<Record<keyof LeadFields, string>>>({})

  const setPhotoBlob = (blob: Blob | null) => {
    setPhoto((cur) => {
      if (cur) URL.revokeObjectURL(cur.url)
      return blob ? { blob, url: URL.createObjectURL(blob) } : null
    })
  }

  const reset = () => {
    setFields(EMPTY_FIELDS)
    setPhotoBlob(null)
    setOcrText('')
    setOcrFilled({})
    setOpen(false)
  }

  const openPicker = (from: 'camera' | 'pick') => {
    setSource(from)
    ;(from === 'camera' ? cameraRef : pickRef).current?.click()
  }

  /**
   * 撮り直す。写真がぶれた・読み取りがうまくいかなかった時のため。
   * OCR が入れた欄のうち、手で直していないものは消す（新しい写真の読み取り結果を入れ直すため）。
   * 手で入力した欄（重要度・メモなど）はそのまま残す
   */
  const retake = () => {
    setFields((cur) => {
      const next = { ...cur }
      for (const [k, v] of Object.entries(ocrFilled) as [keyof LeadFields, string][]) {
        if (next[k] === v) (next as Record<string, unknown>)[k] = ''
      }
      return next
    })
    setOcrFilled({})
    setPhotoBlob(null)
    setOcrText('')
    setMessage(null)
    setStage({ kind: 'idle' })
    openPicker(source)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    setStage({ kind: 'loading' })
    try {
      const image = await loadPhoto(file)
      const { quad, found } = findDocument(image)
      setStage({ kind: 'adjust', image, quad, found })
    } catch (e) {
      console.error('[scan-load]', e)
      setStage({ kind: 'idle' })
      setMessage({ kind: 'error', text: t('scan.failed'), detail: describeError(e) })
    }
  }

  const apply = async (image: RGBAImage, quad: Quad, rotation: number) => {
    setStage({ kind: 'processing' })
    // 補正の計算で画面が固まる前に、「補正しています」を表示させる
    await new Promise((r) => setTimeout(r, 30))
    let canvas: HTMLCanvasElement
    try {
      canvas = toCanvas(makeDocument(image, quad, rotation))
      setPhotoBlob(await canvasToJpeg(canvas))
      setOpen(true)
    } catch (e) {
      console.error('[scan-process]', e)
      setStage({ kind: 'idle' })
      setMessage({ kind: 'error', text: t('scan.failed'), detail: describeError(e) })
      return
    }
    setStage({ kind: 'ocr', progress: { phase: 'loading', progress: 0 } })
    try {
      const result = await recognize(canvas, (progress) => setStage({ kind: 'ocr', progress }))
      setOcrText(result.text)
      const found = extractFields(result.lines)
      // すでに入力されている欄（手で直した欄）は上書きしない
      setFields((cur) => {
        const next = { ...cur }
        for (const [k, v] of Object.entries(found) as [keyof typeof found, string][]) {
          if (!next[k].trim() && v) next[k] = v
        }
        return next
      })
      // 再撮影の時は、欄の値がこの読み取り結果のまま（手で直していない）なら消す
      setOcrFilled(Object.fromEntries(Object.entries(found).filter(([, v]) => v !== '')))
      setMessage({ kind: 'ok', text: t('ocr.done') })
    } catch (e) {
      console.error('[ocr]', e)
      setMessage({ kind: 'error', text: t('ocr.failed'), detail: describeError(e) })
    } finally {
      setStage({ kind: 'idle' })
    }
  }

  const save = async () => {
    if (!hasContent(fields)) {
      setMessage({ kind: 'error', text: t('form.needSomething') })
      return
    }
    setSaving(true)
    try {
      const lead = await onSave(fields, { photo: photo?.blob ?? null, ocrText, exhibition })
      setMessage({ kind: 'ok', text: t('form.saved', { name: lead.name || lead.company || lead.email || lead.phone }) })
      reset()
    } finally {
      setSaving(false)
    }
  }

  const busy = stage.kind !== 'idle' && stage.kind !== 'adjust'
  const progressText =
    stage.kind === 'loading'
      ? t('scan.loading')
      : stage.kind === 'processing'
        ? t('scan.processing')
        : stage.kind === 'ocr'
          ? t(stage.progress.phase === 'loading' ? 'ocr.loading' : 'ocr.recognizing', {
              p: Math.round(stage.progress.progress * 100),
            })
          : null

  return (
    <section className="card">
      <h2 className="form-title">{t('capture.title')}</h2>
      <p className="muted small">{t('capture.help')}</p>
      {!memberReady && <p className="banner banner-caution">{t('capture.needMember')}</p>}
      <div className="capture-buttons">
        <button className="primary" disabled={busy || !memberReady} onClick={() => openPicker('camera')}>
          {t('capture.camera')}
        </button>
        <button className="secondary" disabled={busy || !memberReady} onClick={() => openPicker('pick')}>
          {t('capture.pick')}
        </button>
        <button className="secondary" disabled={busy || !memberReady} onClick={() => setOpen(true)}>
          {t('capture.manual')}
        </button>
      </div>
      {/* 同じ写真を続けて選んでも読み込むよう、選んだら値を空にする */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={pickRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {progressText && (
        <div className="progress" role="status">
          <p className="muted">{progressText}</p>
          {stage.kind === 'ocr' && <progress max={1} value={stage.progress.progress} />}
        </div>
      )}
      {message && (
        <p className={message.kind === 'ok' ? 'ok' : 'error'} role={message.kind === 'ok' ? 'status' : 'alert'}>
          {message.text}
          {message.detail && (
            <>
              <br />
              <span className="small muted">
                {t('err.detail')}: {message.detail}
              </span>
            </>
          )}
        </p>
      )}

      {open && (
        <div className="editor">
          {photo && (
            <div className="scan-result-block">
              <img className="scan-result" src={photo.url} alt={t('form.photo')} />
              {/* 写真が悪かった時に撮り直す */}
              <button className="secondary retake-button" disabled={busy} onClick={retake}>
                {t('scan.retake')}
              </button>
            </div>
          )}
          {ocrText && (
            <details className="ocr-text">
              <summary>{t('ocr.showText')}</summary>
              <pre>{ocrText}</pre>
            </details>
          )}
          <LeadForm value={fields} onChange={setFields} lists={lists} member={member} leads={leads} />
          <div className="row">
            <button className="link" onClick={reset}>
              {t('form.clear')}
            </button>
            <button className="primary" disabled={saving || busy} onClick={() => void save()}>
              {t('form.save')}
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'adjust' && (
        <ScanModal
          image={stage.image}
          initialQuad={stage.quad}
          found={stage.found}
          onClose={() => setStage({ kind: 'idle' })}
          onRetake={retake}
          onApply={(quad, rotation) => void apply(stage.image, quad, rotation)}
        />
      )}
    </section>
  )
}
