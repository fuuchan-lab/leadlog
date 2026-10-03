/**
 * 同じ方を2回登録していないかの確認。ブラウザ機能に依存しない（テストできる）。
 *
 * 同期そのものは ID で行うので、通信のやり直しで同じリードが増えることはない。ただし、オフラインの間に
 * 2人が同じ方の名刺を別々に登録すると、別のリードとして2件できる。これを見つけて知らせる
 * （どちらを残すかは人が判断する。自動では消さない）。
 */
import type { Lead, LeadFields } from './types.ts'

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
const phoneKey = (s: string) => s.replace(/\D/g, '')

/** 同じ方とみなす目印（メールアドレス、氏名＋会社名、電話番号） */
function keysOf(f: Pick<LeadFields, 'email' | 'name' | 'company' | 'phone'>): string[] {
  const keys: string[] = []
  if (f.email.trim()) keys.push(`e:${norm(f.email)}`)
  if (f.name.trim() && f.company.trim()) keys.push(`n:${norm(f.name)}|${norm(f.company)}`)
  const phone = phoneKey(f.phone)
  // 会社の代表番号は複数の人で同じになるので、氏名も同じ場合だけ
  if (phone.length >= 10 && f.name.trim()) keys.push(`p:${phone}|${norm(f.name)}`)
  return keys
}

/** 目印 → その目印を持つリード（leads と同じ順）。入力のたびに全リードの目印を作り直さないよう、まとめて作っておく */
export type KeyIndex = Map<string, Lead[]>

export function buildKeyIndex(leads: Lead[]): KeyIndex {
  const index: KeyIndex = new Map()
  for (const l of leads) {
    for (const k of keysOf(l)) {
      const group = index.get(k)
      if (group) group.push(l)
      else index.set(k, [l])
    }
  }
  return index
}

/** 重複している可能性のあるリードの ID → 相手のリード */
export function findDuplicates(leads: Lead[]): Map<string, Lead[]> {
  const others = new Map<string, Set<Lead>>()
  for (const group of buildKeyIndex(leads).values()) {
    if (group.length < 2) continue
    for (const l of group) {
      const set = others.get(l.id) ?? new Set<Lead>()
      for (const o of group) if (o.id !== l.id) set.add(o)
      others.set(l.id, set)
    }
  }
  return new Map([...others].map(([id, set]) => [id, [...set]]))
}

/**
 * 入力中の内容と同じ方の、登録済みのリード（leads と同じ順）。
 * index（buildKeyIndex(leads)）を渡すと、全リードの目印を作り直さずに探す
 */
export function matchingLeads(fields: LeadFields, leads: Lead[], exceptId?: string, index = buildKeyIndex(leads)): Lead[] {
  const found = new Set<Lead>()
  for (const k of keysOf(fields)) for (const l of index.get(k) ?? []) if (l.id !== exceptId) found.add(l)
  return found.size === 0 ? [] : leads.filter((l) => found.has(l))
}
