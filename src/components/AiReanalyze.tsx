import { useState } from 'react'
import { describeError } from '../errors.ts'
import { useI18n } from '../i18n/useI18n.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { loadLeadPhoto } from '../photos.ts'
import type { Extracted } from '../scan/extract.ts'

const LABELS: Record<keyof Extracted, MessageKey> = {
  name: 'field.name',
  company: 'field.company',
  department: 'field.department',
  title: 'field.title',
  prefecture: 'field.prefecture',
  city: 'field.city',
  phone: 'field.phone',
  email: 'field.email',
}

interface Props {
  /** 保存済みの画像 */
  photoId?: string
  /** 撮り直した画像（まだ保存していない）。あればこちらを読み取る */
  photo: Blob | null
  aiKey: string
  /** 今の入力欄の内容（読み取り結果と比べる） */
  current: Extracted
  /** 選んだ項目を入力欄に入れる（保存は、編集の「保存」を押した時） */
  onApply: (patch: Partial<Extracted>) => void
}

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'review'; found: Extracted; changes: (keyof Extracted)[]; pick: Set<keyof Extracted> }
  | { kind: 'error'; text: string; detail?: string }

/**
 * 編集で、名刺・バッジの画像を AI でもう一度読み取る。結果はすぐには入れず、今の内容と並べて見せ、
 * 反映する項目を選んでもらう（「キャンセル」で何も変えない。反映しても、編集の「保存」までは登録されない）
 */
export function AiReanalyze({ photoId, photo, aiKey, current, onApply }: Props) {
  const { t } = useI18n()
  const [state, setState] = useState<State>({ kind: 'idle' })

  const run = async () => {
    setState({ kind: 'busy' })
    try {
      const blob = photo ?? (photoId ? await loadLeadPhoto(photoId) : null)
      if (!blob) {
        setState({ kind: 'error', text: t('reai.noPhoto') })
        return
      }
      // AI の部品（SDK）は大きいので、使う時に読み込む
      const { aiChanges, readCardWithAi } = await import('../scan/ai.ts')
      const { fields } = await readCardWithAi(blob, aiKey)
      const changes = aiChanges(current, fields)
      setState({ kind: 'review', found: fields, changes, pick: new Set(changes) })
    } catch (e) {
      console.error('[ai-reanalyze]', e)
      const auth = (e as { reason?: string }).reason === 'auth'
      setState({ kind: 'error', text: t(auth ? 'reai.badKey' : 'reai.failed'), detail: describeError(e) })
    }
  }

  if (state.kind === 'review') {
    const toggle = (k: keyof Extracted) => {
      const pick = new Set(state.pick)
      if (pick.has(k)) pick.delete(k)
      else pick.add(k)
      setState({ ...state, pick })
    }
    return (
      <div className="reai-review" role="region" aria-label={t('reai.title')}>
        <p className="reai-title">✨ {t('reai.title')}</p>
        {state.changes.length === 0 ? (
          <p className="muted small">{t('reai.same')}</p>
        ) : (
          <>
            <p className="muted small">{t('reai.help')}</p>
            <ul className="reai-list">
              {state.changes.map((k) => (
                <li key={k}>
                  <label>
                    <input type="checkbox" checked={state.pick.has(k)} onChange={() => toggle(k)} />
                    <span className="reai-field">{t(LABELS[k])}</span>
                    <span className="reai-values">
                      <span className="reai-old">{current[k].trim() || '—'}</span>
                      <span aria-hidden="true"> → </span>
                      <strong className="reai-new">{state.found[k]}</strong>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row reai-actions">
          <button type="button" className="secondary" onClick={() => setState({ kind: 'idle' })}>
            {t('common.cancel')}
          </button>
          {state.changes.length > 0 && (
            <button
              type="button"
              className="primary"
              disabled={state.pick.size === 0}
              onClick={() => {
                onApply(Object.fromEntries([...state.pick].map((k) => [k, state.found[k]])))
                setState({ kind: 'idle' })
              }}
            >
              {t('reai.apply', { n: state.pick.size })}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="secondary reai-button"
        disabled={state.kind === 'busy' || (!photo && !photoId)}
        onClick={() => void run()}
      >
        {state.kind === 'busy' ? t('reai.busy') : t('reai.button')}
      </button>
      {state.kind === 'error' && (
        <p className="error" role="alert">
          {state.text}
          {state.detail && (
            <>
              <br />
              <span className="small muted">
                {t('err.detail')}: {state.detail}
              </span>
            </>
          )}
        </p>
      )}
    </>
  )
}
