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
    value: PhotoRecord
  }
}

let dbPromise: Promise<IDBPDatabase<LeadDB>> | null = null

function getDB() {
  dbPromise ??= openDB<LeadDB>('leadlog', 1, {
    upgrade(db) {
      const leads = db.createObjectStore('leads', { keyPath: 'id' })
      leads.createIndex('by-created', 'createdAt')
      db.createObjectStore('photos', { keyPath: 'id' })
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
  const db = await getDB()
  await db.put('photos', photo)
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDB()
  return db.get('photos', id)
}

export async function getUnsyncedPhotos(): Promise<PhotoRecord[]> {
  const db = await getDB()
  return (await db.getAll('photos')).filter((p) => !p.synced)
}

export async function markPhotoSynced(id: string) {
  const db = await getDB()
  const cur = await db.get('photos', id)
  if (cur) await db.put('photos', { ...cur, synced: true })
}

export async function deletePhoto(id: string) {
  const db = await getDB()
  await db.delete('photos', id)
}
