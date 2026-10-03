import { useEffect, useState } from 'react'
import { useCardScan, type ScanMessage } from '../hooks/useCardScan.tsx'
import { useI18n } from '../i18n/useI18n.ts'
import type { Extracted } from '../scan/extract.ts'
import { AiReanalyze } from './AiReanalyze.tsx'
import { LeadPhoto } from './LeadPhoto.tsx'
import { StatusMessage } from './StatusMessage.tsx'

interface Props {
  /** 保存済みの画像（無ければ手入力で登録したリード） */
  photoId?: string
  /** 撮り直した画像（まだ保存していない） */
  photo: Blob | null
  onPhoto: (blob: Blob) => void
  onOcr: (text: string, found: Extracted) => void
  /** AI で読み取るための API キー */
  aiKey: string
  /** 今の入力欄の内容（AI の再解析の結果と比べる） */
  current: Extracted
  /** AI の再解析で選んだ項目を、入力欄に入れる */
  onApplyAi: (patch: Partial<Extracted>) => void
}

/**
 * 編集中のリードの、名刺・バッジの画像。「撮り直し」「画像を選ぶ」で差し替えられる
 * （手入力で登録したリードには、あとから画像を付けられる）。差し替えは編集を保存した時に反映する
 */
export function EditPhoto({ photoId, photo, onPhoto, onOcr, aiKey, current, onApplyAi }: Props) {
  const { t } = useI18n()
  const [message, setMessage] = useState<ScanMessage>(null)
  const scan = useCardScan({ onPhoto, onOcr, onMessage: setMessage, aiKey, doneText: t('edit.ocrDone') })
  const [preview, setPreview] = useState<{ photo: Blob; url: string } | null>(null)

  useEffect(() => {
    if (!photo) return
    const url = URL.createObjectURL(photo)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview({ photo, url })
    return () => URL.revokeObjectURL(url)
  }, [photo])
  const url = photo && preview?.photo === photo ? preview.url : null

  const hasPhoto = photo !== null || photoId !== undefined

  return (
    <div className="scan-result-block">
      {url ? (
        <img className="scan-result" src={url} alt={t('form.photo')} />
      ) : (
        photoId && <LeadPhoto id={photoId} className="scan-result" alt={t('form.photo')} />
      )}
      {photo && <p className="muted small">{t('edit.photoReplaced')}</p>}
      <div className="capture-buttons edit-photo-buttons">
        <button type="button" className="secondary" disabled={scan.busy} onClick={() => scan.start('camera')}>
          {hasPhoto ? t('edit.retake') : t('edit.addPhoto')}
        </button>
        <button type="button" className="secondary" disabled={scan.busy} onClick={() => scan.start('pick')}>
          {t('capture.pick')}
        </button>
      </div>
      {/* 保存済み（または撮り直した）画像を、AI でもう一度読み取る。結果は選んでから反映する */}
      {aiKey && hasPhoto && !scan.busy && (
        <AiReanalyze photoId={photoId} photo={photo} aiKey={aiKey} current={current} onApply={onApplyAi} />
      )}
      {scan.progress}
      {message && <StatusMessage kind={message.kind} text={message.text} detail={message.detail} />}
      {scan.elements}
    </div>
  )
}
