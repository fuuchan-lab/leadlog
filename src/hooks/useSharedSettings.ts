import { useCallback, useMemo, useState } from 'react'
import { newExhibition, resolveCurrent, visibleExhibitions, type Exhibition } from '../exhibitions.ts'
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
  type SharedSettings,
} from '../settings.ts'

/** この端末で開いている展示会の ID（端末ごと。1台で過去の展示会を見ても、ほかの端末は変わらない） */
const CURRENT_KEY = 'leadlog-current-exhibition'

function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

function saveCurrentId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id)
  } catch {
    // 保存できなくても、その回の表示は切り替わる
  }
}

/** 展示会で編集できる項目 */
export type ExhibitionFields = Pick<Exhibition, 'name' | 'location' | 'startDate' | 'endDate' | 'startHour' | 'endHour' | 'logoId'>

/** 全員共通の設定（展示会・重要度・顧客の種類など）。変更は同期でドライブの settings.json に反映される */
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

  const [selectedId, setSelectedId] = useState<string | null>(loadCurrentId)
  const exhibitions = useMemo(() => visibleExhibitions(settings.exhibitions), [settings.exhibitions])
  /** 開いている展示会（まだ1つも無ければ null） */
  const current = useMemo(() => resolveCurrent(settings.exhibitions, selectedId), [settings.exhibitions, selectedId])

  const openExhibition = useCallback((id: string) => {
    setSelectedId(id)
    saveCurrentId(id)
  }, [])

  /** 新しい展示会を作って開く */
  const createExhibition = useCallback(
    (fields: ExhibitionFields) => {
      const ex: Exhibition = { ...newExhibition(crypto.randomUUID()), ...fields }
      persist({ ...settings, exhibitions: [...settings.exhibitions, ex] })
      openExhibition(ex.id)
      return ex
    },
    [settings, persist, openExhibition],
  )

  const updateExhibition = useCallback(
    (id: string, fields: Partial<ExhibitionFields> & { deleted?: boolean }) =>
      persist({
        ...settings,
        exhibitions: settings.exhibitions.map((e) => (e.id === id ? { ...e, ...fields, updatedAt: Date.now() } : e)),
      }),
    [settings, persist],
  )

  const removeExhibition = useCallback((id: string) => updateExhibition(id, { deleted: true }), [updateExhibition])

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

  return {
    settings,
    importance,
    customerTypes,
    interests,
    nextActions,
    dirty,
    refresh,
    categories,
    exhibitions,
    current,
    openExhibition,
    createExhibition,
    updateExhibition,
    removeExhibition,
  }
}

export type SharedSettingsState = ReturnType<typeof useSharedSettings>
