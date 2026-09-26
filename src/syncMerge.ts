/**
 * 同期の「どちらを採用するか」などの純粋な処理。ブラウザ機能に依存しない。
 *
 * 最大5台が同じ Google ドライブのフォルダーに同時に書き込むため、1つのファイルを全員で上書きし合うと、
 * 他の人の書き込みを消してしまうことがある。そこで、ファイルは端末ごとに分ける（leads-<端末ID>.json）。
 * 各端末は自分のファイルだけを書き、他の端末のファイルは読むだけにする。
 *
 * 各端末のファイルには「その端末が最後に更新したリード」を入れる。どのリードも、最新の内容は
 * 最後に更新した端末のファイルに必ずあるので、全員のファイルを読んで更新時刻の新しい方を採用すれば、
 * 全端末が同じ内容にそろう。
 */
import type { Lead } from './types.ts'

/** ドライブ上のファイルに保存する形（synced は端末ごとの状態なので含めない） */
export type RemoteLead = Omit<Lead, 'synced'>

export const LEAD_FILE_RE = /^leads-([a-z0-9]{8})\.json$/

export const leadFileName = (deviceId: string) => `leads-${deviceId}.json`
export const photoFileName = (id: string) => `card-${id}.jpg`
/** 展示会ごとの書き出し（エクスポート）フォルダー・ZIPに入れる、読み込み用のデータファイル */
export const PACKAGE_DATA_FILE = 'leadlog-data.json'

export function toRemote(l: Lead): RemoteLead {
  const { synced: _synced, ...rest } = l
  return rest
}

/** この端末のファイルに書く内容。この端末が最後に更新したリード（削除の印を含む） */
export function ownLeads(all: Lead[], deviceId: string): Lead[] {
  return all.filter((l) => l.updatedBy.deviceId === deviceId).sort((a, b) => a.createdAt - b.createdAt)
}

export function serializeLeads(leads: Lead[]): string {
  return JSON.stringify({ version: 1, leads: leads.map(toRemote) })
}

function isAuthor(x: unknown): boolean {
  const a = x as { deviceId?: unknown } | null
  return !!a && typeof a.deviceId === 'string'
}

/** ドライブのファイルを読み込む。壊れた行は捨て、ファイル全体が不正なら例外にする */
export function parseLeadFile(text: string): RemoteLead[] {
  const data = JSON.parse(text) as { leads?: unknown }
  if (!data || !Array.isArray(data.leads)) throw new Error('invalid-leads-file')
  return data.leads.filter((r): r is RemoteLead => {
    const x = r as Partial<RemoteLead> | null
    return (
      !!x &&
      typeof x.id === 'string' &&
      typeof x.createdAt === 'number' &&
      typeof x.updatedAt === 'number' &&
      isAuthor(x.createdBy) &&
      isAuthor(x.updatedBy)
    )
  })
}

/** 同じ時刻に別の端末で更新された場合も、全端末で同じ方を選ぶための比較 */
function isNewer(a: RemoteLead, b: RemoteLead): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt
  return a.updatedBy.deviceId > b.updatedBy.deviceId
}

/** 端末のリードとドライブのリードのうち、新しい方を返す。ドライブ側を採用する場合だけ値を返し、そうでなければ null */
export function mergeLead(local: Lead | undefined, remote: RemoteLead): Lead | null {
  if (!local || isNewer(remote, local)) {
    return {
      ...emptyTextFields(),
      ...remote,
      // 古いバージョンのファイルには、来場日時・担当者が無い
      metAt: remote.metAt || remote.createdAt,
      staff: remote.staff ?? remote.createdBy.member,
      synced: true,
    }
  }
  return null
}

/** 古いバージョンのファイルに無い項目を補う */
function emptyTextFields() {
  return {
    name: '',
    company: '',
    department: '',
    title: '',
    prefecture: '',
    city: '',
    phone: '',
    email: '',
    importance: '',
    customerType: '',
    interests: [] as string[],
    note: '',
    nextSteps: [],
    photoId: null,
    ocrText: '',
    exhibitionId: '',
    exhibition: '',
  }
}
