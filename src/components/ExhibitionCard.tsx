import { useRef, useState } from 'react'
import { putPhoto } from '../db.ts'
import { describeError } from '../errors.ts'
import { shrinkLogo } from '../scan/logo.ts'
import { belongsTo, dayCount, newExhibition, parseDate, type Exhibition } from '../exhibitions.ts'
import type { ExhibitionFields, SharedSettingsState } from '../hooks/useSharedSettings.ts'
import { LOCALES } from '../i18n/context.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { Lead } from '../types.ts'
import { DateRangePicker } from './DateRangePicker.tsx'
import { HourRangePicker } from './HourRangePicker.tsx'
import { LeadPhoto } from './LeadPhoto.tsx'

interface Props {
  shared: SharedSettingsState
  leads: Lead[]
}

type Tab = 'edit' | 'new' | 'open'

const fieldsOf = (e: Exhibition): ExhibitionFields => ({
  name: e.name,
  location: e.location,
  startDate: e.startDate,
  endDate: e.endDate,
  startHour: e.startHour,
  endHour: e.endHour,
  logoId: e.logoId,
})

/**
 * 設定の「展示会」。開いている展示会の編集、新しい展示会の作成、既存の展示会を開く、を切り替える。
 * 展示会の一覧と内容は全員で共有し、どれを開くかは端末ごと
 */
export function ExhibitionCard({ shared, leads }: Props) {
  const { t, lang } = useI18n()
  const { current, exhibitions } = shared
  const [tab, setTab] = useState<Tab>(current ? 'edit' : 'new')
  const [draft, setDraft] = useState<ExhibitionFields>(() => fieldsOf(current ?? newExhibition('draft')))
  const [saved, setSaved] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  /** コピーして新規作成した時の、コピー元の展示会名 */
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null)

  const fmt = (s: string) => parseDate(s).toLocaleDateString(LOCALES[lang], { month: 'numeric', day: 'numeric', weekday: 'short' })
  const period = (e: Pick<Exhibition, 'startDate' | 'endDate'>) =>
    `${fmt(e.startDate)} 〜 ${fmt(e.endDate)}（${t('exhibition.dayCount', { n: dayCount(e) })}）`

  const switchTab = (next: Tab) => {
    setTab(next)
    setSaved(false)
    setCopiedFrom(null)
    setDraft(fieldsOf(next === 'edit' && current ? current : newExhibition('draft')))
  }

  const set = (patch: Partial<ExhibitionFields>) => {
    setDraft({ ...draft, ...patch })
    setSaved(false)
  }

  /**
   * 開いている展示会の設定をコピーして、新しい展示会の入力を始める。
   * 名前（「（コピー）」を付ける）・会場・開場時間をコピーし、開催日は新しい日程を選ぶよう初期値に戻す。
   * リード（顧客情報）はコピーしない
   */
  const copyAsNew = (from: Exhibition) => {
    const fresh = newExhibition('draft')
    setTab('new')
    setSaved(false)
    setCopiedFrom(from.name || t('exhibition.untitled'))
    setDraft({
      ...fieldsOf(from),
      name: t('exhibition.copyName', { name: from.name }),
      startDate: fresh.startDate,
      endDate: fresh.endDate,
    })
  }

  /** アルバムから選んだロゴを縮小して保存する（同期でドライブにも上がり、ほかの端末にも表示される） */
  const pickLogo = async (file: File | undefined) => {
    if (!file) return
    setLogoError(null)
    try {
      const logo = await shrinkLogo(file)
      const id = `logo-${crypto.randomUUID()}`
      await putPhoto({ id, blob: logo.blob, synced: false })
      set({ logoId: id })
    } catch (e) {
      console.error('[logo]', e)
      setLogoError(describeError(e))
    }
  }

  const cleaned = { ...draft, name: draft.name.trim(), location: draft.location.trim() }
  const changed = current !== null && JSON.stringify(cleaned) !== JSON.stringify(fieldsOf(current))

  return (
    <section className="card">
      <h2>{t('exhibition.title')}</h2>
      <p className="muted small">{t('exhibition.help')}</p>
      {current ? (
        <p className="current-exhibition">
          <span className="muted small">{t('exhibition.current')}</span>
          <br />
          <strong>{current.name || t('exhibition.untitled')}</strong> <span className="muted small">{period(current)}</span>
        </p>
      ) : (
        <p className="banner banner-info">{t('exhibition.none')}</p>
      )}

      <div className="seg-tabs" role="tablist">
        {current && (
          <button type="button" role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => switchTab('edit')}>
            ✏️ {t('exhibition.tabEdit')}
          </button>
        )}
        <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => switchTab('new')}>
          ＋ {t('exhibition.tabNew')}
        </button>
        {exhibitions.length > 0 && (
          <button type="button" role="tab" aria-selected={tab === 'open'} className={tab === 'open' ? 'on' : ''} onClick={() => switchTab('open')}>
            📂 {t('exhibition.tabOpen')}
          </button>
        )}
      </div>

      {tab === 'open' ? (
        <ul className="exhibition-list">
          {exhibitions.map((e) => {
            const count = leads.filter((l) => belongsTo(l, e)).length
            const isCurrent = e.id === current?.id
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={`exhibition-item${isCurrent ? ' on' : ''}`}
                  onClick={() => {
                    shared.openExhibition(e.id)
                    setTab('edit')
                    setDraft(fieldsOf(e))
                    setSaved(false)
                  }}
                >
                  <span>
                    <strong>{e.name || t('exhibition.untitled')}</strong>
                    {isCurrent && <span className="tag tag-muted">{t('exhibition.opened')}</span>}
                    <br />
                    <span className="muted small">
                      {period(e)}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </span>
                  <span className="exhibition-count">{t('list.count', { n: count })}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="editor">
          {tab === 'edit' && current && (
            <button type="button" className="secondary" onClick={() => copyAsNew(current)}>
              📋 {t('exhibition.copyAsNew')}
            </button>
          )}
          {tab === 'new' && copiedFrom && (
            <p className="banner banner-info">{t('exhibition.copyNote', { name: copiedFrom })}</p>
          )}
          <label className="field">
            {t('exhibition.name')}
            <input
              type="text"
              maxLength={60}
              placeholder={t('exhibition.namePlaceholder')}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="field">
            {t('exhibition.location')}
            <input
              type="text"
              maxLength={80}
              placeholder={t('exhibition.locationPlaceholder')}
              value={draft.location}
              onChange={(e) => set({ location: e.target.value })}
            />
          </label>
          <div className="field">
            {t('exhibition.logo')}
            <div className="logo-field">
              {draft.logoId ? (
                <LeadPhoto key={draft.logoId} id={draft.logoId} className="logo-preview" alt={t('exhibition.logo')} />
              ) : (
                <span className="logo-empty muted small">{t('exhibition.logoNone')}</span>
              )}
              <span className="logo-actions">
                <button type="button" className="secondary" onClick={() => logoInput.current?.click()}>
                  🖼 {t(draft.logoId ? 'exhibition.logoChange' : 'exhibition.logoPick')}
                </button>
                {draft.logoId && (
                  <button type="button" className="link danger" onClick={() => set({ logoId: undefined })}>
                    {t('common.delete')}
                  </button>
                )}
              </span>
            </div>
            <span className="muted small">{t('exhibition.logoHelp')}</span>
            {logoError && (
              <span className="error small">
                {t('scan.failed')} ({logoError})
              </span>
            )}
            {/* capture を付けないので、スマホではアルバム（写真ライブラリ）から選べる */}
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickLogo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <div className="field">
            {t('exhibition.dates')}
            <DateRangePicker
              key={`${tab}-${current?.id ?? ''}`}
              startDate={draft.startDate}
              endDate={draft.endDate}
              onChange={(r) => set(r)}
            />
          </div>
          <div className="field">
            {t('exhibition.hours')}
            <HourRangePicker
              key={`${tab}-${current?.id ?? ''}`}
              startHour={draft.startHour}
              endHour={draft.endHour}
              onChange={(r) => set(r)}
            />
          </div>
          {tab === 'new' ? (
            <div className="row">
              <span />
              <button
                className="primary"
                disabled={!cleaned.name}
                onClick={() => {
                  shared.createExhibition(cleaned)
                  setTab('edit')
                  setCopiedFrom(null)
                  setSaved(true)
                }}
              >
                {t('exhibition.create')}
              </button>
            </div>
          ) : (
            current && (
              <div className="row">
                <button
                  className="link danger"
                  onClick={() => {
                    if (confirm(t('exhibition.confirmRemove', { name: current.name || t('exhibition.untitled') }))) {
                      shared.removeExhibition(current.id)
                      switchTab('open')
                    }
                  }}
                >
                  {t('common.delete')}
                </button>
                <span>
                  {saved && <span className="ok">{t('exhibition.saved')} </span>}
                  <button
                    className="primary"
                    disabled={!changed || !cleaned.name}
                    onClick={() => {
                      shared.updateExhibition(current.id, cleaned)
                      setSaved(true)
                    }}
                  >
                    {t('common.save')}
                  </button>
                </span>
              </div>
            )
          )}
          {!cleaned.name && <p className="muted small">{t('exhibition.needName')}</p>}
        </div>
      )}
    </section>
  )
}
