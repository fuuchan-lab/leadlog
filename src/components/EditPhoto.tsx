import { useEffect, useState } from 'react'
import { useCardScan, type ScanMessage } from '../hooks/useCardScan.tsx'
import { useI18n } from '../i18n/useI18n.ts'
import type { Extracted } from '../scan/extract.ts'
import { LeadPhoto } from './LeadPhoto.tsx'

interface Props {
  /** 保存済みの画像（無ければ手入力で登録したリード） */
  photoId?: string
  /** 撮り直した画像（まだ保存していない） */
  photo: Blob | null
  onPhoto: (blob: Blob) => void
  onOcr: (text: string, found: Extracted) => void
  /** AI で読み取るための API キー */
  aiKey: string
}

/**
 * 編集中のリードの、名刺・バッジの画像。「撮り直し」「画像を選ぶ」で差し替えられる
 * （手入力で登録したリードには、あとから画像を付けられる）。差し替えは編集を保存した時に反映する
 */
export function EditPhoto({ photoId, photo, onPhoto, onOcr, aiKey }: Props) {
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
      {scan.elements}
    </div>
  )
}
