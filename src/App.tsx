import { useState } from 'react'
import { BottomDock, type Tab } from './components/BottomDock.tsx'
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
  // 下のナビゲーションで切り替える画面。URL の末尾が #settings なら設定の画面から開く（ホーム画面のショートカットや確認用）
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#settings' ? 'settings' : 'capture'))
  /** 設定の画面を離れる時に「変更を保存しますか？」を出している間、行き先を覚えておく */
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const [member, setMember] = useState(loadMember)
  const { leads, trash, unsyncedCount, reload, add, update, moveToTrash, restore, purge, moveTo, renameMember } = useLeads()
  const shared = useSharedSettings()
  const auth = useGoogleAuth()
  const sync = useSync(auth.account !== null, unsyncedCount, shared.dirty, reload, shared.refresh, lang)

  const lists = {
    importance: shared.importance,
    customerTypes: shared.customerTypes,
    interests: shared.interests,
    nextActions: shared.nextActions,
    members: shared.members,
  }

  const changeMember = (name: string) => {
    saveMember(name)
    setMember(name)
  }

  const goTab = (next: Tab) => {
    if (next === tab) return
    // 設定の画面から離れる時、保存していない変更があれば「変更を保存しますか？」を出す
    if (tab === 'settings' && hasUnsavedChanges()) {
      setPendingTab(next)
      return
    }
    setTab(next)
    window.scrollTo(0, 0)
  }

  const leaveSettings = () => {
    if (pendingTab) setTab(pendingTab)
    setPendingTab(null)
    window.scrollTo(0, 0)
  }

  return (
    <main className="app">
      <Header auth={auth} sync={sync} unsyncedCount={unsyncedCount} />

      {/* 電波がない場所でも登録できることを伝える。ネットにつながると自動で同期する */}
      {!online && (
        <p className="banner banner-info" role="status">
          📴 {t('offline.banner')}
        </p>
      )}

      {/* 共有アカウントの端末の上限（MAX_DEVICES 台）に達していて、この端末は同期できない */}
      {sync.status === 'limit' && (
        <p className="banner banner-warning" role="alert">
          ⚠ {t('sync.deviceLimit', { max: MAX_DEVICES, n: unsyncedCount })}
        </p>
      )}

      {/* 撮影・記録と一覧は、切り替えても入力途中の内容や検索の状態が消えないよう、隠すだけにして残す */}
      <div className={tab === 'capture' ? 'tab-panel' : 'tab-panel tab-hidden'}>
        {!member && (
          <MemberPrompt
            members={shared.members}
            onPick={changeMember}
            onCreate={(name) => {
              // 一覧に無い名前は、登録者一覧にも加える（ほかの端末や担当者の入力欄でも選べるように）
              shared.categories.add('members', name)
              changeMember(name)
            }}
          />
        )}
        <CaptureCard
          lists={lists}
          member={member}
          leads={leads}
          exhibition={shared.current}
          memberReady={member !== ''}
          onSave={add}
        />
      </div>

      <div className={tab === 'list' ? 'tab-panel' : 'tab-panel tab-hidden'}>
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

      {tab === 'dashboard' && (
        <div className="tab-panel">
          <StatusCard
            leads={leads}
            exhibition={shared.current}
            importance={shared.importance}
            onOpenSettings={() => goTab('settings')}
          />
        </div>
      )}

      {tab === 'settings' && (
        <div className="settings-grid">
          <SettingsPage
            shared={shared}
            member={member}
            onMember={changeMember}
            leads={leads}
            loggedIn={auth.account !== null}
            onExhibitionOpened={() => setTab('dashboard')}
            onImported={reload}
            onRenameMember={renameMember}
          />
        </div>
      )}

      {pendingTab && (
        <SaveChangesModal
          onSave={() => {
            saveAllChanges()
            leaveSettings()
          }}
          onDiscard={leaveSettings}
          onCancel={() => setPendingTab(null)}
        />
      )}
      <BottomDock tab={tab} onTab={goTab} />
    </main>
  )
}
