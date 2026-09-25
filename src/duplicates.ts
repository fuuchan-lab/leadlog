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

/** 重複している可能性のあるリードの ID → 相手のリード */
export function findDuplicates(leads: Lead[]): Map<string, Lead[]> {
  const byKey = new Map<string, Lead[]>()
  for (const l of leads) {
    for (const k of keysOf(l)) byKey.set(k, [...(byKey.get(k) ?? []), l])
  }
  const result = new Map<string, Lead[]>()
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const l of group) {
      const others = group.filter((o) => o.id !== l.id)
      const cur = result.get(l.id) ?? []
      result.set(l.id, [...cur, ...others.filter((o) => !cur.includes(o))])
    }
  }
  return result
}

/** 入力中の内容と同じ方の、登録済みのリード */
export function matchingLeads(fields: LeadFields, leads: Lead[], exceptId?: string): Lead[] {
  const keys = new Set(keysOf(fields))
  if (keys.size === 0) return []
  return leads.filter((l) => l.id !== exceptId && keysOf(l).some((k) => keys.has(k)))
}
