import { useState } from 'react'
import type { Exhibition } from '../exhibitions.ts'
import { useCardScan, type ScanMessage } from '../hooks/useCardScan.tsx'
import type { NewLeadExtras } from '../hooks/useLeads.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { EMPTY_FIELDS, hasContent, type Lead, type LeadFields } from '../types.ts'
import { LeadForm, type FormLists } from './LeadForm.tsx'

interface Props {
  lists: FormLists
  /** この端末の登録者名 */
  member: string
  leads: Lead[]
  /** 登録先の展示会（この端末で開いている展示会。まだ無ければ null） */
  exhibition: Exhibition | null
  /** 登録者名が入っているか（入っていなければ登録させない） */
  memberReady: boolean
  onSave: (fields: LeadFields, extras: NewLeadExtras) => Promise<Lead>
}

/**
 * 名刺・バッジの読み取りと、新しいリードの入力。
 * 撮影 → 四隅を合わせる → 書類のように補正 → 文字を読み取って入力欄を埋める → 確認して保存
 */
export function CaptureCard({ lists, member, leads, exhibition, memberReady, onSave }: Props) {
  const { t } = useI18n()
  const [fields, setFields] = useState<LeadFields>(EMPTY_FIELDS)
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null)
  const [ocrText, setOcrText] = useState('')
  const [message, setMessage] = useState<ScanMessage>(null)
  const [saving, setSaving] = useState(false)
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

  /** 入力中（保存していない）の内容があるか */
  const hasDraft = open && (photo !== null || JSON.stringify(fields) !== JSON.stringify(EMPTY_FIELDS))

  /**
   * 「撮影する」「画像を選ぶ」は、新しいリードの読み取りを始める。
   * 前の名刺の内容が入力欄に残っていると、読み取り結果が空欄にしか入らず前の内容が残ってしまうので、
   * 入力欄を空にしてから読み取る（保存していない内容があれば、破棄してよいか確かめる）
   */
  const startNew = (from: 'camera' | 'pick') => {
    if (hasDraft && !confirm(t('capture.confirmDiscard'))) return
    reset()
    setMessage(null)
    scan.start(from)
  }

  /**
   * 撮り直す時に、前の写真の読み取り結果を消す。
   * OCR が入れた欄のうち、手で直していないものは消す（新しい写真の読み取り結果を入れ直すため）。
   * 手で入力した欄（重要度・メモなど）はそのまま残す
   */
  const clearOcr = () => {
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
  }

  const scan = useCardScan({
    onPhoto: (blob) => {
      setPhotoBlob(blob)
      setOpen(true)
    },
    onOcr: (text, found) => {
      setOcrText(text)
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
    },
    onMessage: setMessage,
    onRetake: clearOcr,
  })
  const busy = scan.busy

  const save = async () => {
    if (!hasContent(fields)) {
      setMessage({ kind: 'error', text: t('form.needSomething') })
      return
    }
    setSaving(true)
    try {
      const lead = await onSave(fields, {
        photo: photo?.blob ?? null,
        ocrText,
        exhibitionId: exhibition?.id ?? '',
        exhibition: exhibition?.name ?? '',
      })
      setMessage({ kind: 'ok', text: t('form.saved', { name: lead.name || lead.company || lead.email || lead.phone }) })
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card">
      <h2 className="form-title">{t('capture.title')}</h2>
      {/* どの展示会に登録するのか、読み取る前に分かるようにする */}
      <p className={exhibition ? 'capture-exhibition' : 'capture-exhibition capture-exhibition-none'}>
        <span className="capture-exhibition-label">{t('capture.exhibition')}</span>
        <strong>{exhibition ? exhibition.name || t('exhibition.untitled') : t('capture.noExhibition')}</strong>
      </p>
      <p className="muted small">{t('capture.help')}</p>
      {!memberReady && <p className="banner banner-caution">{t('capture.needMember')}</p>}
      <div className="capture-buttons">
        <button className="primary" disabled={busy || !memberReady} onClick={() => startNew('camera')}>
          {t('capture.camera')}
        </button>
        <button className="secondary" disabled={busy || !memberReady} onClick={() => startNew('pick')}>
          {t('capture.pick')}
        </button>
        <button className="secondary" disabled={busy || !memberReady} onClick={() => setOpen(true)}>
          {t('capture.manual')}
        </button>
      </div>
      {scan.progress}
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
              <button className="secondary retake-button" disabled={busy} onClick={scan.retake}>
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

      {scan.elements}
    </section>
  )
}
