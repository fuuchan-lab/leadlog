import { useCallback, useEffect, useMemo, useState } from 'react'
import { deletePhoto, getAllLeads, putLead, putPhoto } from '../db.ts'
import { currentAuthor } from '../device.ts'
import type { Lead, LeadFields } from '../types.ts'

export interface NewLeadExtras {
  /** 補正した名刺・バッジの画像（手入力なら無し） */
  photo: Blob | null
  ocrText: string
  exhibitionId: string
  exhibition: string
}

/** この端末に保存しているリード。追加・編集・削除すると、同期でドライブにも反映される */
export function useLeads() {
  /** 削除済みを含む全部 */
  const [all, setAll] = useState<Lead[]>([])

  const reload = useCallback(async () => {
    setAll(await getAllLeads())
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  /** 表示するリード（削除済みを除く、登録の新しい順） */
  const leads = useMemo(() => all.filter((l) => !l.deleted), [all])
  const unsyncedCount = useMemo(() => all.filter((l) => !l.synced).length, [all])

  const add = useCallback(
    async (fields: LeadFields, extras: NewLeadExtras): Promise<Lead> => {
      const now = Date.now()
      const author = currentAuthor()
      let photoId: string | null = null
      if (extras.photo) {
        photoId = crypto.randomUUID()
        await putPhoto({ id: photoId, blob: extras.photo, synced: false })
      }
      const lead: Lead = {
        ...trimFields(fields),
        // 来場日時と担当者は自動（保存した時刻と、この端末の登録者名）。あとで編集で直せる
        metAt: fields.metAt || now,
        staff: fields.staff.trim() || author.member,
        id: crypto.randomUUID(),
        photoId,
        ocrText: extras.ocrText,
        exhibitionId: extras.exhibitionId,
        exhibition: extras.exhibition,
        createdAt: now,
        createdBy: author,
        updatedAt: now,
        updatedBy: author,
        synced: false,
      }
      await putLead(lead)
      await reload()
      return lead
    },
    [reload],
  )

  const update = useCallback(
    async (lead: Lead, fields: LeadFields) => {
      await putLead({ ...lead, ...trimFields(fields), updatedAt: Date.now(), updatedBy: currentAuthor(), synced: false })
      await reload()
    },
    [reload],
  )

  /** 削除は印を付けるだけにして、同期で他の端末にも伝える。画像はこの端末から消す */
  const remove = useCallback(
    async (lead: Lead) => {
      await putLead({ ...lead, deleted: true, updatedAt: Date.now(), updatedBy: currentAuthor(), synced: false })
      if (lead.photoId) await deletePhoto(lead.photoId)
      await reload()
    },
    [reload],
  )

  return { leads, unsyncedCount, reload, add, update, remove }
}

export type LeadsState = ReturnType<typeof useLeads>

function trimFields(f: LeadFields): LeadFields {
  return {
    name: f.name.trim(),
    company: f.company.trim(),
    department: f.department.trim(),
    title: f.title.trim(),
    prefecture: f.prefecture.trim(),
    city: f.city.trim(),
    phone: f.phone.trim(),
    email: f.email.trim().toLowerCase(),
    importance: f.importance,
    customerType: f.customerType,
    interests: [...f.interests],
    note: f.note.trim(),
    nextSteps: f.nextSteps.map((s) => ({ action: s.action, who: s.who.trim(), when: s.when })),
    metAt: f.metAt,
    staff: f.staff.trim(),
  }
}
