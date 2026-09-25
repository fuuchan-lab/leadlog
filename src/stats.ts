/** ダッシュボードの集計。ブラウザ機能に依存しない（テストできる） */
import { belongsTo, exhibitionDays, type Exhibition } from './exhibitions.ts'
import type { Lead } from './types.ts'

const DAY = 24 * 60 * 60_000

export interface HourRow {
  /** 時間帯の始まり（例: 10 は 10:00〜10:59） */
  hour: number
  /** 会期の各日の件数（day0, day1, …） */
  [day: `day${number}`]: number
}

export interface Dashboard {
  /** 会期中の件数 */
  total: number
  /** 今日の件数 */
  today: number
  /** 今日が会期の何日目か（会期外なら null） */
  todayIndex: number | null
  /** 時間帯 × 日 の件数 */
  rows: HourRow[]
  /** 各日の件数 */
  perDay: number[]
  /** 会期中だが、開場時間の外の件数 */
  outside: number
  /** 重要度 ID → 件数（未選択は ''） */
  byImportance: Map<string, number>
  /** 登録者（端末 ID）→ 名前と件数 */
  byMember: { deviceId: string; member: string; device: string; count: number }[]
}

export function buildDashboard(leads: Lead[], ex: Exhibition, now = Date.now()): Dashboard {
  const days = exhibitionDays(ex)
  const hours = Array.from({ length: Math.max(1, ex.endHour - ex.startHour) }, (_, i) => ex.startHour + i)
  const rows: HourRow[] = hours.map((hour) => {
    const row: HourRow = { hour }
    days.forEach((_, d) => (row[`day${d}`] = 0))
    return row
  })
  const perDay = days.map(() => 0)
  const byImportance = new Map<string, number>()
  const members = new Map<string, { deviceId: string; member: string; device: string; count: number }>()
  let total = 0
  let outside = 0

  const dayIndexOf = (ts: number) => {
    for (let d = 0; d < days.length; d++) {
      // 夏時間などで1日が24時間でない場合も考え、翌日の0時で区切る
      const next = d + 1 < days.length ? days[d + 1] : days[d] + DAY
      if (ts >= days[d] && ts < next) return d
    }
    return -1
  }

  for (const l of leads) {
    if (!belongsTo(l, ex)) continue
    const at = l.metAt || l.createdAt
    const d = dayIndexOf(at)
    if (d < 0) continue
    total++
    perDay[d]++
    byImportance.set(l.importance, (byImportance.get(l.importance) ?? 0) + 1)
    const m = members.get(l.createdBy.deviceId) ?? { ...l.createdBy, count: 0 }
    m.count++
    // 登録者名は、新しいリードに付いている名前を使う（途中で名前を変えた場合）
    if (l.createdBy.member) m.member = l.createdBy.member
    members.set(l.createdBy.deviceId, m)
    const hour = new Date(at).getHours()
    const row = rows.find((r) => r.hour === hour)
    if (row) row[`day${d}`]++
    else outside++
  }

  const todayIndex = dayIndexOf(now)
  return {
    total,
    today: todayIndex >= 0 ? perDay[todayIndex] : 0,
    todayIndex: todayIndex >= 0 ? todayIndex : null,
    rows,
    perDay,
    outside,
    byImportance,
    byMember: [...members.values()].sort((a, b) => b.count - a.count),
  }
}
