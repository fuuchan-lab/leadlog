import { useState } from 'react'
import { dateString, dayCount, normalizeRange, parseDate } from '../exhibitions.ts'
import { LOCALES } from '../i18n/context.ts'
import { useI18n } from '../i18n/useI18n.ts'

interface Props {
  startDate: string
  endDate: string
  onChange: (range: { startDate: string; endDate: string }) => void
}

/**
 * 開催日（初日〜最終日）を1行で表示し、押すとカレンダーを開く。
 * カレンダーで初日、最終日の順にタップすると決まる（逆の順でもよい。同じ日を2回で1日だけ）
 */
export function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  /** 初日をタップした後、最終日を待っている */
  const [pending, setPending] = useState<string | null>(null)
  const [month, setMonth] = useState(() => {
    const d = parseDate(startDate)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const locale = LOCALES[lang]
  const fmt = (s: string) => parseDate(s).toLocaleDateString(locale, { month: 'numeric', day: 'numeric', weekday: 'short' })
  const today = dateString(new Date())

  const tap = (day: string) => {
    if (pending === null) {
      setPending(day)
      return
    }
    onChange(normalizeRange(pending, day))
    setPending(null)
    setOpen(false)
  }

  // 月曜始まりのカレンダー（前月の空き + その月の日）
  const first = month.getDay() === 0 ? 6 : month.getDay() - 1
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => dateString(new Date(month.getFullYear(), month.getMonth(), i + 1))),
  ]
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }),
  )
  // 選んでいる範囲（最終日を待っている間は、初日だけ）
  const [from, to] = pending ? [pending, pending] : [startDate, endDate]

  return (
    <div className="range-picker">
      <button
        type="button"
        className="range-display"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
          setPending(null)
        }}
      >
        <span>📅 {fmt(startDate)} 〜 {fmt(endDate)}</span>
        <span className="muted small">{t('exhibition.dayCount', { n: dayCount({ startDate, endDate }) })}</span>
      </button>
      {open && (
        <div className="calendar" role="group" aria-label={t('exhibition.dates')}>
          <div className="row calendar-head">
            <button
              type="button"
              className="link"
              aria-label={t('calendar.prev')}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong>{month.toLocaleDateString(locale, { year: 'numeric', month: 'long' })}</strong>
            <button
              type="button"
              className="link"
              aria-label={t('calendar.next')}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <p className="calendar-hint" role="status">
            {pending ? t('calendar.pickEnd') : t('calendar.pickStart')}
          </p>
          <div className="calendar-grid">
            {weekdays.map((w, i) => (
              <span key={`w${i}`} className={`calendar-weekday${i >= 5 ? ' weekend' : ''}`}>
                {w}
              </span>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <span key={`e${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  className={[
                    'calendar-day',
                    day >= from && day <= to ? 'in-range' : '',
                    day === from || day === to ? 'edge' : '',
                    day === today ? 'today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={day >= from && day <= to}
                  onClick={() => tap(day)}
                >
                  {Number(day.slice(8))}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
