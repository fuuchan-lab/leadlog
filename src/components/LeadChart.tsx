import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Dashboard } from '../stats.ts'

/** 会期の日ごとの色（1日目・2日目・3日目…） */
const DAY_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#eab308', '#14b8a6']

interface Props {
  dashboard: Dashboard
}

/** 時間帯（横軸）ごとの件数を、会期の日ごとの棒で並べる。今日の棒は濃く、他の日は少し薄くする */
export default function LeadChart({ dashboard }: Props) {
  const { t } = useI18n()
  const { rows, perDay, todayIndex } = dashboard
  const data = rows.map((r) => ({ ...r, label: `${r.hour}` }))
  const max = Math.max(1, ...rows.flatMap((r) => perDay.map((_, d) => r[`day${d}`])))

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
          <Tooltip
            cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(h) => `${h}:00 – ${Number(h) + 1}:00`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {perDay.map((_, d) => (
            <Bar
              key={d}
              dataKey={`day${d}`}
              name={t('chart.day', { n: d + 1 })}
              fill={DAY_COLORS[d % DAY_COLORS.length]}
              fillOpacity={todayIndex === null || todayIndex === d ? 1 : 0.55}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
