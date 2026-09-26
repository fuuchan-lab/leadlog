import { authorLabel } from '../device.ts'
import { matchingLeads } from '../duplicates.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { PREFECTURES } from '../scan/extract.ts'
import type { Category } from '../settings.ts'
import type { Lead, LeadFields, NextStep } from '../types.ts'
import { CategoryPicker, MultiCategoryPicker } from './CategoryPicker.tsx'
import { LeadPhoto } from './LeadPhoto.tsx'
import { MemberField } from './MemberField.tsx'
import { StickyNoteField } from './StickyNoteField.tsx'

/** 入力で選ぶリスト（設定で全員共通に変えられるもの） */
export interface FormLists {
  importance: Category[]
  customerTypes: Category[]
  interests: Category[]
  nextActions: Category[]
  /** 次のアクションの担当を選べる、登録者（社員）の一覧 */
  members: Category[]
}

interface Props {
  value: LeadFields
  onChange: (next: LeadFields) => void
  lists: FormLists
  /** この端末の登録者名（担当者の既定値） */
  member: string
  /** 重複の確認に使う、登録済みのリード */
  leads: Lead[]
  /** 編集中のリード。編集の時だけ、自動で記録した来場日時・担当者を直せる */
  editingId?: string
  /** 編集中のリードに保存済みの、名刺・バッジの画像 */
  photoId?: string
}

const TEXT_FIELDS: { key: 'name' | 'company' | 'department' | 'title'; label: MessageKey }[] = [
  { key: 'name', label: 'field.name' },
  { key: 'company', label: 'field.company' },
  { key: 'department', label: 'field.department' },
  { key: 'title', label: 'field.title' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** epoch ms → <input type="datetime-local"> の値（端末のローカル時刻） */
function toLocalInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * リードの入力欄（新規登録と編集で共通）。紙の Fair Meeting Note と同じ区切りにしている:
 * 基本情報 / 優先度・分類 / 興味のある分野 / メモ・コメント / 次のアクション
 */
export function LeadForm({ value, onChange, lists, member, leads, editingId, photoId }: Props) {
  const { t } = useI18n()
  const set = <K extends keyof LeadFields>(key: K, v: LeadFields[K]) => onChange({ ...value, [key]: v })
  const duplicates = matchingLeads(value, leads, editingId)
  const editing = editingId !== undefined

  const stepFor = (action: string) => value.nextSteps.find((s) => s.action === action)
  const toggleStep = (action: string) =>
    set(
      'nextSteps',
      stepFor(action)
        ? value.nextSteps.filter((s) => s.action !== action)
        : [...value.nextSteps, { action, who: member, when: '' }],
    )
  /** 日付（YYYY-MM-DD）と時刻（HH:MM）から来場日時を決める。どちらかが空なら変えない */
  const setMetAt = (date: string, time: string) => {
    if (!date || !time) return
    const ts = new Date(`${date}T${time}`).getTime()
    if (!Number.isNaN(ts)) set('metAt', ts)
  }
  const updateStep = (action: string, patch: Partial<NextStep>) =>
    set(
      'nextSteps',
      value.nextSteps.map((s) => (s.action === action ? { ...s, ...patch } : s)),
    )

  return (
    <div className="lead-form">
      {/* 担当者（受付）・次のアクションの担当、両方の入力欄で使う候補一覧 */}
      <datalist id="member-list">
        {lists.members.map((m) => (
          <option key={m.id} value={m.label} />
        ))}
      </datalist>
      <fieldset className="form-section">
        <legend>{t('form.sectionGeneral')}</legend>
        {photoId && <LeadPhoto id={photoId} className="scan-result" alt={t('form.photo')} />}
        <div className="form-grid">
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className="field">
              {t(f.label)}
              <input type="text" autoComplete="off" value={value[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            </label>
          ))}
          <label className="field">
            {t('field.prefecture')}
            <input
              type="text"
              list="prefecture-list"
              autoComplete="off"
              value={value.prefecture}
              onChange={(e) => set('prefecture', e.target.value)}
            />
            <datalist id="prefecture-list">
              {PREFECTURES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            {t('field.city')}
            <input type="text" autoComplete="off" value={value.city} onChange={(e) => set('city', e.target.value)} />
          </label>
          <label className="field">
            {t('field.phone')}
            <input type="tel" inputMode="tel" autoComplete="off" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="field">
            {t('field.email')}
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={value.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </label>
          {/* 来場日時と担当者は自動で記録する。編集の時だけ、直せるように出す */}
          {editing && (
            <>
              {/* 日付と時刻は別々の入力欄にする（スマホでは日時を1つにした入力欄が枠からはみ出して重なるため） */}
              <div className="field field-wide">
                {t('field.metAt')}
                <div className="met-at-fields">
                  <input
                    type="date"
                    aria-label={`${t('field.metAt')} (date)`}
                    value={value.metAt ? toLocalInput(value.metAt).slice(0, 10) : ''}
                    onChange={(e) => setMetAt(e.target.value, value.metAt ? toLocalInput(value.metAt).slice(11) : '00:00')}
                  />
                  <input
                    type="time"
                    aria-label={`${t('field.metAt')} (time)`}
                    value={value.metAt ? toLocalInput(value.metAt).slice(11) : ''}
                    onChange={(e) => setMetAt(value.metAt ? toLocalInput(value.metAt).slice(0, 10) : '', e.target.value)}
                  />
                </div>
              </div>
              <label className="field field-wide">
                {t('field.staff')}
                <MemberField value={value.staff} onChange={(v) => set('staff', v)} members={lists.members} />
              </label>
            </>
          )}
        </div>
        {!editing && <p className="muted small">{t('field.autoNote', { member: member || '—' })}</p>}
      </fieldset>

      {duplicates.length > 0 && (
        <p className="banner banner-caution" role="status">
          ⚠{' '}
          {t('form.duplicate', {
            who: duplicates
              .slice(0, 3)
              .map((d) => `${d.name || d.company || d.email} / ${authorLabel(d.createdBy)}`)
              .join('、'),
          })}
        </p>
      )}

      <fieldset className="form-section">
        <legend>{t('form.sectionPriority')}</legend>
        <CategoryPicker label={t('field.importance')} options={lists.importance} value={value.importance} onChange={(v) => set('importance', v)} />
        <CategoryPicker
          label={t('field.customerType')}
          options={lists.customerTypes}
          value={value.customerType}
          onChange={(v) => set('customerType', v)}
        />
      </fieldset>

      {lists.interests.length > 0 && (
        <fieldset className="form-section">
          <legend>{t('form.sectionInterest')}</legend>
          <MultiCategoryPicker
            label={t('field.interests')}
            options={lists.interests}
            value={value.interests}
            onChange={(v) => set('interests', v)}
          />
        </fieldset>
      )}

      <fieldset className="form-section">
        <legend>{t('form.sectionNotes')}</legend>
        <StickyNoteField value={value.note} onChange={(v) => set('note', v)} placeholder={t('field.notePlaceholder')} />
      </fieldset>

      {lists.nextActions.length > 0 && (
        <fieldset className="form-section">
          <legend>{t('field.nextSteps')}</legend>
          <ul className="next-steps">
            {lists.nextActions.map((a) => {
              const step = stepFor(a.id)
              return (
                <li key={a.id}>
                  <label className="check">
                    <input type="checkbox" checked={step !== undefined} onChange={() => toggleStep(a.id)} />
                    {a.label}
                  </label>
                  {step && (
                    <span className="next-step-fields">
                      <MemberField
                        value={step.who}
                        onChange={(v) => updateStep(a.id, { who: v })}
                        members={lists.members}
                        ariaLabel={`${a.label} ${t('field.who')}`}
                        placeholder={t('field.who')}
                      />
                      <input
                        type="date"
                        aria-label={`${a.label} ${t('field.when')}`}
                        value={step.when}
                        onChange={(e) => updateStep(a.id, { when: e.target.value })}
                      />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}
    </div>
  )
}
