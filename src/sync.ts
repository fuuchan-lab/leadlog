/**
 * 端末（IndexedDB）と Google ドライブの同期。
 *
 * ドライブの LeadLog フォルダーには、次のファイルを置く。
 * - leads-<端末ID>.json … その端末が最後に更新したリード（端末ごとに分けて、同時に書いても消し合わない。詳しくは syncMerge.ts）
 * - card-<画像ID>.jpg … 補正した名刺・バッジの画像（名前が重ならないので、どの端末が書いても衝突しない）
 * - device-<端末ID>.json … 使っている端末の登録（最大10台。devices.ts）
 * - settings.json … 全員共通の設定（展示会・重要度・顧客の種類）
 * - LeadLog_*.xlsx … Excel に書き出したもの
 *
 * 他の端末の画像は、一覧で表示する時に必要な分だけ取りに行く（展示会場の回線に負担をかけないため）。
 */
import { deletePhoto, getAllLeads, getUnsyncedPhotos, markLeadsSynced, markPhotoSynced, putLead } from './db.ts'
import { currentAuthor, getDeviceId } from './device.ts'
import { ensureRegistered } from './devices.ts'
import { deleteFile, downloadText, ensureFolder, listFolderFiles, uploadFile, type DriveFile } from './drive.ts'
import {
  isSettingsDirty,
  loadSettings,
  mergeSettings,
  parseSettings,
  sameSettings,
  saveSettings,
  serializeSettings,
  setSettingsDirty,
} from './settings.ts'
import { LEAD_FILE_RE, leadFileName, mergeLead, ownLeads, parseLeadFile, photoFileName, serializeLeads } from './syncMerge.ts'

export interface SyncResult {
  /** ドライブの内容を端末に取り込んだ（画面の更新が必要） */
  changedLocal: boolean
  uploaded: number
}

const INDEX_KEY = 'leadlog-drive-index'
const SETTINGS_FILE = 'settings.json'

/** ドライブのファイルID → 前回取り込んだ時の更新時刻 */
function loadIndex(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function saveIndex(index: Record<string, string>) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // 保存できなければ次回は全ファイルを取り込み直すだけ
  }
}

export function clearSyncIndex() {
  try {
    localStorage.removeItem(INDEX_KEY)
  } catch {
    // 無視
  }
}

/** 共通の設定。ドライブ側が変わっていれば取り込み、この端末に変更があれば合わせてから書き出す */
async function syncSettings(files: DriveFile[], folderId: string, index: Record<string, string>, lang: 'ja' | 'en') {
  const file = files.find((f) => f.name === SETTINGS_FILE)
  const wasDirty = isSettingsDirty()
  setSettingsDirty(false) // 同期中にこの端末で変更された分を取りこぼさないよう、先に外しておく
  let changedLocal = false
  try {
    const local = loadSettings(lang)
    let merged = local
    if (file && index[file.id] !== file.modifiedTime) {
      merged = mergeSettings(local, parseSettings(await downloadText(file.id), local))
      if (!sameSettings(merged, local)) {
        saveSettings(merged)
        changedLocal = true
      }
    }
    if (!file || wasDirty) {
      const up = await uploadFile({
        id: file?.id,
        name: SETTINGS_FILE,
        mimeType: 'application/json',
        blob: new Blob([serializeSettings(merged)], { type: 'application/json' }),
        parentId: folderId,
      })
      index[up.id] = up.modifiedTime
    } else {
      index[file.id] = file.modifiedTime
    }
    saveIndex(index)
  } catch (e) {
    if (wasDirty) setSettingsDirty(true) // 送れなかった変更は、次の同期でもう一度送る
    throw e
  }
  return changedLocal
}

async function doSync(lang: 'ja' | 'en'): Promise<SyncResult> {
  const folderId = await ensureFolder()
  const files = await listFolderFiles(folderId)
  const index = loadIndex()
  const deviceId = getDeviceId()
  // 共有アカウントで使える端末の数（最大10台）を超える場合は、ここで止める（DeviceLimitError）
  await ensureRegistered(files, folderId, currentAuthor())
  let changedLocal = await syncSettings(files, folderId, index, lang)
  let uploaded = 0

  // 1. 未アップロードの画像（リードより先に上げる。失敗したらリードも未同期のまま残る）
  const photoNames = new Set(files.filter((f) => f.name.startsWith('card-')).map((f) => f.name))
  for (const photo of await getUnsyncedPhotos()) {
    const name = photoFileName(photo.id)
    if (!photoNames.has(name)) {
      await uploadFile({ name, mimeType: 'image/jpeg', blob: photo.blob, parentId: folderId })
      photoNames.add(name)
    }
    await markPhotoSynced(photo.id)
  }

  // 2. 他の端末（と、以前のこの端末）のファイルのうち、前回から変わったものを取り込む
  const leadFiles = files.filter((f) => LEAD_FILE_RE.test(f.name))
  const local = new Map((await getAllLeads()).map((l) => [l.id, l]))
  for (const f of leadFiles) {
    if (index[f.id] === f.modifiedTime) continue
    for (const remote of parseLeadFile(await downloadText(f.id))) {
      const merged = mergeLead(local.get(remote.id), remote)
      if (!merged) continue
      await putLead(merged)
      local.set(merged.id, merged)
      changedLocal = true
      if (merged.deleted && merged.photoId) await deletePhoto(merged.photoId)
    }
    index[f.id] = f.modifiedTime
  }
  saveIndex(index)

  // 3. この端末で登録・編集・削除したリードがあれば、この端末のファイルを書き直す
  const all = [...local.values()]
  const pending = all.filter((l) => !l.synced)
  if (pending.length > 0) {
    const name = leadFileName(deviceId)
    const existing = leadFiles.find((f) => f.name === name)
    const up = await uploadFile({
      id: existing?.id,
      name,
      mimeType: 'application/json',
      blob: new Blob([serializeLeads(ownLeads(all, deviceId))], { type: 'application/json' }),
      parentId: folderId,
    })
    index[up.id] = up.modifiedTime
    saveIndex(index)
    await markLeadsSynced(pending.map((l) => ({ id: l.id, updatedAt: l.updatedAt })))
    uploaded = pending.length

    // 削除したリードの画像も、ドライブから消す
    const photoIds = new Map(files.filter((f) => f.name.startsWith('card-')).map((f) => [f.name, f.id]))
    for (const l of pending) {
      const fileId = l.deleted && l.photoId ? photoIds.get(photoFileName(l.photoId)) : undefined
      if (!fileId) continue
      try {
        await deleteFile(fileId)
      } catch {
        // すでに消えている場合など。リードの削除は伝わっているので、やり直さない
      }
    }
  }

  return { changedLocal, uploaded }
}

let running: Promise<SyncResult> | null = null
let rerun = false

/**
 * 同期する。実行中に呼ばれた場合は、いまの同期の後にもう一度だけ実行する
 * （同期中に増えたリードを取りこぼさないため）。
 */
export function syncNow(lang: 'ja' | 'en'): Promise<SyncResult> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    try {
      let result = await doSync(lang)
      while (rerun) {
        rerun = false
        const next = await doSync(lang)
        result = { changedLocal: result.changedLocal || next.changedLocal, uploaded: result.uploaded + next.uploaded }
      }
      return result
    } finally {
      running = null
      rerun = false
    }
  })()
  return running
}
