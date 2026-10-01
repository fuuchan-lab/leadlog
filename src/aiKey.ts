/**
 * Anthropic の API キーの入力を整える。ブラウザ機能に依存しない（テストできる）。
 * コピーした時に付いてくる空白・改行・引用符や、「ANTHROPIC_API_KEY=」のような前置きを取り除く
 */
export function normalizeAiKey(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/^ANTHROPIC_API_KEY=/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
}

/** Anthropic の API キーの形（sk-ant- で始まる）に見えるか */
export function looksLikeAiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)
}

/** Anthropic Console の、API キー・支払い・利用上限のページ */
export const CONSOLE_LINKS = {
  keys: 'https://console.anthropic.com/settings/keys',
  billing: 'https://console.anthropic.com/settings/billing',
  limits: 'https://console.anthropic.com/settings/limits',
}
