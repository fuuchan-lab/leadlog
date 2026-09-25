import { useEffect, useState } from 'react'
import type { GoogleAuth } from '../hooks/useGoogleAuth.ts'
import type { SyncState } from '../hooks/useSync.ts'
import { LOCALES, type TFn } from '../i18n/context.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { authorLabel, currentAuthor } from '../device.ts'
import { MAX_DEVICES } from '../devices.ts'
import { useOnline } from '../hooks/useOnline.ts'
import { GearIcon } from './GearIcon.tsx'
import { GoogleLogo } from './GoogleLogo.tsx'
import { driveConfig } from '../drive.ts'

interface Props {
  view: 'home' | 'settings'
  onToggleSettings: () => void
  auth: GoogleAuth
  sync: SyncState
  unsyncedCount: number
}

/** アプリ名・設定ボタン・Googleログインボタン（CapLog と同じ並び） */
export function Header({ view, onToggleSettings, auth, sync, unsyncedCount }: Props) {
  const { t, lang } = useI18n()
  const { account, connecting, login } = auth
  const [accountOpen, setAccountOpen] = useState(false)
  const online = useOnline()
  // オンラインで Google につながっている間は、ボタンの縁を緑にして、ゆっくり光らせる
  const live = account !== null && !connecting && online

  const label = connecting ? t('google.connecting') : account ? t('google.connected') : t('google.login')

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="./icon-192.png" alt="" />
          <div className="brand-text">
            <p className="eyebrow">{t('header.eyebrow')}</p>
            <h1>{t('header.title')}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {view === 'home' ? (
            <button className="icon-button" onClick={onToggleSettings} aria-label={t('header.openSettings')} title={t('header.settings')}>
              <GearIcon />
            </button>
          ) : (
            <>
              {/* 設定の画面では、使い方のヘルプを開くアイコン */}
              <a
                className="icon-button help-button"
                href={`./help.html#${lang}`}
                target="_blank"
                rel="noopener"
                aria-label={t('help.open')}
                title={t('help.open')}
              >
                ?
              </a>
              <button className="back-button" onClick={onToggleSettings}>
                {t('header.back')}
              </button>
            </>
          )}
          <button
            className={`google-button${live ? ' google-button-live' : ''}`}
            disabled={connecting}
            onClick={() => (account ? setAccountOpen(true) : void login())}
          >
            <span
              className="google-mark"
              aria-hidden="true"
              style={account?.avatarUrl ? { backgroundImage: `url(${account.avatarUrl})` } : undefined}
            >
              {!account?.avatarUrl && <GoogleLogo />}
            </span>
            <span className={`google-text${account && !connecting ? ' connected' : ''}`}>{label}</span>
            {account && unsyncedCount > 0 && (
              <span className="sync-badge" aria-label={t('sync.badge', { n: unsyncedCount })}>
                {unsyncedCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {auth.notice && (
        <p
          className={`banner ${auth.notice.kind === 'ok' ? 'banner-none' : 'banner-warning'}`}
          role={auth.notice.kind === 'ok' ? 'status' : 'alert'}
          onClick={auth.dismissNotice}
        >
          {t(auth.notice.key, auth.notice.vars)}
          {auth.notice.detail && (
            <>
              <br />
              <span className="small">
                {t('err.detail')}: {auth.notice.detail}
              </span>
            </>
          )}
          {auth.notice.kind === 'error' && (
            <>
              <br />
              <span className="small muted">{t('notice.dismissHint')}</span>
            </>
          )}
        </p>
      )}

      {accountOpen && account && (
        <AccountModal
          account={account}
          sync={sync}
          unsyncedCount={unsyncedCount}
          onClose={() => setAccountOpen(false)}
          onSwitch={() => {
            setAccountOpen(false)
            void auth.switchAccount()
          }}
          onSignOut={() => {
            setAccountOpen(false)
            auth.signOut()
          }}
        />
      )}
    </>
  )
}

interface ModalProps {
  account: NonNullable<GoogleAuth['account']>
  sync: SyncState
  unsyncedCount: number
  onClose: () => void
  onSwitch: () => void
  onSignOut: () => void
}

function syncText(sync: SyncState, unsyncedCount: number, t: TFn, locale: string): string {
  if (sync.status === 'syncing') return t('sync.syncing')
  if (sync.status === 'offline') return t('sync.offline', { n: unsyncedCount })
  if (sync.status === 'limit') return t('sync.deviceLimit', { max: MAX_DEVICES, n: unsyncedCount })
  if (sync.status === 'error') return t('sync.error', { n: unsyncedCount })
  if (unsyncedCount > 0) return t('sync.unsynced', { n: unsyncedCount })
  if (sync.lastSyncAt) {
    const time = new Date(sync.lastSyncAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    return t('sync.done', { time })
  }
  return t('sync.preparing')
}

function AccountModal({ account, sync, unsyncedCount, onClose, onSwitch, onSignOut }: ModalProps) {
  const { t, lang } = useI18n()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 id="account-title">{t('account.title')}</h2>
          <button className="link" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <p>{account.email ?? account.name ?? t('account.fallback')}</p>
        <p className="muted">{t('account.storage', { folder: driveConfig.folderName })}</p>
        <p className="muted small">{t('account.shared', { max: MAX_DEVICES })}</p>
        <p className="muted small">{t('account.thisDevice', { who: authorLabel(currentAuthor()) })}</p>
        <p className={sync.status === 'error' || sync.status === 'limit' ? 'error' : 'muted'} role="status">
          {syncText(sync, unsyncedCount, t, LOCALES[lang])}
        </p>
        {sync.status === 'error' && sync.error && (
          <p className="muted small">
            {t('err.detail')}: {sync.error}
          </p>
        )}
        <button className="secondary" disabled={sync.status === 'syncing'} onClick={() => void sync.syncNow()}>
          {t('account.syncNow')}
        </button>
        <button className="secondary" onClick={onSwitch}>
          {t('account.switch')}
        </button>
        <button className="danger-btn" onClick={onSignOut}>
          {t('account.signOut')}
        </button>
      </div>
    </div>
  )
}
