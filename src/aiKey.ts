/**
 * AI の API キーの入力を整え、どの会社のキーかを見分ける。ブラウザ機能に依存しない（テストできる）。
 * 対応: Google の Gemini（AIza…）、OpenAI（sk-…）、Anthropic の Claude（sk-ant-…）
 */

export type AiProvider = 'gemini' | 'openai' | 'anthropic'

export const AI_PROVIDERS: AiProvider[] = ['gemini', 'openai', 'anthropic']

/**
 * コピーした時に付いてくる空白・改行・引用符や、「GEMINI_API_KEY=」のような前置きを取り除く
 */
export function normalizeAiKey(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/^(?:ANTHROPIC|OPENAI|GEMINI|GOOGLE)_API_KEY=/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
}

/** キーの形から、どの会社のキーかを見分ける。どれにも当たらなければ null */
export function aiProviderOf(key: string): AiProvider | null {
  if (/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return 'anthropic'
  if (/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) return 'openai'
  if (/^AIza[A-Za-z0-9_-]{30,}$/.test(key)) return 'gemini'
  return null
}

/** API キーの形に見えるか（provider を指定すると、その会社のキーか） */
export function looksLikeAiKey(key: string, provider?: AiProvider): boolean {
  const p = aiProviderOf(key)
  return p !== null && (provider === undefined || p === provider)
}

/** 画面に出す名前 */
export const PROVIDER_NAMES: Record<AiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Claude',
}

/** キーの例（入力欄の薄い文字） */
export const KEY_PLACEHOLDERS: Record<AiProvider, string> = {
  gemini: 'AIza...',
  openai: 'sk-proj-...',
  anthropic: 'sk-ant-...',
}

/** 各社の、API キー・支払い・利用上限のページ */
export const CONSOLE_LINKS: Record<AiProvider, { keys: string; billing: string; limits: string }> = {
  gemini: {
    keys: 'https://aistudio.google.com/apikey',
    billing: 'https://aistudio.google.com/apikey',
    limits: 'https://aistudio.google.com/usage',
  },
  openai: {
    keys: 'https://platform.openai.com/api-keys',
    billing: 'https://platform.openai.com/settings/organization/billing/overview',
    limits: 'https://platform.openai.com/settings/organization/limits',
  },
  anthropic: {
    keys: 'https://console.anthropic.com/settings/keys',
    billing: 'https://console.anthropic.com/settings/billing',
    limits: 'https://console.anthropic.com/settings/limits',
  },
}
