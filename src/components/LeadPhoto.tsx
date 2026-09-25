import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import { loadLeadPhoto } from '../photos.ts'

interface Props {
  id: string
  className: string
  /** 画像が無い時に、理由の文言を出すか（ポップアップの大きい表示で使う） */
  explain?: boolean
  onClick?: () => void
}

/** 名刺・バッジの補正後の画像。className で一覧のサムネイルとポップアップの大きい表示を切り替える */
export function LeadPhoto({ id, className, explain = false, onClick }: Props) {
  const { t } = useI18n()
  const [state, setState] = useState<{ id: string; url: string | null; done: boolean }>({ id, url: null, done: false })

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void loadLeadPhoto(id).then((blob) => {
      if (cancelled) return
      if (blob) objectUrl = URL.createObjectURL(blob)
      setState({ id, url: objectUrl, done: true })
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  const current = state.id === id ? state : { url: null, done: false }
  if (current.url) {
    return onClick ? (
      <button type="button" className="photo-button" onClick={onClick} aria-label={t('form.photo')}>
        <img className={className} src={current.url} alt={t('form.photo')} />
      </button>
    ) : (
      <img className={className} src={current.url} alt={t('form.photo')} />
    )
  }
  if (!explain) return null
  return <p className="muted small">{current.done ? t('popup.photoMissing') : t('popup.photoLoading')}</p>
}
