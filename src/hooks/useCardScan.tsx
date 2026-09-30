import { useRef, useState, type ReactNode } from 'react'
import { describeError } from '../errors.ts'
import { isDesktop } from '../device.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Quad, RGBAImage } from '../scan/document.ts'
import { extractFields, type Extracted } from '../scan/extract.ts'
import { recognize, type OcrProgress } from '../scan/ocr.ts'
import { canvasToJpeg, findDocument, loadPhoto, makeDocument, toCanvas } from '../scan/scanImage.ts'
import { CameraModal } from '../components/CameraModal.tsx'
import { ScanModal } from '../components/ScanModal.tsx'

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'adjust'; image: RGBAImage; quad: Quad; found: boolean }
  | { kind: 'processing' }
  | { kind: 'ai' }
  | { kind: 'ocr'; progress: OcrProgress }

export type ScanMessage = { kind: 'ok' | 'error'; text: string; detail?: string } | null

interface Options {
  /** 書類のように補正した画像ができた */
  onPhoto: (blob: Blob) => void
  /** 文字を読み取った */
  onOcr: (text: string, found: Extracted) => void
  /** 画面に出す知らせ（null で消す） */
  onMessage: (message: ScanMessage) => void
  /** 撮り直す直前（前の写真の読み取り結果を消すため） */
  onRetake?: () => void
  /** AI で読み取るための API キー（空なら端末の中の OCR だけで読み取る） */
  aiKey: string
  /** 読み取り終わった時の知らせ（省略時は「読み取りました。内容を確認・修正…」） */
  doneText?: string
}

/**
 * 名刺・バッジの読み取りの流れ（新規登録と、編集の「撮り直し」で共通）。
 * 撮影・画像を選ぶ → 四隅を合わせる → 書類のように補正 → 文字を読み取る。
 * elements（ファイル選択の入力欄・カメラ・範囲を合わせる画面）を、使う側の画面に置く
 */
export function useCardScan({ onPhoto, onOcr, onMessage, onRetake, aiKey, doneText }: Options) {
  const { t } = useI18n()
  const cameraRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  /** パソコンのカメラの画面を開いているか */
  const [cameraOpen, setCameraOpen] = useState(false)
  /** 前回の画像を選んだ方法（撮影 / 画像を選ぶ）。「再撮影」で同じ方法を開く */
  const [source, setSource] = useState<'camera' | 'pick'>('camera')

  const start = (from: 'camera' | 'pick') => {
    setSource(from)
    // パソコンでは、ファイル選択の capture 指定でカメラが起動しないので、アプリの中のカメラ（インカメラ）で撮る
    if (from === 'camera' && isDesktop()) {
      setCameraOpen(true)
      return
    }
    ;(from === 'camera' ? cameraRef : pickRef).current?.click()
  }

  /** 撮り直す。写真がぶれた・読み取りがうまくいかなかった時のため。前回と同じ方法で開く */
  const retake = () => {
    onRetake?.()
    onMessage(null)
    setStage({ kind: 'idle' })
    start(source)
  }

  /**
   * 撮った・選んだ画像を読み込み、四隅を探して「範囲を合わせる」画面を出す。
   * guide は、パソコンのカメラで名刺を合わせた枠の位置（四隅を自動で見つけられない時の初期値）
   */
  const onFile = async (file: Blob | undefined, guide?: Quad) => {
    if (!file) return
    onMessage(null)
    setStage({ kind: 'loading' })
    try {
      const image = await loadPhoto(file)
      const detected = findDocument(image)
      const { quad, found } = !detected.found && guide ? { quad: guide, found: false } : detected
      setStage({ kind: 'adjust', image, quad, found })
    } catch (e) {
      console.error('[scan-load]', e)
      setStage({ kind: 'idle' })
      onMessage({ kind: 'error', text: t('scan.failed'), detail: describeError(e) })
    }
  }

  const apply = async (image: RGBAImage, quad: Quad, rotation: number) => {
    setStage({ kind: 'processing' })
    // 補正の計算で画面が固まる前に、「補正しています」を表示させる
    await new Promise((r) => setTimeout(r, 30))
    let canvas: HTMLCanvasElement
    let photo: Blob
    try {
      canvas = toCanvas(makeDocument(image, quad, rotation))
      photo = await canvasToJpeg(canvas)
      onPhoto(photo)
    } catch (e) {
      console.error('[scan-process]', e)
      setStage({ kind: 'idle' })
      onMessage({ kind: 'error', text: t('scan.failed'), detail: describeError(e) })
      return
    }
    const done = doneText ?? t('ocr.done')
    // AI が使える時（API キーがあり、ネットにつながっている）は AI で読み取る。
    // 使えなかったら、端末の中の OCR で読み取る（その理由は知らせる）
    let fellBack: string | null = null
    if (aiKey && navigator.onLine) {
      setStage({ kind: 'ai' })
      try {
        // AI の部品（SDK）は大きいので、使う時に読み込む
        const { readCardWithAi } = await import('../scan/ai.ts')
        const result = await readCardWithAi(photo, aiKey)
        onOcr(result.text, result.fields)
        onMessage({ kind: 'ok', text: `✨ ${done}` })
        setStage({ kind: 'idle' })
        return
      } catch (e) {
        console.error('[ai-read]', e)
        fellBack = (e as { reason?: string }).reason === 'auth' ? t('ai.fellBackKey') : t('ai.fellBack')
      }
    }
    setStage({ kind: 'ocr', progress: { phase: 'loading', progress: 0 } })
    try {
      const result = await recognize(canvas, (progress) => setStage({ kind: 'ocr', progress }))
      onOcr(result.text, extractFields(result.lines))
      onMessage({ kind: 'ok', text: fellBack ? `${fellBack} ${done}` : done })
    } catch (e) {
      console.error('[ocr]', e)
      onMessage({ kind: 'error', text: fellBack ? t('ai.bothFailed') : t('ocr.failed'), detail: describeError(e) })
    } finally {
      setStage({ kind: 'idle' })
    }
  }

  const busy = stage.kind !== 'idle' && stage.kind !== 'adjust'
  const progressText =
    stage.kind === 'loading'
      ? t('scan.loading')
      : stage.kind === 'processing'
        ? t('scan.processing')
        : stage.kind === 'ai'
          ? t('ai.reading')
          : stage.kind === 'ocr'
          ? t(stage.progress.phase === 'loading' ? 'ocr.loading' : 'ocr.recognizing', {
              p: Math.round(stage.progress.progress * 100),
            })
          : null

  const progress: ReactNode = progressText && (
    <div className="progress" role="status">
      <p className="muted">{progressText}</p>
      {stage.kind === 'ocr' && <progress max={1} value={stage.progress.progress} />}
    </div>
  )

  const elements: ReactNode = (
    <>
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

      {cameraOpen && (
        <CameraModal
          onClose={() => setCameraOpen(false)}
          onPickFile={() => {
            setCameraOpen(false)
            setSource('pick')
            pickRef.current?.click()
          }}
          onCapture={(blob, guide) => {
            setCameraOpen(false)
            void onFile(blob, guide)
          }}
        />
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
    </>
  )

  return { start, retake, busy, progress, elements }
}
