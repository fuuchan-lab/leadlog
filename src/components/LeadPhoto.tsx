import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import { loadLeadPhoto, reloadLeadPhoto } from '../photos.ts'

interface Props {
  id: string
  className: string
  /** 画像が無い時に、理由の文言を出すか（ポップアップの大きい表示で使う） */
  explain?: boolean
  onClick?: () => void
  /** 画像の説明（読み上げ用）。省略時は「読み取った画像」 */
  alt?: string
}

/** 保存した画像（名刺・バッジの補正後の画像、展示会ロゴ）。className で表示の大きさを切り替える */
export function LeadPhoto({ id, className, explain = false, onClick, alt }: Props) {
  const { t } = useI18n()
  const [state, setState] = useState<{ id: string; url: string | null; done: boolean }>({ id, url: null, done: false })
  /** 表示に失敗して、ドライブから取り直したか（1回だけ） */
  const retried = useRef(false)
  const objectUrl = useRef<string | null>(null)

  const show = useCallback(
    (blob: Blob | null) => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = blob ? URL.createObjectURL(blob) : null
      setState({ id, url: objectUrl.current, done: true })
    },
    [id],
  )

  useEffect(() => {
    let cancelled = false
    retried.current = false
    void loadLeadPhoto(id).then((blob) => {
      if (!cancelled) show(blob)
    })
    return () => {
      cancelled = true
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
  }, [id, show])

  /**
   * 画像を表示できなかった（端末に保存した画像が読めなくなっていた等）。「?」の印を出したままにせず、
   * 1回だけドライブから取り直す。それでも駄目なら表示しない
   */
  const onError = () => {
    if (retried.current) {
      show(null)
      return
    }
    retried.current = true
    setState({ id, url: null, done: false })
    void reloadLeadPhoto(id).then(show)
  }

  const current = state.id === id ? state : { url: null, done: false }
  if (current.url) {
    const img = <img className={className} src={current.url} alt={alt ?? t('form.photo')} onError={onError} />
    return onClick ? (
      <button type="button" className="photo-button" onClick={onClick} aria-label={alt ?? t('form.photo')}>
        {img}
      </button>
    ) : (
      img
    )
  }
  if (!explain) return null
  return <p className="muted small">{current.done ? t('popup.photoMissing') : t('popup.photoLoading')}</p>
}
