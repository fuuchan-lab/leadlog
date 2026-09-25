import { useCallback, useMemo, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import {
  addCategory,
  isSettingsDirty,
  loadSettings,
  moveCategory,
  removeCategory,
  saveSettings,
  setSettingsDirty,
  updateCategory,
  visibleCategories,
  type CategoryKind,
  type CategoryResult,
  type Exhibition,
  type SharedSettings,
} from '../settings.ts'

/** 全員共通の設定（展示会・重要度・顧客の種類）。変更は同期でドライブの settings.json に反映される */
export function useSharedSettings() {
  const { lang } = useI18n()
  const [settings, setSettings] = useState<SharedSettings>(() => loadSettings(lang))
  const [dirty, setDirty] = useState(isSettingsDirty)

  const persist = useCallback((next: SharedSettings) => {
    setSettings(next)
    saveSettings(next)
    setSettingsDirty(true)
    setDirty(true)
  }, [])

  /** 同期で保存内容が変わった後に、画面の表示を保存内容に合わせ直す */
  const refresh = useCallback(() => {
    setSettings(loadSettings(lang))
    setDirty(isSettingsDirty())
  }, [lang])

  const setExhibition = useCallback(
    (exhibition: Exhibition) => persist({ ...settings, exhibition, exhibitionUpdatedAt: Date.now() }),
    [settings, persist],
  )

  /** 重要度・顧客の種類のリストを変える。失敗（空欄・重複）なら理由を返す */
  const changeList = useCallback(
    (kind: CategoryKind, op: (list: SharedSettings[CategoryKind]) => CategoryResult | SharedSettings[CategoryKind]) => {
      const result = op(settings[kind])
      const list = Array.isArray(result) ? result : result.ok ? result.list : null
      if (!list) return (result as { reason: 'empty' | 'duplicate' }).reason
      if (list !== settings[kind]) persist({ ...settings, [kind]: list, [`${kind}UpdatedAt`]: Date.now() })
      return null
    },
    [settings, persist],
  )

  const categories = useMemo(
    () => ({
      add: (kind: CategoryKind, label: string) => changeList(kind, (l) => addCategory(l, label, crypto.randomUUID())),
      update: (kind: CategoryKind, id: string, label: string, color: string) =>
        changeList(kind, (l) => updateCategory(l, id, label, color)),
      remove: (kind: CategoryKind, id: string) => changeList(kind, (l) => removeCategory(l, id)),
      move: (kind: CategoryKind, id: string, direction: -1 | 1) => changeList(kind, (l) => moveCategory(l, id, direction)),
    }),
    [changeList],
  )

  const importance = useMemo(() => visibleCategories(settings.importance), [settings.importance])
  const customerTypes = useMemo(() => visibleCategories(settings.customerTypes), [settings.customerTypes])
  const interests = useMemo(() => visibleCategories(settings.interests), [settings.interests])
  const nextActions = useMemo(() => visibleCategories(settings.nextActions), [settings.nextActions])

  return { settings, importance, customerTypes, interests, nextActions, dirty, refresh, setExhibition, categories }
}

export type SharedSettingsState = ReturnType<typeof useSharedSettings>
