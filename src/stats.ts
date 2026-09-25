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
  /** 累計（この展示会のリードの全件数。会期の前後に登録したものも含む） */
  total: number
  /** 今日（端末の今日の 0時から今まで）に登録した件数。会期中かどうかは問わない */
  today: number
  /** 会期中の件数（時間帯別のグラフの対象） */
  inPeriod: number
  /** 今日が会期の何日目か（会期外なら null） */
  todayIndex: number | null
  /** 時間帯 × 日 の件数 */
  rows: HourRow[]
  /** 各日の件数 */
  perDay: number[]
  /** 会期中だが、開場時間の外の件数 */
  outside: number
  /** 重要度 ID → 件数（累計。未選択は ''） */
  byImportance: Map<string, number>
  /** 登録者ごとの件数（累計）。同じ登録者名なら、別の端末で登録した分もまとめて数える。
   * 登録者名を入力していない端末は、端末ごとに分けて数える（別人が混ざらないように） */
  byMember: { key: string; member: string; deviceIds: string[]; count: number }[]
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
  const members = new Map<string, { key: string; member: string; deviceIds: Set<string>; count: number }>()
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

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1).getTime()
  let today = 0
  let inPeriod = 0

  for (const l of leads) {
    if (!belongsTo(l, ex)) continue
    const at = l.metAt || l.createdAt
    // 累計・重要度別・登録者別は、この展示会のリードすべて
    total++
    if (at >= todayStart.getTime() && at < tomorrowStart) today++
    byImportance.set(l.importance, (byImportance.get(l.importance) ?? 0) + 1)
    // 登録者名があれば名前でまとめる（別の端末で登録した分も同じ人として数える）。
    // 名前が無い端末は、別人が混ざらないよう端末ごとに分ける
    const name = l.createdBy.member.trim()
    const key = name ? `name:${name}` : `device:${l.createdBy.deviceId}`
    const m = members.get(key) ?? { key, member: name, deviceIds: new Set<string>(), count: 0 }
    m.count++
    m.deviceIds.add(l.createdBy.deviceId)
    members.set(key, m)
    // 時間帯別のグラフは、会期中のものだけ
    const d = dayIndexOf(at)
    if (d < 0) continue
    inPeriod++
    perDay[d]++
    const hour = new Date(at).getHours()
    const row = rows.find((r) => r.hour === hour)
    if (row) row[`day${d}`]++
    else outside++
  }

  const todayIndex = dayIndexOf(now)
  return {
    total,
    today,
    inPeriod,
    todayIndex: todayIndex >= 0 ? todayIndex : null,
    rows,
    perDay,
    outside,
    byImportance,
    byMember: [...members.values()]
      .map((m) => ({ key: m.key, member: m.member, deviceIds: [...m.deviceIds], count: m.count }))
      .sort((a, b) => b.count - a.count),
  }
}
