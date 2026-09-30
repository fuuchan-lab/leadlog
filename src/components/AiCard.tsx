import { useState } from 'react'
import { adScriptLoaded } from '../adsense.ts'
import type { SharedSettingsState } from '../hooks/useSharedSettings.ts'
import { useI18n } from '../i18n/useI18n.ts'

type Check = 'idle' | 'busy' | 'ok' | 'auth' | 'failed'

/**
 * 設定の「AI で読み取る」。Anthropic の API キーを入れると、名刺・バッジを AI（Claude）で読み取る。
 * キーは全員共通の設定として、同期で全端末に配る
 */
export function AiCard({ shared }: { shared: SharedSettingsState }) {
  const { t } = useI18n()
  const key = shared.settings.aiKey
  const [draft, setDraft] = useState('')
  const [check, setCheck] = useState<Check>('idle')

  const runCheck = async (k: string) => {
    setCheck('busy')
    const { checkAiKey } = await import('../scan/ai.ts')
    setCheck(await checkAiKey(k))
  }

  return (
    <section className="card">
      <h2>{t('ai.title')}</h2>
      <p className="muted small">{t('ai.help')}</p>
      {key ? (
        <>
          <p className="ok">✓ {t('ai.on', { tail: key.slice(-4) })}</p>
          <div className="row ai-actions">
            <button className="secondary" disabled={check === 'busy'} onClick={() => void runCheck(key)}>
              {check === 'busy' ? t('ai.checking') : t('ai.check')}
            </button>
            <button
              className="danger-btn"
              onClick={() => {
                if (!confirm(t('ai.confirmRemove'))) return
                shared.setAiKey('')
                setCheck('idle')
              }}
            >
              {t('ai.remove')}
            </button>
          </div>
        </>
      ) : (
        <form
          className="ai-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!draft.trim()) return
            shared.setAiKey(draft)
            setDraft('')
            // 広告のスクリプトをすでに読み込んでいたら、画面を読み込み直して取り除く（キーに手が届かないように）
            if (adScriptLoaded()) {
              history.replaceState(null, '', '#settings')
              location.reload()
              return
            }
            void runCheck(draft.trim())
          }}
        >
          <label className="field">
            {t('ai.keyLabel')}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className="primary" type="submit" disabled={!draft.trim()}>
            {t('ai.save')}
          </button>
        </form>
      )}
      {check === 'ok' && <p className="ok">{t('ai.checkOk')}</p>}
      {check === 'auth' && <p className="error">{t('ai.checkAuth')}</p>}
      {check === 'failed' && <p className="error">{t('ai.checkFailed')}</p>}
      <p className="muted small">{t('ai.note')}</p>
    </section>
  )
}
