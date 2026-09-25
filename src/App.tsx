import { useState } from 'react'
import { CaptureCard } from './components/CaptureCard.tsx'
import { Header } from './components/Header.tsx'
import { LeadList } from './components/LeadList.tsx'
import { MemberPrompt } from './components/MemberPrompt.tsx'
import { SettingsPage } from './components/SettingsPage.tsx'
import { StatusCard } from './components/StatusCard.tsx'
import { loadMember, saveMember } from './device.ts'
import { MAX_DEVICES } from './devices.ts'
import { useGoogleAuth } from './hooks/useGoogleAuth.ts'
import { useLeads } from './hooks/useLeads.ts'
import { useOnline } from './hooks/useOnline.ts'
import { useSharedSettings } from './hooks/useSharedSettings.ts'
import { useSync } from './hooks/useSync.ts'
import { useI18n } from './i18n/useI18n.ts'

export default function App() {
  const { t, lang } = useI18n()
  const online = useOnline()
  const [view, setView] = useState<'home' | 'settings'>('home')
  const [member, setMember] = useState(loadMember)
  const { leads, unsyncedCount, reload, add, update, remove } = useLeads()
  const shared = useSharedSettings()
  const auth = useGoogleAuth()
  const sync = useSync(auth.account !== null, unsyncedCount, shared.dirty, reload, shared.refresh, lang)

  const lists = {
    importance: shared.importance,
    customerTypes: shared.customerTypes,
    interests: shared.interests,
    nextActions: shared.nextActions,
  }

  const changeMember = (name: string) => {
    saveMember(name)
    setMember(name)
  }

  return (
    <main className="app">
      <Header
        view={view}
        onToggleSettings={() => setView(view === 'home' ? 'settings' : 'home')}
        auth={auth}
        sync={sync}
        unsyncedCount={unsyncedCount}
      />

      {/* 電波がない場所でも登録できることを伝える。ネットにつながると自動で同期する */}
      {!online && (
        <p className="banner banner-info" role="status">
          📴 {t('offline.banner')}
        </p>
      )}

      {/* 共有アカウントの端末の上限（10台）に達していて、この端末は同期できない */}
      {sync.status === 'limit' && (
        <p className="banner banner-warning" role="alert">
          ⚠ {t('sync.deviceLimit', { max: MAX_DEVICES, n: unsyncedCount })}
        </p>
      )}

      {view === 'settings' ? (
        <div className="settings-grid">
          <SettingsPage
            shared={shared}
            member={member}
            onMember={changeMember}
            leads={leads}
            loggedIn={auth.account !== null}
          />
        </div>
      ) : (
        // スマホ（縦長）は1列。PC などの横長の大きい画面では、左にダッシュボードと読み取り、右に一覧の2列
        <div className="home-grid">
          <div className="home-col">
          {!member && <MemberPrompt onSave={changeMember} />}
          <StatusCard leads={leads} settings={shared.settings} importance={shared.importance} />
          <CaptureCard
            lists={lists}
            member={member}
            leads={leads}
            exhibition={shared.settings.exhibition.name}
            memberReady={member !== ''}
            onSave={add}
          />
          </div>
          <div className="home-col">
          <LeadList
            leads={leads}
            allImportance={shared.settings.importance}
            allCustomerTypes={shared.settings.customerTypes}
            allInterests={shared.settings.interests}
            allNextActions={shared.settings.nextActions}
            lists={lists}
            member={member}
            onUpdate={update}
            onRemove={(l) => void remove(l)}
          />
          </div>
        </div>
      )}
    </main>
  )
}
