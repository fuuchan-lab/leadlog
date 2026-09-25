import { useMemo, useState } from 'react'
import { authorLabel } from '../device.ts'
import { findDuplicates } from '../duplicates.ts'
import { belongsTo, isUnassigned, type Exhibition } from '../exhibitions.ts'
import { TRASH_DAYS, type ExhibitionRef } from '../hooks/useLeads.ts'
import { formatDateTime } from '../format.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Category } from '../settings.ts'
import { hasContent, type Lead, type LeadFields } from '../types.ts'
import { CategoryTag } from './CategoryPicker.tsx'
import { LeadForm, type FormLists } from './LeadForm.tsx'
import { LeadPhoto } from './LeadPhoto.tsx'
import { LeadPopup } from './LeadPopup.tsx'

interface Props {
  leads: Lead[]
  /** この端末で開いている展示会。一覧は、はじめはこの展示会のリードだけを出す */
  exhibition: Exhibition | null
  /** 削除済みを含む（名前を出すため） */
  allImportance: Category[]
  allCustomerTypes: Category[]
  allInterests: Category[]
  allNextActions: Category[]
  lists: FormLists
  member: string
  /** ごみ箱のリード */
  trash: Lead[]
  /** 展示会の一覧（削除した展示会を含む。未分類の判定に使う） */
  allExhibitions: Exhibition[]
  /** 移し先に選べる展示会（削除していないもの） */
  exhibitions: Exhibition[]
  /** 内容を直す。target を渡すと別の展示会に移す */
  onUpdate: (lead: Lead, fields: LeadFields, target?: ExhibitionRef) => Promise<void>
  onTrash: (list: Lead[]) => Promise<void>
  onRestore: (list: Lead[]) => Promise<void>
  onPurge: (list: Lead[]) => Promise<void>
  onMove: (list: Lead[], target: ExhibitionRef) => Promise<void>
}

type Scope = 'this' | 'unassigned' | 'all' | 'trash'

/** 移し先の選択肢の値（未分類は '-'） */
const UNASSIGNED = '-'

const PAGE = 30

const pick = (l: Lead): LeadFields => ({
  name: l.name,
  company: l.company,
  department: l.department,
  title: l.title,
  prefecture: l.prefecture,
  city: l.city,
  phone: l.phone,
  email: l.email,
  importance: l.importance,
  customerType: l.customerType,
  interests: l.interests ?? [],
  note: l.note,
  nextSteps: l.nextSteps ?? [],
  metAt: l.metAt || l.createdAt,
  staff: l.staff ?? l.createdBy.member,
})

/**
 * 登録したリードの一覧（頭痛ログの履歴と同じ形）。検索・重要度での絞り込み・編集・削除ができる。
 * 表示する範囲は「この展示会」「未分類」「すべての展示会」「ごみ箱」。削除はごみ箱に入れ、ごみ箱から元に戻せる
 */
export function LeadList({
  leads: allLeads,
  exhibition,
  allImportance,
  allCustomerTypes,
  allInterests,
  allNextActions,
  lists,
  member,
  trash,
  allExhibitions,
  exhibitions,
  onUpdate,
  onTrash,
  onRestore,
  onPurge,
  onMove,
}: Props) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  /** 編集中のリード。exhibitionId は移し先（未分類は UNASSIGNED） */
  const [editing, setEditing] = useState<{ id: string; fields: LeadFields; exhibitionId: string } | null>(null)
  const [popup, setPopup] = useState<Lead | null>(null)
  const [scopeState, setScope] = useState<Scope>('this')
  const [moveTarget, setMoveTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const unassigned = useMemo(() => allLeads.filter((l) => isUnassigned(l, allExhibitions)), [allLeads, allExhibitions])
  // 展示会がまだ無い時は「この展示会」を選べないので「すべて」にする。空になった一覧からは戻す
  const scope: Scope =
    scopeState === 'this' && !exhibition
      ? 'all'
      : (scopeState === 'unassigned' && unassigned.length === 0) || (scopeState === 'trash' && trash.length === 0)
        ? exhibition
          ? 'this'
          : 'all'
        : scopeState
  const leads = useMemo(() => {
    if (scope === 'trash') return trash
    if (scope === 'unassigned') return unassigned
    if (scope === 'this' && exhibition) return allLeads.filter((l) => belongsTo(l, exhibition))
    return allLeads
  }, [allLeads, exhibition, scope, trash, unassigned])

  const refOf = (id: string): ExhibitionRef => {
    const e = exhibitions.find((x) => x.id === id)
    return e ? { id: e.id, name: e.name } : { id: '', name: '' }
  }
  const currentExhibitionOf = (l: Lead) => exhibitions.find((e) => belongsTo(l, e))?.id ?? UNASSIGNED
  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    try {
      await job()
    } finally {
      setBusy(false)
    }
  }

  const duplicates = useMemo(() => findDuplicates(leads), [leads])
  const byId = (list: Category[], id: string) => list.find((c) => c.id === id)

  const filtered = useMemo(() => {
    const q = query.normalize('NFKC').trim().toLowerCase()
    return leads.filter((l) => {
      if (filter !== null && l.importance !== filter) return false
      if (!q) return true
      return [l.name, l.company, l.department, l.title, l.email, l.phone, l.city, l.prefecture, l.note, l.createdBy.member]
        .join(' ')
        .normalize('NFKC')
        .toLowerCase()
        .includes(q)
    })
  }, [leads, query, filter])

  return (
    <section className="card">
      <div className="row">
        <h2>{t('list.title')}</h2>
        <span className="muted">{t('list.count', { n: filtered.length })}</span>
      </div>
      <div className="chips scope-chips">
        {exhibition && (
          <button type="button" className={`chip${scope === 'this' ? ' on on-neutral' : ''}`} onClick={() => setScope('this')}>
            {t('list.thisExhibition')}: {exhibition.name || t('exhibition.untitled')}
          </button>
        )}
        {unassigned.length > 0 && (
          <button type="button" className={`chip${scope === 'unassigned' ? ' on on-neutral' : ''}`} onClick={() => setScope('unassigned')}>
            📦 {t('list.unassigned')} ({unassigned.length})
          </button>
        )}
        <button type="button" className={`chip${scope === 'all' ? ' on on-neutral' : ''}`} onClick={() => setScope('all')}>
          {t('list.allExhibitions')}
        </button>
        {trash.length > 0 && (
          <button type="button" className={`chip${scope === 'trash' ? ' on on-neutral' : ''}`} onClick={() => setScope('trash')}>
            🗑 {t('list.trash')} ({trash.length})
          </button>
        )}
      </div>
      {scope === 'unassigned' && <p className="muted small">{t('list.unassignedHelp')}</p>}
      {scope === 'trash' && <p className="muted small">{t('list.trashHelp', { days: TRASH_DAYS })}</p>}
      {leads.length > 0 && (
        <>
          <input
            type="search"
            className="search"
            placeholder={t('list.search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
          />
          <div className="chips filter-chips">
            <button type="button" className={`chip${filter === null ? ' on on-neutral' : ''}`} onClick={() => setFilter(null)}>
              {t('list.filterAll')}
            </button>
            {lists.importance.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip${filter === c.id ? ' on' : ''}`}
                style={filter === c.id ? { background: c.color, borderColor: c.color } : { borderColor: c.color }}
                onClick={() => setFilter(filter === c.id ? null : c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
      {leads.length === 0 && <p className="muted">{t('list.empty')}</p>}

      <ul className="history">
        {filtered.slice(0, limit).map((l) => {
          const dup = duplicates.get(l.id)
          const isEditing = editing?.id === l.id
          return (
            <li key={l.id}>
              <div className="row">
                <span className="muted small">
                  {formatDateTime(l.metAt || l.createdAt, lang)} · {t('list.by', { who: l.staff || authorLabel(l.createdBy) })}
                </span>
                {scope === 'trash' ? (
                  <span>
                    <button className="link" disabled={busy} onClick={() => void run(() => onRestore([l]))}>
                      {t('list.restore')}
                    </button>
                    <button
                      className="link danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t('list.confirmPurge'))) void run(() => onPurge([l]))
                      }}
                    >
                      {t('list.purge')}
                    </button>
                  </span>
                ) : (
                  <span>
                    {!isEditing && (
                      <button
                        className="link"
                        onClick={() => setEditing({ id: l.id, fields: pick(l), exhibitionId: currentExhibitionOf(l) })}
                      >
                        {t('common.edit')}
                      </button>
                    )}
                    <button
                      className="link danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(t('list.confirmDelete'))) void run(() => onTrash([l]))
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="editor">
                  <LeadForm
                    value={editing.fields}
                    onChange={(fields) => setEditing({ ...editing, fields })}
                    lists={lists}
                    member={member}
                    leads={leads}
                    editingId={l.id}
                  />
                  {/* 登録した展示会を変える（未分類のリードを展示会に入れる時など） */}
                  <label className="field">
                    {t('list.exhibitionOfLead')}
                    <select
                      value={editing.exhibitionId}
                      onChange={(e) => setEditing({ ...editing, exhibitionId: e.target.value })}
                    >
                      <option value={UNASSIGNED}>📦 {t('list.unassigned')}</option>
                      {exhibitions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || t('exhibition.untitled')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="row">
                    <button className="link" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                    <button
                      className="primary"
                      disabled={!hasContent(editing.fields)}
                      onClick={async () => {
                        const moved = editing.exhibitionId !== currentExhibitionOf(l)
                        await onUpdate(l, editing.fields, moved ? refOf(editing.exhibitionId === UNASSIGNED ? '' : editing.exhibitionId) : undefined)
                        setEditing(null)
                      }}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lead-item">
                  <button type="button" className="lead-main" onClick={() => setPopup(l)}>
                    <span className="lead-name">
                      <CategoryTag category={byId(allImportance, l.importance)} />
                      <strong>{l.name || t('list.noName')}</strong>
                      {l.title && <span className="muted small"> {l.title}</span>}
                    </span>
                    <span className="lead-company">
                      {[l.company, l.department].filter(Boolean).join(' / ')}
                    </span>
                    <span className="muted small">
                      {[l.prefecture + l.city, l.phone, l.email].filter(Boolean).join('　')}
                    </span>
                    <span className="lead-tags">
                      <CategoryTag category={byId(allCustomerTypes, l.customerType)} />
                      {(l.interests ?? []).map((id) => (
                        <CategoryTag key={id} category={byId(allInterests, id)} />
                      ))}
                      {(l.nextSteps ?? []).map((s) => (
                        <span key={s.action} className="tag tag-outline">
                          → {byId(allNextActions, s.action)?.label ?? ''}
                          {s.who && ` (${s.who}${s.when ? ` ${s.when.slice(5).replace('-', '/')}` : ''})`}
                        </span>
                      ))}
                      {dup && <span className="tag tag-warn">⚠ {t('list.duplicate')}</span>}
                      {!l.synced && <span className="tag tag-muted">{t('list.unsynced')}</span>}
                    </span>
                  </button>
                  {l.photoId && <LeadPhoto id={l.photoId} className="thumb" onClick={() => setPopup(l)} />}
                </div>
              )}
              {!isEditing && l.note && <p className="sticky-note">{l.note}</p>}
              {!isEditing && l.updatedAt !== l.createdAt && (
                <p className="muted small">
                  {t('list.editedBy', { who: authorLabel(l.updatedBy), time: formatDateTime(l.updatedAt, lang) })}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {filtered.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + PAGE)}>
          {t('list.more')}
        </button>
      )}

      {/* 未分類のリードを、まとめて展示会に移す */}
      {scope === 'unassigned' && filtered.length > 0 && exhibitions.length > 0 && (
        <div className="bulk-move">
          <select value={moveTarget} aria-label={t('list.moveTo')} onChange={(e) => setMoveTarget(e.target.value)}>
            <option value="">{t('list.moveTo')}</option>
            {exhibitions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || t('exhibition.untitled')}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={!moveTarget || busy}
            onClick={() => {
              const target = refOf(moveTarget)
              if (confirm(t('list.confirmMove', { n: filtered.length, name: target.name || t('exhibition.untitled') }))) {
                void run(() => onMove(filtered, target))
                setMoveTarget('')
              }
            }}
          >
            {t('list.moveAll', { n: filtered.length })}
          </button>
        </div>
      )}

      {/* 一覧のリードを、まとめてごみ箱へ（本当に削除するか確かめる） */}
      {scope !== 'trash' && filtered.length > 0 && (
        <button
          className="danger-btn bulk-delete"
          disabled={busy}
          onClick={() => {
            if (confirm(t('list.confirmDeleteAll', { n: filtered.length }))) void run(() => onTrash(filtered))
          }}
        >
          🗑 {t('list.deleteAll', { n: filtered.length })}
        </button>
      )}

      {/* ごみ箱を空にする */}
      {scope === 'trash' && trash.length > 0 && (
        <div className="bulk-move">
          <button className="secondary" disabled={busy} onClick={() => void run(() => onRestore(trash))}>
            {t('list.restoreAll', { n: trash.length })}
          </button>
          <button
            className="danger-btn"
            disabled={busy}
            onClick={() => {
              if (confirm(t('list.confirmEmptyTrash', { n: trash.length }))) void run(() => onPurge(trash))
            }}
          >
            {t('list.emptyTrash')}
          </button>
        </div>
      )}
      {popup && (
        <LeadPopup
          lead={popup}
          importance={allImportance}
          customerTypes={allCustomerTypes}
          interests={allInterests}
          nextActions={allNextActions}
          duplicates={duplicates.get(popup.id) ?? []}
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  )
}
