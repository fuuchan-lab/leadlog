import { useEffect } from 'react'
import { authorLabel } from '../device.ts'
import { formatDateTime } from '../format.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { categoryLabel, type Category } from '../settings.ts'
import type { Lead } from '../types.ts'
import { LeadPhoto } from './LeadPhoto.tsx'

interface Props {
  lead: Lead
  importance: Category[]
  customerTypes: Category[]
  interests: Category[]
  nextActions: Category[]
  duplicates: Lead[]
  onClose: () => void
}

/** リードの詳細（全項目・画像・登録者・読み取った文字） */
export function LeadPopup({ lead, importance, customerTypes, interests, nextActions, duplicates, onClose }: Props) {
  const { t, lang } = useI18n()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const rows: [MessageKey, string][] = [
    ['field.name', lead.name],
    ['field.company', lead.company],
    ['field.department', lead.department],
    ['field.title', lead.title],
    ['field.prefecture', lead.prefecture],
    ['field.city', lead.city],
    ['field.phone', lead.phone],
    ['field.email', lead.email],
    ['field.importance', categoryLabel(importance, lead.importance)],
    ['field.customerType', categoryLabel(customerTypes, lead.customerType)],
    ['field.interests', (lead.interests ?? []).map((id) => categoryLabel(interests, id)).join('、')],
    [
      'field.nextSteps',
      (lead.nextSteps ?? [])
        .map((s) => `${categoryLabel(nextActions, s.action)}${s.who || s.when ? `（${[s.who, s.when].filter(Boolean).join(' ')}）` : ''}`)
        .join('、'),
    ],
    ['xlsx.colExhibition', lead.exhibition],
    ['field.metAt', formatDateTime(lead.metAt || lead.createdAt, lang)],
    ['field.staff', lead.staff ?? ''],
    ['xlsx.colCreated', `${formatDateTime(lead.createdAt, lang)} · ${authorLabel(lead.createdBy)}`],
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="lead-popup-title" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 id="lead-popup-title">{t('popup.title')}</h2>
          <button className="link" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        {lead.photoId && <LeadPhoto id={lead.photoId} className="popup-photo" explain />}
        <dl className="detail">
          {rows.map(([key, value]) => (
            <div key={key}>
              <dt>{t(key)}</dt>
              <dd>
                {key === 'field.email' && value ? (
                  <a href={`mailto:${value}`}>{value}</a>
                ) : key === 'field.phone' && value ? (
                  <a href={`tel:${value.replace(/[^\d+]/g, '')}`}>{value}</a>
                ) : (
                  value || '—'
                )}
              </dd>
            </div>
          ))}
        </dl>
        {lead.note && <p className="sticky-note">{lead.note}</p>}
        {duplicates.length > 0 && (
          <p className="banner banner-caution">
            ⚠ {t('list.duplicate')}:{' '}
            {duplicates.map((d) => `${d.name || d.company || d.email} (${authorLabel(d.createdBy)})`).join('、')}
          </p>
        )}
        {lead.ocrText && (
          <details className="ocr-text">
            <summary>{t('ocr.showText')}</summary>
            <pre>{lead.ocrText}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
