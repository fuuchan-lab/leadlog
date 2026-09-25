import { useI18n } from '../i18n/useI18n.ts'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** 付箋のような見た目の、複数行のメモ欄 */
export function StickyNoteField({ value, onChange, placeholder }: Props) {
  const { t } = useI18n()
  return (
    <textarea
      className="sticky"
      rows={2}
      maxLength={500}
      aria-label={t('common.note')}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
