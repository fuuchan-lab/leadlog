import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Lead, PhotoRecord } from './types.ts'

interface LeadDB extends DBSchema {
  leads: {
    key: string
    value: Lead
    indexes: { 'by-created': number }
  }
  photos: {
    key: string
    value: StoredPhoto
    indexes: { 'by-pending': number }
  }
}

/**
 * 端末に保存する画像。画像は Blob のままではなく、バイト列（ArrayBuffer）で保存する。
 * iPhone の Safari では、IndexedDB に保存した Blob を後で読み出すと中身を読めない（画像が「?」になる）ことがあるため。
 * 以前のバージョンで Blob のまま保存したものは blob に入っている
 */
interface StoredPhoto {
  id: string
  data?: ArrayBuffer
  type?: string
  blob?: Blob
  synced: boolean
  /**
   * まだドライブに上げていない画像だけに付ける印（1）。同期のたびに全部の画像を読まずに、
   * 上げていない画像だけを索引（by-pending）で探すため。上げたら消す（印の無い画像は索引に入らない）
   */
  pending?: 1
}

/** 同期済みかどうかに合わせて、未同期の印を付ける・外す */
function withPending(p: StoredPhoto): StoredPhoto {
  const { pending: _pending, ...rest } = p
  return p.synced ? rest : { ...rest, pending: 1 }
}

async function toStored(photo: PhotoRecord): Promise<StoredPhoto> {
  return withPending({ id: photo.id, data: await photo.blob.arrayBuffer(), type: photo.blob.type || 'image/jpeg', synced: photo.synced })
}

/**
 * 保存した画像を読み出す。以前の形（Blob）は、読めればバイト列の形に直して保存し直し、読めなければ無かったことにする
 */
async function fromStored(stored: StoredPhoto | undefined): Promise<PhotoRecord | undefined> {
  if (!stored) return undefined
  if (stored.data) return { id: stored.id, blob: new Blob([stored.data], { type: stored.type || 'image/jpeg' }), synced: stored.synced }
  if (!stored.blob) return undefined
  try {
    const data = await stored.blob.arrayBuffer()
    if (data.byteLength === 0) throw new Error('empty-photo')
    const type = stored.blob.type || 'image/jpeg'
    const db = await getDB()
    await db.put('photos', withPending({ id: stored.id, data, type, synced: stored.synced }))
    return { id: stored.id, blob: new Blob([data], { type }), synced: stored.synced }
  } catch (e) {
    console.error('[photo-unreadable]', stored.id, e)
    return undefined
  }
}

let dbPromise: Promise<IDBPDatabase<LeadDB>> | null = null

function getDB() {
  dbPromise ??= openDB<LeadDB>('leadlog', 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        const leads = db.createObjectStore('leads', { keyPath: 'id' })
        leads.createIndex('by-created', 'createdAt')
        db.createObjectStore('photos', { keyPath: 'id' })
      }
      // 版 2: 未同期の画像の索引。すでにある画像のうち、まだ上げていないものに印を付ける
      if (oldVersion < 2) {
        const photos = tx.objectStore('photos')
        photos.createIndex('by-pending', 'pending')
        for (let cursor = await photos.openCursor(); cursor; cursor = await cursor.continue()) {
          if (!cursor.value.synced) await cursor.update(withPending(cursor.value))
        }
      }
    },
  })
  return dbPromise
}

/** 削除済みを含む全リード（新しい順）。同期で使う */
export async function getAllLeads(): Promise<Lead[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('leads', 'by-created')
  return all.reverse()
}

export async function putLead(lead: Lead) {
  const db = await getDB()
  await db.put('leads', lead)
}

/** 複数のリードを1回のトランザクションで保存する（1件ずつ保存するより、まとめて操作する時にずっと速い） */
export async function putLeads(leads: Lead[]) {
  if (leads.length === 0) return
  const db = await getDB()
  const tx = db.transaction('leads', 'readwrite')
  await Promise.all([...leads.map((l) => tx.store.put(l)), tx.done])
}

/** 同期の間に編集されていなければ、同期済みにする */
export async function markLeadsSynced(items: { id: string; updatedAt: number }[]) {
  const db = await getDB()
  const tx = db.transaction('leads', 'readwrite')
  for (const { id, updatedAt } of items) {
    const cur = await tx.store.get(id)
    if (cur && cur.updatedAt === updatedAt) await tx.store.put({ ...cur, synced: true })
  }
  await tx.done
}

export async function putPhoto(photo: PhotoRecord) {
  // バイト列にしてから保存する（読み出し中にトランザクションが閉じないよう、先に変換する）
  const stored = await toStored(photo)
  const db = await getDB()
  await db.put('photos', stored)
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDB()
  return fromStored(await db.get('photos', id))
}

/** 保存している画像の元データ（同期済みかどうかを見るため。読み出せるかは確かめない） */
export async function getPhotoInfo(id: string): Promise<{ synced: boolean } | undefined> {
  const db = await getDB()
  const stored = await db.get('photos', id)
  return stored ? { synced: stored.synced } : undefined
}

export async function getUnsyncedPhotos(): Promise<PhotoRecord[]> {
  const db = await getDB()
  // 未同期の印が付いた画像だけを読む（同期済みの画像のバイト列は読まない）
  const unsynced = await db.getAllFromIndex('photos', 'by-pending')
  const result: PhotoRecord[] = []
  for (const p of unsynced) {
    const photo = await fromStored(p)
    if (photo) result.push(photo)
  }
  return result
}

export async function markPhotoSynced(id: string) {
  const db = await getDB()
  const cur = await db.get('photos', id)
  if (cur) await db.put('photos', withPending({ ...cur, synced: true }))
}

export async function deletePhoto(id: string) {
  const db = await getDB()
  await db.delete('photos', id)
}

/** 複数の画像を1回のトランザクションで消す */
export async function deletePhotos(ids: string[]) {
  if (ids.length === 0) return
  const db = await getDB()
  const tx = db.transaction('photos', 'readwrite')
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done])
}
