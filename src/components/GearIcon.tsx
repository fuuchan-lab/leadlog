import { useId } from 'react'

/** 立体的な金属風の歯車。左上から光が当たる想定で、面のグラデーションと縁のハイライト・影を付けている */
export function GearIcon({ size = 28 }: { size?: number }) {
  const uid = useId()
  const face = `${uid}-face`
  const raised = `${uid}-raised`
  const sunken = `${uid}-sunken`
  const hole = `${uid}-hole`

  return (
    <svg className="gear" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        {/* 歯車全体の面。左上が明るく右下が暗い */}
        <linearGradient id={face} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="20" y2="22">
          <stop offset="0" style={{ stopColor: 'var(--gear-light)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--gear-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gear-dark)' }} />
        </linearGradient>
        {/* 盛り上がった縁: 左上が白く、右下が暗い */}
        <linearGradient id={raised} gradientUnits="userSpaceOnUse" x1="6" y1="5" x2="18" y2="19">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        {/* へこんだ穴の縁: 盛り上がりと逆向き */}
        <linearGradient id={sunken} gradientUnits="userSpaceOnUse" x1="9" y1="9" x2="15" y2="15">
          <stop offset="0" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id={hole} cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" style={{ stopColor: 'var(--gear-hole-light)' }} />
          <stop offset="1" style={{ stopColor: 'var(--gear-hole-dark)' }} />
        </radialGradient>
      </defs>

      {/* 歯（8個）と本体 */}
      <g fill={`url(#${face})`}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="10.2" y="1.4" width="3.6" height="5.4" rx="1.1" transform={`rotate(${i * 45} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="7.6" />
      </g>
      {/* 盛り上がった縁のハイライトと陰 */}
      <circle cx="12" cy="12" r="6.9" fill="none" stroke={`url(#${raised})`} strokeWidth="1.2" />
      {/* 中央の穴 */}
      <circle cx="12" cy="12" r="3.3" fill={`url(#${hole})`} stroke={`url(#${sunken})`} strokeWidth="1" />
    </svg>
  )
}
