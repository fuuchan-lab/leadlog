import type { Category } from '../settings.ts'

interface Props {
  label: string
  options: Category[]
  value: string
  onChange: (id: string) => void
}

/** 重要度・顧客の種類を選ぶボタンの並び。選んでいるものをもう一度押すと未選択に戻る */
export function CategoryPicker({ label, options, value, onChange }: Props) {
  return (
    <div className="field" role="radiogroup" aria-label={label}>
      {label}
      <div className="chips">
        {options.map((c) => {
          const on = c.id === value
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`chip${on ? ' on' : ''}`}
              style={on ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
              onClick={() => onChange(on ? '' : c.id)}
            >
              {!on && <span className="chip-dot" style={{ background: c.color }} />}
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 複数選べるボタンの並び（興味のある分野） */
export function MultiCategoryPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Category[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="field" role="group" aria-label={label}>
      {label}
      <div className="chips">
        {options.map((c) => {
          const on = value.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              className={`chip${on ? ' on' : ''}`}
              style={on ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
              onClick={() => onChange(on ? value.filter((id) => id !== c.id) : [...value, c.id])}
            >
              {on ? '✓ ' : ''}
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 一覧などに出す小さなラベル */
export function CategoryTag({ category }: { category: Category | undefined }) {
  if (!category) return null
  return (
    <span className="tag" style={{ background: category.color }}>
      {category.label}
    </span>
  )
}
