import { useCallback, useEffect, useMemo, useState } from 'react'
import { deletePhoto, getAllLeads, putLead, putPhoto } from '../db.ts'
import { currentAuthor } from '../device.ts'
import type { Lead, LeadFields } from '../types.ts'

/** ごみ箱に置いておく日数（過ぎると完全に削除する） */
export const TRASH_DAYS = 30

/** リードの移し先の展示会（未分類なら id も name も ''） */
export interface ExhibitionRef {
  id: string
  name: string
}

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

  /** 表示するリード（削除済み・ごみ箱を除く、登録の新しい順） */
  const leads = useMemo(() => all.filter((l) => !l.deleted && !l.trashedAt), [all])
  /** ごみ箱のリード（ごみ箱に入れた新しい順） */
  const trash = useMemo(
    () => all.filter((l) => !l.deleted && l.trashedAt).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [all],
  )
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

  /** 内容を直す。target を渡すと、そのリードを別の展示会（未分類なら id が ''）に移す */
  const update = useCallback(
    async (lead: Lead, fields: LeadFields, target?: ExhibitionRef) => {
      await putLead({
        ...lead,
        ...trimFields(fields),
        ...(target ? { exhibitionId: target.id, exhibition: target.name } : {}),
        updatedAt: Date.now(),
        updatedBy: currentAuthor(),
        synced: false,
      })
      await reload()
    },
    [reload],
  )

  /** 複数のリードの項目をまとめて変える（同期で他の端末にも伝わる） */
  const patchMany = useCallback(
    async (list: Lead[], patch: (l: Lead) => Lead) => {
      const now = Date.now()
      const author = currentAuthor()
      for (const l of list) await putLead({ ...patch(l), updatedAt: now, updatedBy: author, synced: false })
      await reload()
    },
    [reload],
  )

  /** ごみ箱に入れる（一覧・集計・Excel から外れる。ごみ箱から元に戻せる） */
  const moveToTrash = useCallback(
    (list: Lead[]) => patchMany(list, (l) => ({ ...l, trashedAt: Date.now() })),
    [patchMany],
  )

  /** ごみ箱から元に戻す */
  const restore = useCallback(
    (list: Lead[]) =>
      patchMany(list, (l) => {
        const { trashedAt: _trashedAt, ...rest } = l
        return rest
      }),
    [patchMany],
  )

  /** 完全に削除する。記録は削除の印を付けて残し（同期で他の端末に伝えるため）、画像は消す */
  const purge = useCallback(
    async (list: Lead[]) => {
      for (const l of list) if (l.photoId) await deletePhoto(l.photoId)
      await patchMany(list, (l) => ({ ...l, deleted: true }))
    },
    [patchMany],
  )

  /** 別の展示会（未分類なら id が ''）にまとめて移す */
  const moveTo = useCallback(
    (list: Lead[], target: ExhibitionRef) =>
      patchMany(list, (l) => ({ ...l, exhibitionId: target.id, exhibition: target.name })),
    [patchMany],
  )

  // ごみ箱に入れてから一定の日数がたったリードは、完全に削除する
  useEffect(() => {
    const expired = trash.filter((l) => Date.now() - (l.trashedAt ?? 0) > TRASH_DAYS * 86_400_000)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (expired.length > 0) void purge(expired)
  }, [trash, purge])

  return { leads, trash, unsyncedCount, reload, add, update, moveToTrash, restore, purge, moveTo }
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
