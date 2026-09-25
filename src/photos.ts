/**
 * リードの画像を取り出す。この端末に無ければ（他の端末で撮った画像）、ログイン中ならドライブから取ってきて保存する。
 * 一覧を開くたびに全員の画像を取りに行かないよう、表示する時にだけ取りに行く。
 */
import { deletePhoto, getPhoto, getPhotoInfo, putPhoto } from './db.ts'
import { downloadBlob, ensureFolder, findFileId, hasAccessToken } from './drive.ts'
import { photoFileName } from './syncMerge.ts'

const inflight = new Map<string, Promise<Blob | null>>()

export function loadLeadPhoto(photoId: string): Promise<Blob | null> {
  const running = inflight.get(photoId)
  if (running) return running
  const job = (async () => {
    const local = await getPhoto(photoId)
    if (local) return local.blob
    if (!hasAccessToken() || navigator.onLine === false) return null
    try {
      const fileId = await findFileId(await ensureFolder(), photoFileName(photoId))
      if (!fileId) return null
      const blob = await downloadBlob(fileId)
      await putPhoto({ id: photoId, blob, synced: true })
      return blob
    } catch (e) {
      console.error('[photo]', e)
      return null
    }
  })().finally(() => inflight.delete(photoId))
  inflight.set(photoId, job)
  return job
}

/**
 * 画像を表示できなかった時（端末に保存した画像が壊れていた時など）に、ドライブから取り直す。
 * まだドライブに上げていない画像は、消すと失われるので取り直さない。取り直せなければ null
 */
export async function reloadLeadPhoto(photoId: string): Promise<Blob | null> {
  const info = await getPhotoInfo(photoId)
  if (info && !info.synced) return null
  if (!hasAccessToken() || navigator.onLine === false) return null
  if (info) await deletePhoto(photoId)
  return loadLeadPhoto(photoId)
}
