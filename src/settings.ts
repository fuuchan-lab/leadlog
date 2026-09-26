import { fromLegacy, mergeExhibitions, parseExhibition, type Exhibition } from './exhibitions.ts'

/**
 * 全員で共有する設定（展示会・重要度・顧客の種類・興味のある分野）。Google ドライブの settings.json で全端末にそろえる。
 * 登録者名など、端末ごとの設定は device.ts。
 *
 * 重要度・顧客の種類などのリストは、まとまりごとに更新時刻を持ち、端末間では新しい方を採用する。
 * 展示会は1件ずつ更新時刻を持ち、ID ごとに新しい方を採用する（exhibitions.ts）。
 * 重要度・顧客の種類は、削除しても印を付けて残す（過去のリードの表示と Excel に名前を出すため）。
 */

export interface Category {
  id: string
  label: string
  color: string
  deleted?: boolean
}

export interface SharedSettings {
  /** 登録した展示会（削除済みを含む） */
  exhibitions: Exhibition[]
  importance: Category[]
  importanceUpdatedAt: number
  customerTypes: Category[]
  customerTypesUpdatedAt: number
  /** 興味のある分野（製品・ブランドなど）。Excel では分野ごとに 0/1 の列になる */
  interests: Category[]
  interestsUpdatedAt: number
  /** 次のアクションの種類（電話・メール、見積 など） */
  nextActions: Category[]
  nextActionsUpdatedAt: number
  /** 次のアクションの担当を選べる、登録者（社員）の一覧 */
  members: Category[]
  membersUpdatedAt: number
}

export type CategoryKind = 'importance' | 'customerTypes' | 'interests' | 'nextActions' | 'members'

export const CATEGORY_COLORS = [
  '#dc2626',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#64748b',
]

/** 初めて使う時の設定。更新時刻は 0 にして、ドライブに設定があればそちらを必ず採用する */
export function defaultSettings(lang: 'ja' | 'en'): SharedSettings {
  const importance = ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({
    id: `imp-${label.toLowerCase()}`,
    label,
    color: ['#0ea5e9', '#22c55e', '#eab308', '#f97316', '#dc2626'][i],
  }))
  const typeLabels =
    lang === 'ja'
      ? ['既存顧客', '新規見込み', '代理店・パートナー', '競合', 'その他']
      : ['Existing customer', 'New prospect', 'Distributor / partner', 'Competitor', 'Other']
  const customerTypes = typeLabels.map((label, i) => ({
    id: `type-${i + 1}`,
    label,
    color: ['#0ea5e9', '#22c55e', '#a855f7', '#f97316', '#64748b'][i],
  }))
  const actionLabels =
    lang === 'ja'
      ? ['電話・メール', '打ち合わせ・Web会議', '資料請求への対応', '見積', 'カタログ・パンフレット送付', '担当部署へ転送']
      : ['Phone call / email', 'Meeting / web conference', 'Information requested', 'Offer', 'Catalogue / brochure', 'Forward to']
  const nextActions = actionLabels.map((label, i) => ({
    id: `act-${i + 1}`,
    label,
    color: ['#0ea5e9', '#6366f1', '#22c55e', '#f97316', '#a855f7', '#64748b'][i],
  }))
  return {
    exhibitions: [],
    importance,
    importanceUpdatedAt: 0,
    customerTypes,
    customerTypesUpdatedAt: 0,
    interests: [],
    interestsUpdatedAt: 0,
    nextActions,
    nextActionsUpdatedAt: 0,
    members: [],
    membersUpdatedAt: 0,
  }
}

function isCategory(x: unknown): x is Category {
  const c = x as Partial<Category> | null
  return !!c && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.color === 'string'
}

/** 保存内容・ドライブのファイルを読み込む。壊れた部分は既定値で補う */
export function parseSettings(text: string, fallback: SharedSettings): SharedSettings {
  const data = JSON.parse(text) as Partial<SharedSettings> | null
  if (!data || typeof data !== 'object') throw new Error('invalid-settings')
  // 以前のバージョンは展示会が1つだけ（exhibition）だった
  const legacy = data as { exhibition?: unknown; exhibitionUpdatedAt?: number }
  const exhibitions = Array.isArray(data.exhibitions)
    ? data.exhibitions.map(parseExhibition).filter((e): e is Exhibition => e !== null)
    : fromLegacy(legacy.exhibition, Number(legacy.exhibitionUpdatedAt) || 0)
  return {
    exhibitions,
    importance: Array.isArray(data.importance) ? data.importance.filter(isCategory) : fallback.importance,
    importanceUpdatedAt: Number(data.importanceUpdatedAt) || 0,
    customerTypes: Array.isArray(data.customerTypes) ? data.customerTypes.filter(isCategory) : fallback.customerTypes,
    customerTypesUpdatedAt: Number(data.customerTypesUpdatedAt) || 0,
    interests: Array.isArray(data.interests) ? data.interests.filter(isCategory) : fallback.interests,
    interestsUpdatedAt: Number(data.interestsUpdatedAt) || 0,
    nextActions: Array.isArray(data.nextActions) ? data.nextActions.filter(isCategory) : fallback.nextActions,
    nextActionsUpdatedAt: Number(data.nextActionsUpdatedAt) || 0,
    members: Array.isArray(data.members) ? data.members.filter(isCategory) : fallback.members,
    membersUpdatedAt: Number(data.membersUpdatedAt) || 0,
  }
}

export function serializeSettings(s: SharedSettings): string {
  return JSON.stringify({ version: 1, ...s })
}

/** まとまりごとに（展示会は1件ごとに）、更新時刻が新しい方を採用する */
export function mergeSettings(local: SharedSettings, remote: SharedSettings): SharedSettings {
  const imp = remote.importanceUpdatedAt > local.importanceUpdatedAt ? remote : local
  const types = remote.customerTypesUpdatedAt > local.customerTypesUpdatedAt ? remote : local
  const interests = remote.interestsUpdatedAt > local.interestsUpdatedAt ? remote : local
  const actions = remote.nextActionsUpdatedAt > local.nextActionsUpdatedAt ? remote : local
  const members = remote.membersUpdatedAt > local.membersUpdatedAt ? remote : local
  return {
    exhibitions: mergeExhibitions(local.exhibitions, remote.exhibitions),
    importance: imp.importance,
    importanceUpdatedAt: imp.importanceUpdatedAt,
    customerTypes: types.customerTypes,
    customerTypesUpdatedAt: types.customerTypesUpdatedAt,
    interests: interests.interests,
    interestsUpdatedAt: interests.interestsUpdatedAt,
    nextActions: actions.nextActions,
    nextActionsUpdatedAt: actions.nextActionsUpdatedAt,
    members: members.members,
    membersUpdatedAt: members.membersUpdatedAt,
  }
}

export function sameSettings(a: SharedSettings, b: SharedSettings): boolean {
  return serializeSettings(a) === serializeSettings(b)
}

export const visibleCategories = (list: Category[]) => list.filter((c) => !c.deleted)

/** ID から表示名を探す（削除済みも含めて）。見つからなければ '' */
export function categoryLabel(list: Category[], id: string): string {
  return list.find((c) => c.id === id)?.label ?? ''
}

export function categoryColor(list: Category[], id: string): string {
  return list.find((c) => c.id === id)?.color ?? '#94a3b8'
}

export type CategoryResult = { ok: true; list: Category[] } | { ok: false; reason: 'empty' | 'duplicate' }

function isDuplicate(list: Category[], label: string, exceptId?: string): boolean {
  const key = label.toLowerCase()
  return visibleCategories(list).some((c) => c.id !== exceptId && c.label.toLowerCase() === key)
}

export function addCategory(list: Category[], rawLabel: string, id: string): CategoryResult {
  const label = rawLabel.trim()
  if (!label) return { ok: false, reason: 'empty' }
  if (isDuplicate(list, label)) return { ok: false, reason: 'duplicate' }
  const used = new Set(visibleCategories(list).map((c) => c.color))
  const color = CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[list.length % CATEGORY_COLORS.length]
  return { ok: true, list: [...list, { id, label, color }] }
}

export function updateCategory(list: Category[], id: string, rawLabel: string, color: string): CategoryResult {
  const label = rawLabel.trim()
  if (!label) return { ok: false, reason: 'empty' }
  if (isDuplicate(list, label, id)) return { ok: false, reason: 'duplicate' }
  return { ok: true, list: list.map((c) => (c.id === id ? { ...c, label, color } : c)) }
}

export function removeCategory(list: Category[], id: string): Category[] {
  return list.map((c) => (c.id === id ? { ...c, deleted: true } : c))
}

/** 表示中の項目の中で、1つ上（-1）・下（1）と入れ替える。端なら同じ配列を返す */
export function moveCategory(list: Category[], id: string, direction: -1 | 1): Category[] {
  const visible = visibleCategories(list)
  const i = visible.findIndex((c) => c.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= visible.length) return list
  const a = list.indexOf(visible[i])
  const b = list.indexOf(visible[j])
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

// ---- この端末での保存 ----

const SETTINGS_KEY = 'leadlog-settings'
const DIRTY_KEY = 'leadlog-settings-dirty'

export function loadSettings(lang: 'ja' | 'en'): SharedSettings {
  const fallback = defaultSettings(lang)
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? parseSettings(raw, fallback) : fallback
  } catch {
    return fallback
  }
}

export function saveSettings(s: SharedSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, serializeSettings(s))
  } catch {
    // 保存できなくても、その回の表示には使える
  }
}

export function isSettingsDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1'
  } catch {
    return false
  }
}

export function setSettingsDirty(dirty: boolean) {
  try {
    if (dirty) localStorage.setItem(DIRTY_KEY, '1')
    else localStorage.removeItem(DIRTY_KEY)
  } catch {
    // 無視
  }
}


export type RenameResult = { ok: true; list: Category[]; merged: boolean; label: string } | { ok: false; reason: 'empty' }

/**
 * 登録者の名前を変える。新しい名前がすでに一覧にあれば（大文字・小文字の違いは無視）、エラーにせず、
 * その項目に統合する（変えた項目は消し、一覧には1つだけ残す）。label は、一覧に残る名前
 */
export function renameOrMergeCategory(list: Category[], id: string, rawLabel: string, color: string): RenameResult {
  const label = rawLabel.trim()
  if (!label) return { ok: false, reason: 'empty' }
  const key = label.toLowerCase()
  const target = visibleCategories(list).find((c) => c.id !== id && c.label.toLowerCase() === key)
  if (target) {
    return { ok: true, merged: true, label: target.label, list: list.map((c) => (c.id === id ? { ...c, deleted: true } : c)) }
  }
  return { ok: true, merged: false, label, list: list.map((c) => (c.id === id ? { ...c, label, color } : c)) }
}

/** 同じ名前を、重複なしで1つだけにする（先に出てきたものを残す。大文字・小文字の違いは無視） */
export function uniqueByLabel(list: Category[]): Category[] {
  const seen = new Set<string>()
  return list.filter((c) => {
    const key = c.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
