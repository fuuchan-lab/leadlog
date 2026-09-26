/** 登録者の名前を変えた時に、過去のリードの担当者・登録者の名前も置き換える。ブラウザ機能に依存しない */
import type { Lead } from './types.ts'

/** 同じ名前か（前後の空白と、大文字・小文字の違いは無視） */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * リードの中の、担当者（受付）・登録者（登録した人・最後に編集した人）・次のアクションの担当のうち、
 * from の名前になっているものを to に置き換える。どれも変わらなければ null。
 * 変わった時は、他の端末に伝わるよう、更新時刻を進めて「未同期」にする
 */
export function renameMemberInLead(lead: Lead, from: string, to: string, now: number): Lead | null {
  if (from === to) return null
  const hit = (name: string) => sameName(name, from)
  const staff = hit(lead.staff) ? to : lead.staff
  const createdBy = hit(lead.createdBy.member) ? { ...lead.createdBy, member: to } : lead.createdBy
  const updatedBy = hit(lead.updatedBy.member) ? { ...lead.updatedBy, member: to } : lead.updatedBy
  const nextSteps = lead.nextSteps.map((s) => (hit(s.who) ? { ...s, who: to } : s))
  const changed =
    staff !== lead.staff ||
    createdBy !== lead.createdBy ||
    updatedBy !== lead.updatedBy ||
    nextSteps.some((s, i) => s !== lead.nextSteps[i])
  if (!changed) return null
  return { ...lead, staff, createdBy, updatedBy, nextSteps, updatedAt: Math.max(now, lead.updatedAt + 1), synced: false }
}
