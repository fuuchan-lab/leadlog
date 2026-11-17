import { useRef, useState } from 'react'
import { adScriptLoaded } from '../adsense.ts'
import {
  AI_PROVIDERS,
  aiProviderOf,
  CONSOLE_LINKS,
  KEY_PLACEHOLDERS,
  looksLikeAiKey,
  normalizeAiKey,
  PROVIDER_NAMES,
  type AiProvider,
} from '../aiKey.ts'
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
 * 設定の「AI で読み取る」。Gemini・OpenAI・Claude のどれかの API キーを入れると、名刺・バッジを AI で読み取る。
 * どの AI かはキーの形で見分ける（別の会社のキーを貼り付けたら、その会社のタブに切り替える）。
 * キーは全員共通の設定として、同期で全端末に配る。
 * キーの取り方を手順で案内し、貼り付け・余分な空白の除去・保存前の確認で、入れ間違いを防ぐ
 */
export function AiCard({ shared, loggedIn }: Props) {
  const { t, lang } = useI18n()
  const key = shared.settings.aiKey
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [show, setShow] = useState(false)
  const [check, setCheck] = useState<Check>('idle')
  const [pasteHint, setPasteHint] = useState(false)

  const [provider, setProvider] = useState<AiProvider>('gemini')
  const cleaned = normalizeAiKey(draft)
  const valid = looksLikeAiKey(cleaned)
  const savedProvider = aiProviderOf(key)
  const name = PROVIDER_NAMES[provider]
  const links = CONSOLE_LINKS[provider]

  /** 入力を変えた時。別の会社のキーなら、その会社のタブに切り替える */
  const changeDraft = (value: string) => {
    setDraft(value)
    setCheck('idle')
    const p = aiProviderOf(normalizeAiKey(value))
    if (p) setProvider(p)
  }

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
      changeDraft(normalizeAiKey(await navigator.clipboard.readText()))
      setPasteHint(false)
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
          <p className="ok">✓ {t('ai.on', { provider: savedProvider ? PROVIDER_NAMES[savedProvider] : '?', tail: key.slice(-4) })}</p>
          {savedProvider === 'gemini' && <p className="banner banner-caution small">{t('ai.gemini.freeNote')}</p>}
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
          {savedProvider && <span className="small">{link(CONSOLE_LINKS[savedProvider].limits, t(`ai.${savedProvider}.limitsLink`))}</span>}
        </>
      ) : (
        <>
          {/* 使う AI を選ぶ。キーの取り方が会社ごとに違うため */}
          <p className="field">{t('ai.providerLabel')}</p>
          <div className="seg-tabs" role="tablist">
            {AI_PROVIDERS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={provider === p}
                className={provider === p ? 'on' : ''}
                onClick={() => {
                  setProvider(p)
                  setCheck('idle')
                }}
              >
                {PROVIDER_NAMES[p]}
              </button>
            ))}
          </div>
          <p className="muted small">{t(`ai.${provider}.desc`)}</p>
          {provider === 'gemini' && <p className="banner banner-caution small">{t('ai.gemini.freeNote')}</p>}
          {/* キーの取り方。パソコンで1回入れれば、同期で全端末に配られる */}
          <div className="ai-steps">
            <p className="ai-steps-title">{t('ai.stepsTitle')}</p>
            <p className="muted small">{t('ai.stepsLead')}</p>
            <ol>
              <li>
                {t(`ai.${provider}.step1`)} {link(links.keys, t('ai.openConsole', { provider: name }))}
              </li>
              <li>
                {t(`ai.${provider}.step2`)}
                {provider !== 'gemini' && <> {link(links.billing, t('ai.openBilling'))}</>}
              </li>
              <li>
                {t(`ai.${provider}.step3`)} {link(links.keys, t('ai.openKeys'))}
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
              {t('ai.keyLabel', { provider: name })}
            </label>
            <div className="ai-key-row">
              <input
                id="ai-key"
                ref={inputRef}
                type={show ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={KEY_PLACEHOLDERS[provider]}
                value={draft}
                onChange={(e) => changeDraft(e.target.value)}
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
            {valid && aiProviderOf(cleaned) && <p className="muted small">{t('ai.detected', { provider: PROVIDER_NAMES[aiProviderOf(cleaned)!] })}</p>}
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
      <p className="small">
        ⚠️ {link(`./help.html?lang=${lang}#${lang === 'en' ? 'en' : 'ja'}-ai-caution`, t('ai.cautionLink'))}
      </p>
    </section>
  )
}
