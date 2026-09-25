/**
 * 共有アカウントで使える端末の数を制限する（最大 MAX_DEVICES 台）。
 *
 * ドライブのフォルダーに、端末ごとの登録ファイル device-<端末ID>.json を置く（端末ごとに別のファイルなので、
 * 同時に登録しても書き込みが消し合わない）。上限に達していたら、新しい端末は登録せず、同期もしない。
 * 2台がほぼ同時に最後の1枠に登録した場合に備え、登録した後にもう一度数え、登録の遅い方が取り消す。
 * 使わなくなった端末は、設定から解除して枠を空けられる（その端末が登録したリードは残る）。
 */
import { deleteFile, downloadText, ensureFolder, listFolderFiles, uploadFile, type DriveFile } from './drive.ts'
import type { Author } from './types.ts'

export const MAX_DEVICES = 10

export const DEVICE_FILE_RE = /^device-([a-z0-9]{8})\.json$/
export const deviceFileName = (deviceId: string) => `device-${deviceId}.json`

export interface DeviceEntry extends Author {
  registeredAt: number
}

export interface RegisteredFile {
  deviceId: string
  fileId: string
  createdTime: string
}

/** 登録ファイルを、登録の早い順（同時刻なら端末ID順）に並べる。全端末で同じ順になる */
export function sortRegistrations(files: RegisteredFile[]): RegisteredFile[] {
  return [...files].sort((a, b) =>
    a.createdTime === b.createdTime ? a.deviceId.localeCompare(b.deviceId) : a.createdTime.localeCompare(b.createdTime),
  )
}

/** この端末が、上限の内側（登録の早い MAX_DEVICES 台）に入っているか */
export function isWithinLimit(files: RegisteredFile[], deviceId: string, max = MAX_DEVICES): boolean {
  const unique = new Map<string, RegisteredFile>()
  for (const f of sortRegistrations(files)) if (!unique.has(f.deviceId)) unique.set(f.deviceId, f)
  return [...unique.keys()].slice(0, max).includes(deviceId)
}

function registrations(files: DriveFile[]): RegisteredFile[] {
  return files.flatMap((f) => {
    const m = f.name.match(DEVICE_FILE_RE)
    return m ? [{ deviceId: m[1], fileId: f.id, createdTime: f.createdTime || f.modifiedTime }] : []
  })
}

export class DeviceLimitError extends Error {
  constructor() {
    super('device-limit')
  }
}

/**
 * この端末を登録する（登録済みなら、登録者名が変わった時だけ書き直す）。上限を超える場合は DeviceLimitError。
 * 同期のたびに呼ぶ。files はフォルダーのファイル一覧。
 */
export async function ensureRegistered(
  files: DriveFile[],
  folderId: string,
  me: Author,
): Promise<void> {
  const regs = registrations(files)
  const mine = regs.find((r) => r.deviceId === me.deviceId)
  if (mine) {
    if (!isWithinLimit(regs, me.deviceId)) throw new DeviceLimitError()
    await refreshEntry(mine.fileId, folderId, me)
    return
  }
  if (new Set(regs.map((r) => r.deviceId)).size >= MAX_DEVICES) throw new DeviceLimitError()

  const entry: DeviceEntry = { ...me, registeredAt: Date.now() }
  const up = await uploadFile({
    name: deviceFileName(me.deviceId),
    mimeType: 'application/json',
    blob: new Blob([JSON.stringify(entry)], { type: 'application/json' }),
    parentId: folderId,
  })
  // ほぼ同時に他の端末も登録した場合に備えて、もう一度数える。上限の外なら、自分の登録を取り消す
  const after = registrations(await listFolderFiles(folderId))
  if (!after.some((r) => r.deviceId === me.deviceId)) after.push({ deviceId: me.deviceId, fileId: up.id, createdTime: up.modifiedTime })
  if (!isWithinLimit(after, me.deviceId)) {
    await deleteFile(up.id).catch(() => {})
    throw new DeviceLimitError()
  }
  cachedMember = me.member
}

let cachedMember: string | null = null

/** 登録者名が変わっていたら、登録ファイルの名前も直す（同じ内容なら書かない） */
async function refreshEntry(fileId: string, folderId: string, me: Author) {
  if (cachedMember === me.member) return
  const current = JSON.parse(await downloadText(fileId)) as Partial<DeviceEntry>
  if (current.member !== me.member || current.device !== me.device) {
    const entry: DeviceEntry = { ...me, registeredAt: current.registeredAt ?? Date.now() }
    await uploadFile({
      id: fileId,
      name: deviceFileName(me.deviceId),
      mimeType: 'application/json',
      blob: new Blob([JSON.stringify(entry)], { type: 'application/json' }),
      parentId: folderId,
    })
  }
  cachedMember = me.member
}

export interface DeviceInfo extends DeviceEntry {
  fileId: string
  /** 上限の内側に入っているか */
  active: boolean
}

/** 登録済みの端末の一覧（登録の早い順）。設定の画面で使う */
export async function listDevices(): Promise<DeviceInfo[]> {
  const folderId = await ensureFolder()
  const regs = sortRegistrations(registrations(await listFolderFiles(folderId)))
  const result: DeviceInfo[] = []
  for (const r of regs) {
    let entry: Partial<DeviceEntry> = {}
    try {
      entry = JSON.parse(await downloadText(r.fileId)) as Partial<DeviceEntry>
    } catch {
      // 読めない登録ファイルも、解除できるように一覧には出す
    }
    result.push({
      deviceId: r.deviceId,
      member: entry.member ?? '',
      device: entry.device ?? '',
      registeredAt: entry.registeredAt ?? Date.parse(r.createdTime),
      fileId: r.fileId,
      active: isWithinLimit(regs, r.deviceId),
    })
  }
  return result
}

/** 端末の登録を解除して、枠を空ける */
export async function unregisterDevice(fileId: string) {
  await deleteFile(fileId)
}
