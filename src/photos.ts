/**
 * リードの画像を取り出す。この端末に無ければ（他の端末で撮った画像）、ログイン中ならドライブから取ってきて保存する。
 * 一覧を開くたびに全員の画像を取りに行かないよう、表示する時にだけ取りに行く。
 */
import { getPhoto, putPhoto } from './db.ts'
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
