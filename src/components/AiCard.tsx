import { useRef, useState } from 'react'
import { adScriptLoaded } from '../adsense.ts'
import { CONSOLE_LINKS, looksLikeAiKey, normalizeAiKey } from '../aiKey.ts'
import type { SharedSettingsState } from '../hooks/useSharedSettings.ts'
import { useI18n } from '../i18n/useI18n.ts'

type Check = 'idle' | 'busy' | 'ok' | 'auth' | 'failed' | 'savedUnchecked'

interface Props {
  shared: SharedSettingsState
  /** Google にログインしているか（ログインしていないと、キーは他の端末に配られない） */
  loggedIn: boolean
}

const checkKey = async (k: string) => {
  // AI の部品（SDK）は大きいので、使う時に読み込む
  const { checkAiKey } = await import('../scan/ai.ts')
  return checkAiKey(k)
}

/**
 * 設定の「AI で読み取る」。Anthropic の API キーを入れると、名刺・バッジを AI（Claude）で読み取る。
 * キーは全員共通の設定として、同期で全端末に配る。
 * キーの取り方を手順で案内し、貼り付け・余分な空白の除去・保存前の確認で、入れ間違いを防ぐ
 */
export function AiCard({ shared, loggedIn }: Props) {
  const { t } = useI18n()
  const key = shared.settings.aiKey
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [check, setCheck] = useState<Check>('idle')
  const [pasteHint, setPasteHint] = useState(false)

  const cleaned = normalizeAiKey(draft)
  const valid = looksLikeAiKey(cleaned)

  /** 保存する前に、キーが使えるか確かめる。使えないキー（打ち間違い・無効）は保存しない */
  const checkAndSave = async () => {
    setCheck('busy')
    const result = await checkKey(cleaned)
    if (result === 'auth') {
      setCheck('auth')
      return
    }
    // 通信できずに確かめられなかった時は、保存だけしておく（電波が戻れば使える）
    setCheck(result === 'ok' ? 'ok' : 'savedUnchecked')
    shared.setAiKey(cleaned)
    setDraft('')
    // 広告のスクリプトをすでに読み込んでいたら、画面を読み込み直して取り除く（キーに手が届かないように）
    if (adScriptLoaded()) {
      history.replaceState(null, '', '#settings')
      location.reload()
    }
  }

  const paste = async () => {
    try {
      setDraft(normalizeAiKey(await navigator.clipboard.readText()))
      setPasteHint(false)
      setCheck('idle')
    } catch {
      // 貼り付けを許可されなかった・使えないブラウザ。入力欄を長押しして貼り付けてもらう
      setPasteHint(true)
      inputRef.current?.focus()
    }
  }

  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener">
      {label} ↗
    </a>
  )

  return (
    <section className="card">
      <h2>{t('ai.title')}</h2>
      <p className="muted small">{t('ai.help')}</p>
      {key ? (
        <>
          <p className="ok">✓ {t('ai.on', { tail: key.slice(-4) })}</p>
          <div className="row ai-actions">
            <button
              className="secondary"
              disabled={check === 'busy'}
              onClick={async () => {
                setCheck('busy')
                setCheck(await checkKey(key))
              }}
            >
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
          <span className="small">{link(CONSOLE_LINKS.limits, t('ai.limitsLink'))}</span>
        </>
      ) : (
        <>
          {/* キーの取り方。パソコンで1回入れれば、同期で全端末に配られる */}
          <div className="ai-steps">
            <p className="ai-steps-title">{t('ai.stepsTitle')}</p>
            <p className="muted small">{t('ai.stepsLead')}</p>
            <ol>
              <li>
                {t('ai.step1')} {link(CONSOLE_LINKS.keys, t('ai.openConsole'))}
              </li>
              <li>
                {t('ai.step2')} {link(CONSOLE_LINKS.billing, t('ai.openBilling'))}
              </li>
              <li>
                {t('ai.step3')} {link(CONSOLE_LINKS.keys, t('ai.openKeys'))}
              </li>
              <li>{t('ai.step4')}</li>
            </ol>
          </div>
          <form
            className="ai-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) void checkAndSave()
            }}
          >
            <label className="field" htmlFor="ai-key">
              {t('ai.keyLabel')}
            </label>
            <div className="ai-key-row">
              <input
                id="ai-key"
                ref={inputRef}
                type={show ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="sk-ant-..."
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setCheck('idle')
                }}
                onBlur={() => setDraft(cleaned)}
              />
              <button type="button" className="secondary" onClick={() => setShow(!show)} aria-pressed={show}>
                {show ? t('ai.hide') : t('ai.show')}
              </button>
            </div>
            <button type="button" className="secondary" onClick={() => void paste()}>
              📋 {t('ai.paste')}
            </button>
            {pasteHint && <p className="muted small">{t('ai.pasteHint')}</p>}
            {cleaned !== '' && !valid && <p className="error small">{t('ai.wrongShape')}</p>}
            <button className="primary" type="submit" disabled={!valid || check === 'busy'}>
              {check === 'busy' ? t('ai.checking') : t('ai.save')}
            </button>
          </form>
        </>
      )}
      {check === 'ok' && <p className="ok">{t('ai.checkOk')}</p>}
      {check === 'auth' && <p className="error">{key ? t('ai.checkAuth') : t('ai.notSaved')}</p>}
      {check === 'failed' && <p className="error">{t('ai.checkFailed')}</p>}
      {check === 'savedUnchecked' && <p className="muted">{t('ai.savedUnchecked')}</p>}
      {!loggedIn && <p className="banner banner-caution">{t('ai.needLogin')}</p>}
      <p className="muted small">{t('ai.note')}</p>
    </section>
  )
}
