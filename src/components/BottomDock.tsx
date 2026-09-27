import { useEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import { AdBanner } from './AdBanner.tsx'

export type Tab = 'capture' | 'list' | 'dashboard' | 'settings'

// アイコンは currentColor で塗る。抜き部分は .cut / .cutline（ドックの背景色）
const ICONS: Record<Tab | 'help', ReactNode> = {
  capture: (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.2 4.6c.3-.9 1-1.4 1.9-1.4h3.8c.9 0 1.6.5 1.9 1.4l.3.8H19a2.5 2.5 0 0 1 2.5 2.5v9.6A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V7.9A2.5 2.5 0 0 1 5 5.4h2.9z"
        fill="currentColor"
      />
      <circle className="cut" cx="12" cy="12.4" r="4.4" />
      <circle cx="12" cy="12.4" r="2.7" fill="currentColor" opacity=".6" />
      <circle className="cut" cx="18" cy="8.3" r=".95" />
    </svg>
  ),
  list: (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        <rect x="2.8" y="3.4" width="5.2" height="4.8" rx="1.4" />
        <rect x="10" y="3.6" width="11" height="2.1" rx="1.05" />
        <rect x="10" y="6.6" width="7" height="1.6" rx=".8" opacity=".55" />
        <rect x="2.8" y="9.6" width="5.2" height="4.8" rx="1.4" />
        <rect x="10" y="9.8" width="11" height="2.1" rx="1.05" />
        <rect x="10" y="12.8" width="7" height="1.6" rx=".8" opacity=".55" />
        <rect x="2.8" y="15.8" width="5.2" height="4.8" rx="1.4" />
        <rect x="10" y="16" width="11" height="2.1" rx="1.05" />
        <rect x="10" y="19" width="7" height="1.6" rx=".8" opacity=".55" />
      </g>
    </svg>
  ),
  dashboard: (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        <rect x="3" y="11.5" width="4.6" height="9" rx="1.4" opacity=".6" />
        <rect x="9.7" y="3.5" width="4.6" height="17" rx="1.4" />
        <rect x="16.4" y="8" width="4.6" height="12.5" rx="1.4" opacity=".8" />
      </g>
    </svg>
  ),
  settings: (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect key={deg} x="10.2" y="1.6" width="3.6" height="5.4" rx="1.1" transform={`rotate(${deg} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="7.4" />
      </g>
      <circle className="cut" cx="12" cy="12" r="3.2" />
    </svg>
  ),
  help: (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.6" fill="currentColor" />
      <path
        className="cutline"
        d="M9.3 9.6a2.75 2.75 0 1 1 4.3 2.25c-.95.65-1.6 1.15-1.6 2.35"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle className="cut" cx="12" cy="17" r="1.2" />
    </svg>
  ),
}

interface Props {
  tab: Tab
  onTab: (tab: Tab) => void
}

/** 画面の下に固定するドック。上に広告（出る時だけ場所を取る）、その下にナビゲーションのボタン5つ */
export function BottomDock({ tab, onTab }: Props) {
  const { t, lang } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  // ドックの高さを --dock-h に入れる（本体の下の余白に使い、内容がドックに隠れないようにする）
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const sync = () => document.documentElement.style.setProperty('--dock-h', `${el.offsetHeight}px`)
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const item = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      className={`nav-item${tab === id ? ' active' : ''}`}
      aria-current={tab === id ? 'page' : undefined}
      onClick={() => onTab(id)}
    >
      {ICONS[id]}
      <span>{label}</span>
    </button>
  )

  return (
    <div className="bottom-dock" ref={ref}>
      <AdBanner />
      <nav className="bottom-nav" aria-label={t('nav.menu')}>
        {item('capture', t('nav.capture'))}
        {item('list', t('nav.list'))}
        {item('dashboard', t('nav.dashboard'))}
        {item('settings', t('nav.settings'))}
        <a className="nav-item" href={`./help.html?lang=${lang}`} target="_blank" rel="noopener">
          {ICONS.help}
          <span>{t('nav.help')}</span>
        </a>
      </nav>
    </div>
  )
}
