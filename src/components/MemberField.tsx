import { useI18n } from '../i18n/useI18n.ts'
import type { Category } from '../settings.ts'

interface Props {
  value: string
  onChange: (name: string) => void
  /** 選べる登録者の一覧（設定の「登録者管理」） */
  members: Category[]
  ariaLabel?: string
  placeholder?: string
}

/**
 * 担当者の入力欄。登録者一覧の中から選べる（右の ▼）。一覧に無い名前は、そのまま入力もできる。
 * 入力の候補（datalist#member-list）は、呼び出し側の画面に置く
 */
export function MemberField({ value, onChange, members, ariaLabel, placeholder }: Props) {
  const { t } = useI18n()
  return (
    <span className="member-field">
      <input
        type="text"
        list="member-list"
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {members.length > 0 && (
        <select
          className="member-picker"
          aria-label={t('field.pickMember')}
          title={t('field.pickMember')}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value)
          }}
        >
          <option value="">▼</option>
          {members.map((m) => (
            <option key={m.id} value={m.label}>
              {m.label}
            </option>
          ))}
        </select>
      )}
    </span>
  )
}
