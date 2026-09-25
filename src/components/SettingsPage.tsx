import { useState } from 'react'
import { describeDevice, getDeviceId } from '../device.ts'
import { driveConfig } from '../drive.ts'
import type { SharedSettingsState } from '../hooks/useSharedSettings.ts'
import type { Lang } from '../i18n/context.ts'
import { useI18n } from '../i18n/useI18n.ts'
import { isOcrReady, prepareOcr } from '../scan/ocr.ts'
import { DAYS_MAX, DAYS_MIN, type Exhibition } from '../settings.ts'
import { applyTheme, loadTheme, saveTheme, type ThemePreference } from '../theme.ts'
import type { Lead } from '../types.ts'
import { CategoryEditor } from './CategoryEditor.tsx'
import { DevicesCard } from './DevicesCard.tsx'

interface Props {
  shared: SharedSettingsState
  member: string
  onMember: (name: string) => void
  /** 書き出すリード（削除済みを除く） */
  leads: Lead[]
  /** Google にログインしているか（ドライブへの保存に必要） */
  loggedIn: boolean
}

type ExportState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'done'; name: string; id?: string }
  | { status: 'error' }

type OcrState = { status: 'idle' | 'ready' | 'error' } | { status: 'busy'; p: number }

export function SettingsPage({ shared, member, onMember, leads, loggedIn }: Props) {
  const { t, lang, setLang } = useI18n()
  const [theme, setTheme] = useState<ThemePreference>(loadTheme)
  const [memberDraft, setMemberDraft] = useState(member)
  const [memberSaved, setMemberSaved] = useState(false)
  const [ex, setEx] = useState<Exhibition>(shared.settings.exhibition)
  const [exSaved, setExSaved] = useState(false)
  const [exp, setExp] = useState<ExportState>({ status: 'idle' })
  const [scope, setScope] = useState<'all' | 'exhibition'>('exhibition')
  const [ocr, setOcr] = useState<OcrState>({ status: isOcrReady() ? 'ready' : 'idle' })

  const changeTheme = (next: ThemePreference) => {
    setTheme(next)
    saveTheme(next)
    applyTheme(next)
  }

  const exName = shared.settings.exhibition.name
  const exLeads = leads.filter((l) => l.exhibition === exName)
  const targets = scope === 'exhibition' && exName ? exLeads : leads

  const runExport = async (to: 'drive' | 'device') => {
    setExp({ status: 'busy' })
    try {
      // Excel 出力のライブラリは、使う時だけ読み込む
      const { exportToDrive, exportToDevice } = await import('../exportExcel.ts')
      const run = to === 'drive' ? exportToDrive : exportToDevice
      const name = scope === 'exhibition' && exName ? exName : ''
      setExp({ status: 'done', ...(await run(targets, shared.settings, t, lang, name)) })
    } catch (e) {
      console.error('[export]', e)
      setExp({ status: 'error' })
    }
  }

  const exChanged = JSON.stringify(ex) !== JSON.stringify(shared.settings.exhibition)
  const setExField = <K extends keyof Exhibition>(key: K, value: Exhibition[K]) => {
    setEx({ ...ex, [key]: value })
    setExSaved(false)
  }
  const hours = Array.from({ length: 25 }, (_, h) => h)

  return (
    <>
      <section className="card">
        <div className="row">
          <h2>{t('settings.language')}</h2>
          <select
            className="language-select"
            value={lang}
            aria-label={t('settings.language')}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="row theme-row">
          <h2>{t('settings.theme')}</h2>
          <select
            className="language-select"
            value={theme}
            aria-label={t('settings.theme')}
            onChange={(e) => changeTheme(e.target.value as ThemePreference)}
          >
            <option value="auto">{t('settings.theme.auto')}</option>
            <option value="light">{t('settings.theme.light')}</option>
            <option value="dark">{t('settings.theme.dark')}</option>
          </select>
        </div>
      </section>

      <section className="card">
        <h2>{t('device.title')}</h2>
        <p className="muted small">{t('device.help')}</p>
        <label className="field">
          {t('device.member')}
          <div className="two">
            <input
              type="text"
              className="grow"
              maxLength={30}
              placeholder={t('member.placeholder')}
              value={memberDraft}
              onChange={(e) => {
                setMemberDraft(e.target.value)
                setMemberSaved(false)
              }}
            />
            <button
              className="primary"
              disabled={!memberDraft.trim() || memberDraft.trim() === member}
              onClick={() => {
                onMember(memberDraft.trim())
                setMemberSaved(true)
              }}
            >
              {t('common.save')}
            </button>
          </div>
        </label>
        {memberSaved && <p className="ok">{t('device.saved')}</p>}
        <p className="muted small">{t('device.info', { device: describeDevice(navigator.userAgent), id: getDeviceId() })}</p>
      </section>

      <DevicesCard loggedIn={loggedIn} />

      <section className="card">
        <h2>{t('exhibition.title')}</h2>
        <p className="muted small">{t('exhibition.help')}</p>
        <label className="field">
          {t('exhibition.name')}
          <input
            type="text"
            maxLength={60}
            placeholder={t('exhibition.namePlaceholder')}
            value={ex.name}
            onChange={(e) => setExField('name', e.target.value)}
          />
        </label>
        <label className="field">
          {t('exhibition.location')}
          <input
            type="text"
            maxLength={80}
            placeholder={t('exhibition.locationPlaceholder')}
            value={ex.location}
            onChange={(e) => setExField('location', e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            {t('exhibition.start')}
            <input type="date" value={ex.startDate} onChange={(e) => e.target.value && setExField('startDate', e.target.value)} />
          </label>
          <label className="field">
            {t('exhibition.days')}
            <select value={ex.days} onChange={(e) => setExField('days', Number(e.target.value))}>
              {Array.from({ length: DAYS_MAX - DAYS_MIN + 1 }, (_, i) => DAYS_MIN + i).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          {t('exhibition.hours')}
          <div className="hours-row">
            <select
              value={ex.startHour}
              aria-label={t('exhibition.hours')}
              onChange={(e) => {
                const startHour = Number(e.target.value)
                setEx({ ...ex, startHour, endHour: Math.max(ex.endHour, startHour + 1) })
                setExSaved(false)
              }}
            >
              {hours.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span>{t('exhibition.from')}</span>
            <select value={ex.endHour} aria-label={t('exhibition.hours')} onChange={(e) => setExField('endHour', Number(e.target.value))}>
              {hours.filter((h) => h > ex.startHour).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span>{t('exhibition.to')}</span>
          </div>
        </div>
        <div className="row">
          <span>{exSaved && <span className="ok">{t('exhibition.saved')}</span>}</span>
          <button
            className="primary"
            disabled={!exChanged}
            onClick={() => {
              shared.setExhibition({ ...ex, name: ex.name.trim(), location: ex.location.trim() })
              setExSaved(true)
            }}
          >
            {t('common.save')}
          </button>
        </div>
      </section>

      {(['importance', 'customerTypes', 'interests', 'nextActions'] as const).map((kind) => (
        <CategoryEditor
          key={kind}
          title={t(`category.${kind}`)}
          help={t(`category.${kind}Help`)}
          items={shared[kind]}
          onAdd={(label) => shared.categories.add(kind, label)}
          onUpdate={(id, label, color) => shared.categories.update(kind, id, label, color)}
          onRemove={(id) => shared.categories.remove(kind, id)}
          onMove={(id, dir) => shared.categories.move(kind, id, dir)}
        />
      ))}

      <section className="card">
        <h2>{t('ocrPrep.title')}</h2>
        <p className="muted small">{t('ocrPrep.help')}</p>
        {ocr.status === 'ready' ? (
          <p className="ok">✓ {t('ocrPrep.ready')}</p>
        ) : (
          <button
            className="secondary"
            disabled={ocr.status === 'busy'}
            onClick={async () => {
              setOcr({ status: 'busy', p: 0 })
              try {
                await prepareOcr((p) => setOcr({ status: 'busy', p: p.progress }))
                setOcr({ status: 'ready' })
              } catch (e) {
                console.error('[ocr-prepare]', e)
                setOcr({ status: 'error' })
              }
            }}
          >
            {ocr.status === 'busy' ? t('ocr.loading', { p: Math.round(ocr.p * 100) }) : t('ocrPrep.button')}
          </button>
        )}
        {ocr.status === 'error' && <p className="error">{t('ocrPrep.failed')}</p>}
      </section>

      <section className="card">
        <h2>{t('export.title')}</h2>
        <p className="muted small">{t('export.help', { folder: driveConfig.folderName })}</p>
        {exName && (
          <div className="field" role="radiogroup" aria-label={t('export.scope')}>
            {t('export.scope')}
            <label className="radio">
              <input type="radio" checked={scope === 'exhibition'} onChange={() => setScope('exhibition')} />
              {t('export.scopeExhibition', { name: exName, n: exLeads.length })}
            </label>
            <label className="radio">
              <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
              {t('export.scopeAll', { n: leads.length })}
            </label>
          </div>
        )}
        <div className="capture-buttons">
          <button
            className="primary"
            disabled={!loggedIn || targets.length === 0 || exp.status === 'busy'}
            onClick={() => void runExport('drive')}
          >
            {exp.status === 'busy' ? t('export.busy') : t('export.button')}
          </button>
          <button
            className="secondary"
            disabled={targets.length === 0 || exp.status === 'busy'}
            onClick={() => void runExport('device')}
          >
            {t('export.download')}
          </button>
        </div>
        {!loggedIn && <p className="muted small">{t('export.needLogin')}</p>}
        {targets.length === 0 && <p className="muted small">{t('export.noRecords')}</p>}
        {exp.status === 'done' && (
          <p className="ok" role="status">
            {t('export.done', { name: exp.name })}{' '}
            {exp.id && (
              <a href={`https://drive.google.com/file/d/${exp.id}/view`} target="_blank" rel="noopener noreferrer">
                {t('export.open')}
              </a>
            )}
          </p>
        )}
        {exp.status === 'error' && (
          <p className="error" role="alert">
            {t('export.failed')}
          </p>
        )}
      </section>

      <p className="privacy-link">
        <a href="./privacy.html" target="_blank" rel="noopener">
          {t('settings.privacy')}
        </a>
      </p>
    </>
  )
}
