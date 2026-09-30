import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Category } from '../settings.ts'
import type { Dashboard, HourRow } from '../stats.ts'

/** 未評価（重要度を選んでいない・削除した重要度）の色。重要度別の件数の印と同じ */
const UNRATED_COLOR = '#cbd5e1'
const UNRATED = ''

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

/**
 * 時間帯（横軸）ごとの件数を、会期の日ごとの棒で並べる（左から1日目・2日目…）。
 * 棒は重要度で色分けして積み上げる。今日の棒は濃く、他の日は少し薄くする
 */
export default function LeadChart({ dashboard, importance }: Props) {
  const { t } = useI18n()
  const { rows, perDay, todayIndex } = dashboard
  const data = rows.map((r) => ({ ...r, label: `${r.hour}` }))
  const max = Math.max(1, ...rows.flatMap((r) => perDay.map((_, d) => r[`day${d}`])))

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

  const renderTooltip = ({ active, label }: TooltipContentProps) => {
    const row = rows.find((r) => `${r.hour}` === `${label}`)
    if (!active || !row) return null
    return (
      <div className="chart-tooltip">
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
    )
  }

  return (
    <div className="lead-chart" role="img" aria-label={t('chart.aria')}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -24 }} barCategoryGap="18%" barGap={1}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickFormatter={(h: string) => `${h}${t('chart.hourSuffix')}`}
            stroke="var(--border)"
          />
          <YAxis
            allowDecimals={false}
            domain={[0, Math.max(4, Math.ceil(max * 1.15))]}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            stroke="var(--border)"
          />
          <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }} content={renderTooltip} />
          {/* 日ごとに1本の棒（stackId）にし、その中を重要度で積み上げる */}
          {perDay.flatMap((_, d) =>
            series.map((s) => (
              <Bar
                key={`${d}-${s.id}`}
                stackId={`day${d}`}
                dataKey={(r: HourRow) => countOf(r, d, s.id)}
                name={`${t('chart.day', { n: d + 1 })} ${s.label}`}
                fill={s.color}
                fillOpacity={todayIndex === null || todayIndex === d ? 1 : 0.55}
                isAnimationActive={false}
              />
            )),
          )}
        </BarChart>
      </ResponsiveContainer>
      <ul className="stat-chips chart-legend">
        {legend.map((s) => (
          <li key={s.id}>
            <span className="chip-dot" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
      <p className="muted small chart-note">
        {t(todayIndex === null ? 'chart.dayOrder' : 'chart.dayOrderToday')}
      </p>
    </div>
  )
}
