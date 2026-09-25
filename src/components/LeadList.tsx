import { useMemo, useState } from 'react'
import { authorLabel } from '../device.ts'
import { findDuplicates } from '../duplicates.ts'
import { belongsTo, type Exhibition } from '../exhibitions.ts'
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
  onUpdate: (lead: Lead, fields: LeadFields) => Promise<void>
  onRemove: (lead: Lead) => void
}

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

/** 登録したリードの一覧（頭痛ログの履歴と同じ形）。検索・重要度での絞り込み・編集・削除ができる */
export function LeadList({ leads: allLeads, exhibition, allImportance, allCustomerTypes, allInterests, allNextActions, lists, member, onUpdate, onRemove }: Props) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<{ id: string; fields: LeadFields } | null>(null)
  const [popup, setPopup] = useState<Lead | null>(null)
  const [scope, setScope] = useState<'this' | 'all'>('this')
  // 開いている展示会のリード（「すべての展示会」を選ぶと全部）
  const leads = useMemo(
    () => (scope === 'this' && exhibition ? allLeads.filter((l) => belongsTo(l, exhibition)) : allLeads),
    [allLeads, exhibition, scope],
  )

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
      {exhibition && (
        <div className="chips scope-chips">
          <button type="button" className={`chip${scope === 'this' ? ' on on-neutral' : ''}`} onClick={() => setScope('this')}>
            {t('list.thisExhibition')}: {exhibition.name || t('exhibition.untitled')}
          </button>
          <button type="button" className={`chip${scope === 'all' ? ' on on-neutral' : ''}`} onClick={() => setScope('all')}>
            {t('list.allExhibitions')}
          </button>
        </div>
      )}
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
                <span>
                  {!isEditing && (
                    <button className="link" onClick={() => setEditing({ id: l.id, fields: pick(l) })}>
                      {t('common.edit')}
                    </button>
                  )}
                  <button
                    className="link danger"
                    onClick={() => {
                      if (confirm(t('list.confirmDelete'))) onRemove(l)
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </span>
              </div>

              {isEditing ? (
                <div className="editor">
                  <LeadForm
                    value={editing.fields}
                    onChange={(fields) => setEditing({ id: l.id, fields })}
                    lists={lists}
                    member={member}
                    leads={leads}
                    editingId={l.id}
                  />
                  <div className="row">
                    <button className="link" onClick={() => setEditing(null)}>
                      {t('common.cancel')}
                    </button>
                    <button
                      className="primary"
                      disabled={!hasContent(editing.fields)}
                      onClick={async () => {
                        await onUpdate(l, editing.fields)
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
