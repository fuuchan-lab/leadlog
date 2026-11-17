import { useI18n } from '../i18n/useI18n.ts'

export interface PieSlice {
  id: string
  label: string
  color: string
  count: number
}

/** ドーナツの大きさ（SVG の座標）。外側の半径と、輪の太さ */
const SIZE = 120
const R = 54
const WIDTH = 20

/** 中心からの角度（12時の位置から時計回り、ラジアン）の点 */
const at = (angle: number, r: number) => ({
  x: SIZE / 2 + r * Math.sin(angle),
  y: SIZE / 2 - r * Math.cos(angle),
})

/** start から end までの、輪の一切れの形 */
function slicePath(start: number, end: number): string {
  const r0 = R - WIDTH
  const large = end - start > Math.PI ? 1 : 0
  const a = at(start, R)
  const b = at(end, R)
  const c = at(end, r0)
  const d = at(start, r0)
  return `M${a.x},${a.y} A${R},${R} 0 ${large} 1 ${b.x},${b.y} L${c.x},${c.y} A${r0},${r0} 0 ${large} 0 ${d.x},${d.y} Z`
}

/**
 * 重要度別の件数のドーナツ。真ん中に合計、横に重要度ごとの件数と割合を並べる
 * （色だけで見分けなくても読めるように、凡例に数を必ず出す）
 */
export function ImportancePie({ slices }: { slices: PieSlice[] }) {
  const { t } = useI18n()
  const total = slices.reduce((n, s) => n + s.count, 0)
  const shown = slices.filter((s) => s.count > 0)
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  // 12時の位置から時計回りに、件数の割合で切り分ける
  const arcs = shown.reduce<{ s: PieSlice; start: number; end: number }[]>((list, s) => {
    const start = list.length ? list[list.length - 1].end : 0
    return [...list, { s, start, end: start + (s.count / total) * Math.PI * 2 }]
  }, [])

  return (
    <div className="pie">
      <svg
        className="pie-chart"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${t('dash.byImportance')}: ${shown.map((s) => `${s.label} ${s.count}`).join(', ')}`}
      >
        {total === 0 && <circle cx={SIZE / 2} cy={SIZE / 2} r={R - WIDTH / 2} fill="none" stroke="var(--border)" strokeWidth={WIDTH} />}
        {arcs.length === 1 ? (
          // 1つだけの時は、切れ目のない輪にする（円弧で一周は描けないため）
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R - WIDTH / 2} fill="none" stroke={arcs[0].s.color} strokeWidth={WIDTH}>
            <title>{`${arcs[0].s.label} ${arcs[0].s.count}`}</title>
          </circle>
        ) : (
          arcs.map(({ s, start, end }) => (
            // 切れ目に、カードの地の色で細いすき間を入れる（隣り合う色を見分けやすく）
            <path key={s.id} d={slicePath(start, end)} fill={s.color} stroke="var(--card)" strokeWidth={2} strokeLinejoin="round">
              <title>{`${s.label} ${s.count}（${pct(s.count)}%）`}</title>
            </path>
          ))
        )}
        <text x={SIZE / 2} y={SIZE / 2 - 2} textAnchor="middle" className="pie-total">
          {total}
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="pie-unit">
          {t('dash.unit')}
        </text>
      </svg>
      <ul className="pie-legend">
        {slices.map((s) => (
          <li key={s.id} className={s.count === 0 ? 'muted' : undefined}>
            <span className="chip-dot" style={{ background: s.color }} />
            <span className="pie-label">{s.label}</span>
            <strong>{s.count}</strong>
            <span className="muted small pie-pct">{pct(s.count)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
