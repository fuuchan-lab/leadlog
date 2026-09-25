import { lazy, Suspense, useMemo } from 'react'
import { LOCALES } from '../i18n/context.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { dayCount, exhibitionDays, type Exhibition } from '../exhibitions.ts'
import type { Category } from '../settings.ts'
import { buildDashboard } from '../stats.ts'
import type { Lead } from '../types.ts'
import { LeadPhoto } from './LeadPhoto.tsx'

// グラフの部品（recharts）は大きいので別ファイルに分け、画面の他の部分を先に表示する
const LeadChart = lazy(() => import('./LeadChart.tsx'))

interface Props {
  leads: Lead[]
  /** この端末で開いている展示会（まだ無ければ null） */
  exhibition: Exhibition | null
  importance: Category[]
  onOpenSettings: () => void
}

/**
 * ダッシュボード（頭痛ログの気圧のカードの位置）。開いている展示会の会期中のリード件数と、
 * 時間帯別の棒グラフ、重要度別・登録者別の件数を表示する。
 */
export function StatusCard({ leads, exhibition, importance, onOpenSettings }: Props) {
  const { t } = useI18n()
  if (!exhibition) {
    return (
      <section className="card">
        <h2>{t('dash.title')}</h2>
        <p className="muted">{t('dash.noExhibition')}</p>
        <button className="primary" onClick={onOpenSettings}>
          {t('dash.openSettings')}
        </button>
      </section>
    )
  }
  return <Dashboard leads={leads} ex={exhibition} importance={importance} />
}

function Dashboard({ leads, ex, importance }: { leads: Lead[]; ex: Exhibition; importance: Category[] }) {
  const { t, lang } = useI18n()
  // 他の端末の登録が同期で増えた時も、表示を作り直す。1分ごとに「今日」を判定し直す必要はない（再描画のたびに計算する）
  const d = useMemo(() => buildDashboard(leads, ex), [leads, ex])
  const days = exhibitionDays(ex)
  const fmt = (ts: number) => new Date(ts).toLocaleDateString(LOCALES[lang], { month: 'numeric', day: 'numeric', weekday: 'short' })
  const unrated = d.byImportance.get('') ?? 0

  return (
    <section className="card">
      <div className="row dash-head">
        <h2>{ex.name || t('dash.title')}</h2>
        {/* 展示会ロゴ（設定の展示会でアップロードしたもの）を右上に小さく */}
        {ex.logoId && <LeadPhoto key={ex.logoId} id={ex.logoId} className="dash-logo" alt={t('exhibition.logo')} />}
      </div>
      <p className="muted small">
        {ex.location && (
          <>
            📍 {ex.location}
            <br />
          </>
        )}
        {t('dash.period', {
          from: fmt(days[0]),
          to: fmt(days[days.length - 1]),
          days: dayCount(ex),
          start: ex.startHour,
          end: ex.endHour,
        })}
      </p>

      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">{t('dash.total')}</span>
          <span className="big">
            {d.total}
            <span className="unit"> {t('dash.unit')}</span>
          </span>
        </div>
        <div className={`kpi kpi-today${d.todayIndex === null ? ' kpi-off' : ''}`}>
          <span className="kpi-label">
            {t('dash.today')}
            {d.todayIndex !== null ? `（${t('dash.dayN', { n: d.todayIndex + 1 })}）` : `（${t('dash.notInPeriod')}）`}
          </span>
          <span className="big">
            {d.today}
            <span className="unit"> {t('dash.unit')}</span>
          </span>
        </div>
      </div>

      <h3 className="chart-title">{t('chart.title')}</h3>
      {d.total === 0 ? (
        <p className="muted">{t('chart.empty')}</p>
      ) : (
        <Suspense fallback={<div className="chart-loading" aria-busy="true" />}>
          <LeadChart dashboard={d} />
        </Suspense>
      )}
      {d.outside > 0 && <p className="muted small">{t('dash.outside', { n: d.outside })}</p>}

      {d.total > 0 && (
        <div className="breakdown">
          <div>
            <p className="breakdown-title">{t('dash.byImportance')}</p>
            <ul className="stat-chips">
              {importance.map((c) => (
                <li key={c.id}>
                  <span className="chip-dot" style={{ background: c.color }} />
                  {c.label} <strong>{d.byImportance.get(c.id) ?? 0}</strong>
                </li>
              ))}
              {unrated > 0 && (
                <li>
                  <span className="chip-dot" style={{ background: '#cbd5e1' }} />
                  {t('dash.unrated')} <strong>{unrated}</strong>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="breakdown-title">{t('dash.byMember')}</p>
            <ul className="stat-chips">
              {d.byMember.map((m) => (
                <li key={m.deviceId} title={`${m.device} #${m.deviceId}`}>
                  👤 {m.member || `#${m.deviceId.slice(0, 4)}`} <strong>{m.count}</strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}
