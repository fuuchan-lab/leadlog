/**
 * 前に書き出した、展示会ごとのフォルダー（Excel・名刺画像・データ）を読み込み、この端末のリードに追加する。
 *
 * データ（leadlog-data.json）は、ドライブの同期で使うファイルと同じ形式（syncMerge.ts）にしているので、
 * 他の端末のファイルを取り込む時と同じ「新しい方を採用する」処理（mergeLead）をそのまま使える。
 * 同じフォルダーに名刺・バッジの画像があれば取り込み、無ければデータだけにする。
 * 取り込んだリードは、この端末ではまだドライブに送っていない扱いにして、次の同期でドライブにも反映する。
 */
import { getAllLeads, getPhoto, putLead, putPhoto } from './db.ts'
import { downloadBlob, downloadText, listFolderFiles } from './drive.ts'
import { mergeLead, PACKAGE_DATA_FILE, parseLeadFile, photoFileName, type RemoteLead } from './syncMerge.ts'
import { readZip } from './zip.ts'

export interface ImportResult {
  /** 新しく取り込んだ・更新したリードの件数 */
  imported: number
  /** そのうち、名刺・バッジの画像も一緒に取り込めた件数 */
  withPhoto: number
}

export class ImportDataMissingError extends Error {
  constructor() {
    super('import-data-missing')
  }
}

async function applyImport(
  remoteLeads: RemoteLead[],
  findPhoto: (photoId: string) => Promise<Blob | null>,
): Promise<ImportResult> {
  const localMap = new Map((await getAllLeads()).map((l) => [l.id, l]))
  let imported = 0
  let withPhoto = 0
  for (const remote of remoteLeads) {
    if (remote.deleted) continue
    const merged = mergeLead(localMap.get(remote.id), remote)
    if (!merged) continue
    let photoId = merged.photoId
    if (photoId) {
      if (await getPhoto(photoId)) {
        withPhoto++
      } else {
        const photo = await findPhoto(photoId)
        if (photo) {
          await putPhoto({ id: photoId, blob: photo, synced: false })
          withPhoto++
        } else {
          photoId = null
        }
      }
    }
    const lead = { ...merged, photoId, synced: false }
    await putLead(lead)
    localMap.set(lead.id, lead)
    imported++
  }
  return { imported, withPhoto }
}

/** ドライブの、展示会ごとのフォルダーから読み込む */
export async function importFromDriveFolder(folderId: string): Promise<ImportResult> {
  const files = await listFolderFiles(folderId)
  const dataFile = files.find((f) => f.name === PACKAGE_DATA_FILE)
  if (!dataFile) throw new ImportDataMissingError()
  const remoteLeads = parseLeadFile(await downloadText(dataFile.id))
  const photoIds = new Map(files.filter((f) => f.name.startsWith('card-')).map((f) => [f.name, f.id]))
  return applyImport(remoteLeads, async (photoId) => {
    const fileId = photoIds.get(photoFileName(photoId))
    return fileId ? downloadBlob(fileId) : null
  })
}

/** この端末に保存した ZIP ファイルから読み込む */
export async function importFromZip(file: Blob): Promise<ImportResult> {
  const entries = await readZip(file)
  const dataEntry = entries.find((e) => e.name === PACKAGE_DATA_FILE)
  if (!dataEntry) throw new ImportDataMissingError()
  const remoteLeads = parseLeadFile(new TextDecoder().decode(dataEntry.data))
  const photos = new Map(entries.filter((e) => e.name.startsWith('card-')).map((e) => [e.name, e.data]))
  return applyImport(remoteLeads, async (photoId) => {
    const data = photos.get(photoFileName(photoId))
    return data ? new Blob([data.slice()], { type: 'image/jpeg' }) : null
  })
}
