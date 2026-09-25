import { useState } from 'react'
import { CaptureCard } from './components/CaptureCard.tsx'
import { Header } from './components/Header.tsx'
import { LeadList } from './components/LeadList.tsx'
import { MemberPrompt } from './components/MemberPrompt.tsx'
import { SaveChangesModal } from './components/SaveChangesModal.tsx'
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
import { hasUnsavedChanges, saveAllChanges } from './leaveGuard.ts'

export default function App() {
  const { t, lang } = useI18n()
  const online = useOnline()
  // URL の末尾が #settings なら設定の画面から開く（ホーム画面のショートカットや確認用）
  const [view, setView] = useState<'home' | 'settings'>(() => (location.hash === '#settings' ? 'settings' : 'home'))
  const [member, setMember] = useState(loadMember)
  const [askSave, setAskSave] = useState(false)
  const { leads, trash, unsyncedCount, reload, add, update, moveToTrash, restore, purge, moveTo } = useLeads()
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
        onToggleSettings={() => {
          if (view === 'home') setView('settings')
          // 設定の画面から戻る時、保存していない変更があれば「変更を保存しますか？」を出す
          else if (hasUnsavedChanges()) setAskSave(true)
          else setView('home')
        }}
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
            onExhibitionOpened={() => setView('home')}
          />
        </div>
      ) : (
        // スマホ（縦長）は1列。PC などの横長の大きい画面では、左にダッシュボードと読み取り、右に一覧の2列
        <div className="home-grid">
          <div className="home-col">
          {!member && <MemberPrompt onSave={changeMember} />}
          <StatusCard
            leads={leads}
            exhibition={shared.current}
            importance={shared.importance}
            onOpenSettings={() => setView('settings')}
          />
          <CaptureCard
            lists={lists}
            member={member}
            leads={leads}
            exhibition={shared.current}
            memberReady={member !== ''}
            onSave={add}
          />
          </div>
          <div className="home-col">
          <LeadList
            leads={leads}
            exhibition={shared.current}
            allImportance={shared.settings.importance}
            allCustomerTypes={shared.settings.customerTypes}
            allInterests={shared.settings.interests}
            allNextActions={shared.settings.nextActions}
            lists={lists}
            member={member}
            trash={trash}
            allExhibitions={shared.settings.exhibitions}
            exhibitions={shared.exhibitions}
            onUpdate={update}
            onTrash={moveToTrash}
            onRestore={restore}
            onPurge={purge}
            onMove={moveTo}
          />
          </div>
        </div>
      )}
      {askSave && (
        <SaveChangesModal
          onSave={() => {
            saveAllChanges()
            setAskSave(false)
            setView('home')
          }}
          onDiscard={() => {
            setAskSave(false)
            setView('home')
          }}
          onCancel={() => setAskSave(false)}
        />
      )}
    </main>
  )
}
