/**
 * 展示会（会期・開場時間など）。複数を登録でき、全員で共有する（settings.json）。
 * どの展示会を表示・登録の対象にするか（開いている展示会）は、端末ごとに選ぶ
 * （1台で過去の展示会を見ていても、ブースで登録中のほかの端末に影響しないように）。
 *
 * 展示会ごとに更新時刻を持ち、端末間では ID ごとに新しい方を採用する（別々の端末で同時に作っても消し合わない）。
 * 削除しても印を付けて残す（その展示会のリードの表示のため）。
 */
import type { Lead } from './types.ts'

export interface Exhibition {
  id: string
  name: string
  /** 会場・ブース（例: 東京ビッグサイト 東7ホール 68-20） */
  location: string
  /** 初日（YYYY-MM-DD） */
  startDate: string
  /** 最終日（YYYY-MM-DD） */
  endDate: string
  /** 開場の時（0-23） */
  startHour: number
  /** 閉場の時（1-24） */
  endHour: number
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

/** 会期の最大日数 */
export const MAX_DAYS = 14

const pad = (n: number) => String(n).padStart(2, '0')

export function dateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 新しい展示会の初期値（今日から3日間・10時〜17時） */
export function newExhibition(id: string, now = new Date()): Exhibition {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
  return {
    id,
    name: '',
    location: '',
    startDate: dateString(now),
    endDate: dateString(end),
    startHour: 10,
    endHour: 17,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  }
}

/** 会期の日数 */
export function dayCount(ex: Pick<Exhibition, 'startDate' | 'endDate'>): number {
  const ms = parseDate(ex.endDate).getTime() - parseDate(ex.startDate).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/** 会期の各日の 0時 (epoch ms) */
export function exhibitionDays(ex: Pick<Exhibition, 'startDate' | 'endDate'>): number[] {
  const start = parseDate(ex.startDate)
  return Array.from({ length: Math.min(MAX_DAYS, dayCount(ex)) }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i).getTime(),
  )
}

/** 初日・最終日を正しい順にし、最大日数に収める */
export function normalizeRange(a: string, b: string): { startDate: string; endDate: string } {
  const [startDate, endDate] = a <= b ? [a, b] : [b, a]
  const start = parseDate(startDate)
  const maxEnd = dateString(new Date(start.getFullYear(), start.getMonth(), start.getDate() + MAX_DAYS - 1))
  return { startDate, endDate: endDate > maxEnd ? maxEnd : endDate }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** 保存内容から1件を読み込む。壊れていれば null */
export function parseExhibition(x: unknown): Exhibition | null {
  const e = x as Partial<Exhibition> | null
  if (!e || typeof e.id !== 'string' || typeof e.startDate !== 'string' || !DATE_RE.test(e.startDate)) return null
  const endDate = typeof e.endDate === 'string' && DATE_RE.test(e.endDate) ? e.endDate : e.startDate
  const range = normalizeRange(e.startDate, endDate)
  const startHour = clampInt(e.startHour, 0, 23, 10)
  return {
    id: e.id,
    name: typeof e.name === 'string' ? e.name : '',
    location: typeof e.location === 'string' ? e.location : '',
    ...range,
    startHour,
    endHour: clampInt(e.endHour, startHour + 1, 24, Math.max(startHour + 1, 17)),
    createdAt: Number(e.createdAt) || 0,
    updatedAt: Number(e.updatedAt) || 0,
    ...(e.deleted ? { deleted: true } : {}),
  }
}

/**
 * 以前のバージョンの設定（展示会が1つだけ・日数で会期を持つ）を、一覧の形にする。
 * 展示会名が空なら、まだ使っていないとみなして何も作らない
 */
export function fromLegacy(old: unknown, updatedAt: number): Exhibition[] {
  const o = old as { name?: string; location?: string; startDate?: string; days?: number; startHour?: number; endHour?: number } | null
  if (!o || !o.name || !o.startDate || !DATE_RE.test(o.startDate)) return []
  const start = parseDate(o.startDate)
  const days = clampInt(o.days, 1, MAX_DAYS, 3)
  const ex = parseExhibition({
    ...o,
    id: 'ex-legacy',
    endDate: dateString(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1)),
    createdAt: updatedAt,
    updatedAt,
  })
  return ex ? [ex] : []
}

/** ID ごとに、更新時刻の新しい方を採用する（どちらかにしか無いものは残す） */
export function mergeExhibitions(local: Exhibition[], remote: Exhibition[]): Exhibition[] {
  const byId = new Map(local.map((e) => [e.id, e]))
  for (const r of remote) {
    const l = byId.get(r.id)
    if (!l || r.updatedAt > l.updatedAt) byId.set(r.id, r)
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt)
}

export const visibleExhibitions = (list: Exhibition[]) =>
  list.filter((e) => !e.deleted).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt - a.createdAt)

/**
 * 開いている展示会。この端末で選んだものがあればそれ、なければ（削除された場合も）会期がいちばん新しいもの
 */
export function resolveCurrent(list: Exhibition[], selectedId: string | null): Exhibition | null {
  const visible = visibleExhibitions(list)
  return visible.find((e) => e.id === selectedId) ?? visible[0] ?? null
}

/** リードがこの展示会のものか。以前のバージョンのリード（展示会 ID が無い）は、展示会名で判断する */
export function belongsTo(lead: Pick<Lead, 'exhibitionId' | 'exhibition'>, ex: Exhibition): boolean {
  return lead.exhibitionId ? lead.exhibitionId === ex.id : lead.exhibition !== '' && lead.exhibition === ex.name
}
