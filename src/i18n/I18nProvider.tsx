import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, detectLang, isEnLoaded, loadEn, saveLang, translate, type I18n, type Lang } from './context.ts'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)

  const setLang = useCallback((next: Lang) => {
    saveLang(next)
    // 英語は、文言を読み込んでから切り替える（読み込めなければ日本語のまま）
    if (next === 'en' && !isEnLoaded()) {
      loadEn().then(
        () => setLangState('en'),
        (e: unknown) => console.error('[i18n]', e),
      )
      return
    }
    setLangState(next)
  }, [])

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  )

  // 読み上げ・ブラウザの翻訳提案のため、ページの言語とタイトルも合わせる
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate(lang, 'app.title')
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
