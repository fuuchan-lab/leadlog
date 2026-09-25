import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'

interface Props {
  startHour: number
  endHour: number
  onChange: (range: { startHour: number; endHour: number }) => void
}

const HOURS = Array.from({ length: 25 }, (_, h) => h)

/**
 * 開場時間を1行で選ぶ。0時〜24時を横に並べ（横にスクロールできる）、開始、終了の順にタップすると決まる。
 * 逆の順でもよい。同じ時刻を2回タップした場合は1時間にする
 */
export function HourRangePicker({ startHour, endHour, onChange }: Props) {
  const { t } = useI18n()
  const [pending, setPending] = useState<number | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  // 最初に、選んでいる時間帯が見える位置までスクロールする
  useEffect(() => {
    const row = rowRef.current
    const cell = row?.querySelector<HTMLElement>(`[data-hour="${Math.max(0, startHour - 1)}"]`)
    if (row && cell) row.scrollLeft = cell.offsetLeft - row.offsetLeft
    // 初めて表示した時だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tap = (h: number) => {
    if (pending === null) {
      setPending(h)
      return
    }
    let [a, b] = pending <= h ? [pending, h] : [h, pending]
    if (a === b) b = Math.min(24, a + 1)
    if (a === 24) a = 23
    onChange({ startHour: a, endHour: b })
    setPending(null)
  }

  const [from, to] = pending === null ? [startHour, endHour] : [pending, pending]

  return (
    <div className="hour-picker">
      <div className="row hour-summary">
        <span>
          🕘 {startHour}:00 〜 {endHour}:00
        </span>
        <span className="muted small" role="status">
          {pending === null ? t('hours.pickStart') : t('hours.pickEnd')}
        </span>
      </div>
      <div className="hour-row" ref={rowRef} role="group" aria-label={t('exhibition.hours')}>
        {HOURS.map((h) => (
          <button
            key={h}
            type="button"
            data-hour={h}
            className={['hour-cell', h >= from && h <= to ? 'in-range' : '', h === from || h === to ? 'edge' : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={h >= from && h <= to}
            onClick={() => tap(h)}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  )
}
