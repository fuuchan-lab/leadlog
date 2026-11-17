import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import type { Category } from '../settings.ts'
import type { Dashboard, HourRow } from '../stats.ts'

/** 未評価（重要度を選んでいない・削除した重要度）の色。重要度別の件数の印と同じ */
const UNRATED_COLOR = '#cbd5e1'
const UNRATED = ''

/** グラフの余白（目盛りの文字の分）。縦の目盛りは左、時刻は下 */
const PAD = { top: 8, right: 4, bottom: 20, left: 26 }
/** 時間帯の間のすき間（時間帯の幅に対する割合）と、日ごとの棒の間のすき間 */
const GROUP_GAP = 0.18
const BAR_GAP = 1

interface Props {
  dashboard: Dashboard
  /** 重要度（A〜E など。棒の色分けと凡例に使う） */
  importance: Category[]
}

interface Series {
  id: string
  label: string
  color: string
}

/** 縦軸の目盛りの間隔。目盛りが 5 本ほどになる、1・2・5 の倍数 */
function tickStep(top: number): number {
  for (let base = 1; ; base *= 10) {
    for (const m of [1, 2, 5]) if (top / (base * m) <= 5) return base * m
  }
}

/** 画面の幅に合わせて描く（文字がつぶれないよう、伸び縮みでなく描き直す） */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(200, Math.round(el.clientWidth)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * 時間帯（横軸）ごとの件数を、会期の日ごとの棒で並べる（左から1日目・2日目…）。
 * 棒は重要度で色分けして積み上げる。今日の棒は濃く、他の日は少し薄くする。
 * グラフの部品（ライブラリ）は大きいので使わず、SVG で直接描く
 */
export default function LeadChart({ dashboard, importance }: Props) {
  const { t } = useI18n()
  const { rows, perDay, todayIndex } = dashboard
  const [boxRef, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)
  // スマホの横向き（高さが低い）は、入力欄が隠れないようにグラフを低くする
  const height = typeof matchMedia === 'function' && matchMedia('(max-height: 500px) and (orientation: landscape)').matches ? 160 : 220

  const known = new Set(importance.map((c) => c.id))
  /** 重要度 ID の件数。一覧に無い（削除した）重要度は未評価に数える */
  const countOf = (r: HourRow, d: number, id: string) =>
    id === UNRATED
      ? Object.entries(r.importance[d] ?? {}).reduce((n, [k, v]) => (known.has(k) ? n : n + v), 0)
      : (r.importance[d]?.[id] ?? 0)
  // 積み上げは下から A, B, C… の順。未評価は一番上
  const series: Series[] = [
    ...importance.map((c) => ({ id: c.id, label: c.label, color: c.color })),
    { id: UNRATED, label: t('dash.unrated'), color: UNRATED_COLOR },
  ]
  const hasUnrated = rows.some((r) => perDay.some((_, d) => countOf(r, d, UNRATED) > 0))
  const legend = hasUnrated ? series : series.slice(0, -1)

  const max = Math.max(1, ...rows.flatMap((r) => perDay.map((_, d) => r[`day${d}`])))
  const step = tickStep(Math.max(4, Math.ceil(max * 1.15)))
  const top = Math.ceil(Math.max(4, Math.ceil(max * 1.15)) / step) * step
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)

  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const groupW = plotW / Math.max(1, rows.length)
  const days = Math.max(1, perDay.length)
  const barW = Math.max(1, (groupW * (1 - GROUP_GAP) - BAR_GAP * (days - 1)) / days)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const groupX = (i: number) => PAD.left + i * groupW
  // 時刻の文字が重なる時は、間引いて出す
  const labelEvery = Math.max(1, Math.ceil(28 / groupW))

  /** 指やマウスの位置の時間帯 */
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - box.left - PAD.left) / groupW)
    setActive(i >= 0 && i < rows.length ? i : null)
  }

  const row = active === null ? null : rows[active]
  // 吹き出しは、触れた時間帯の横に出す（右半分なら左側に）
  const tipLeft = active === null ? 0 : groupX(active) + groupW / 2
  const tipOnLeft = tipLeft > width / 2

  return (
    <div className="lead-chart" ref={boxRef}>
      <div className="lead-chart-stage" style={{ height }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={t('chart.aria')}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === 0 ? undefined : '3 3'} />
              <text x={PAD.left - 4} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)">
                {v}
              </text>
            </g>
          ))}
          {active !== null && <rect x={groupX(active)} y={PAD.top} width={groupW} height={plotH} fill="rgba(148, 163, 184, 0.15)" />}
          {rows.map((r, i) => (
            <g key={r.hour}>
              {/* 日ごとに1本の棒にし、その中を重要度で積み上げる */}
              {perDay.map((_, d) => {
                const x = groupX(i) + (groupW * GROUP_GAP) / 2 + d * (barW + BAR_GAP)
                const opacity = todayIndex === null || todayIndex === d ? 1 : 0.55
                let base = 0
                return series.map((s) => {
                  const n = countOf(r, d, s.id)
                  if (n === 0) return null
                  const rect = <rect key={`${d}-${s.id}`} x={x} y={y(base + n)} width={barW} height={y(base) - y(base + n)} fill={s.color} fillOpacity={opacity} />
                  base += n
                  return rect
                })
              })}
              {i % labelEvery === 0 && (
                <text x={groupX(i) + groupW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {r.hour}
                  {t('chart.hourSuffix')}
                </text>
              )}
            </g>
          ))}
        </svg>
        {row && (
          <div
            className="chart-tooltip chart-tooltip-float"
            style={tipOnLeft ? { right: width - tipLeft + 8 } : { left: tipLeft + 8 }}
            role="status"
          >
            <p className="chart-tooltip-title">
              {row.hour}:00 – {row.hour + 1}:00
            </p>
            {perDay.map((_, d) => {
              const parts = series.map((s) => ({ s, n: countOf(row, d, s.id) })).filter((p) => p.n > 0)
              return (
                <p key={d} className={todayIndex === d ? 'chart-tooltip-today' : undefined}>
                  {t('chart.day', { n: d + 1 })}: <strong>{row[`day${d}`]}</strong>
                  {parts.map(({ s, n }) => (
                    <span key={s.id} className="chart-tooltip-part">
                      <span className="chip-dot" style={{ background: s.color }} />
                      {s.label} {n}
                    </span>
                  ))}
                </p>
              )
            })}
          </div>
        )}
      </div>
      <ul className="stat-chips chart-legend">
        {legend.map((s) => (
          <li key={s.id}>
            <span className="chip-dot" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <p className="muted small chart-note">{t(todayIndex === null ? 'chart.dayOrder' : 'chart.dayOrderToday')}</p>
    </div>
  )
}
