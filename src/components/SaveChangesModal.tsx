import { useEffect } from 'react'
import { useI18n } from '../i18n/useI18n.ts'

interface Props {
  /** 「はい」: 保存してから戻る */
  onSave: () => void
  /** 「いいえ」: 保存せずに戻る */
  onDiscard: () => void
  /** 外側を押した・Esc: 戻らずに設定の画面のまま */
  onCancel: () => void
}

/** 設定の画面で、保存していない変更がある時に「戻る」を押すと出す確認 */
export function SaveChangesModal({ onSave, onDiscard, onCancel }: Props) {
  const { t } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-card confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-changes-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-changes-title">{t('leave.title')}</h2>
        <p className="muted small">{t('leave.help')}</p>
        <div className="confirm-actions">
          <button className="secondary" onClick={onDiscard}>
            {t('leave.no')}
          </button>
          <button className="primary" onClick={onSave} autoFocus>
            {t('leave.yes')}
          </button>
        </div>
      </div>
    </div>
  )
}
