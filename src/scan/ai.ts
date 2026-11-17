/**
 * 名刺・バッジの画像を AI に読ませて、氏名・会社名などを取り出す。
 * 端末の中の OCR（tesseract.js）より、氏名の読み取りと項目の振り分けがずっと正確。
 * 使う AI は、設定に入れた API キーの形で決まる（Gemini: AIza…、OpenAI: sk-…、Claude: sk-ant-…）。
 * キーは全端末で共有。使えない時は、呼び出し側で端末の OCR に切り替える。
 */
import { aiProviderOf, type AiProvider } from '../aiKey.ts'
import { AiReadError, FIELD_KEYS } from './aiCommon.ts'
import { PREFECTURES, type Extracted } from './extract.ts'

export { AiReadError } from './aiCommon.ts'

export interface AiResult {
  fields: Extracted
  /** 画像に書かれている文字（「読み取った文字を見る」に出す） */
  text: string
}

/** AI の答え（JSON）を、入力欄に入れる形にそろえる。ブラウザ機能に依存しない（テストできる） */
export function toAiResult(raw: unknown): AiResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (k: string) => (typeof data[k] === 'string' ? (data[k] as string).trim() : '')
  const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, str(k)])) as unknown as Extracted
  // 都道府県は一覧にあるものだけ（「東京」→「東京都」のような書き方の違いは直す）
  if (fields.prefecture && !PREFECTURES.includes(fields.prefecture)) {
    fields.prefecture = PREFECTURES.find((p) => p.replace(/[都府県]$/, '') === fields.prefecture) ?? ''
  }
  fields.email = fields.email.toLowerCase()
  return { fields, text: str('text') }
}

/** AI の答えの文字から JSON を取り出す（```json … ``` で囲まれて返ってきた時も読めるように） */
export function parseAiJson(text: string): unknown {
  const s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(s)
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function providerOrThrow(apiKey: string): AiProvider {
  const p = aiProviderOf(apiKey)
  if (!p) throw new AiReadError('auth', 'unknown key format')
  return p
}

/** 各社の部品は、使う時だけ読み込む（Claude の SDK は大きいため） */
async function readRaw(provider: AiProvider, jpegBase64: string, apiKey: string): Promise<string> {
  switch (provider) {
    case 'gemini':
      return (await import('./aiGemini.ts')).readWithGemini(jpegBase64, apiKey)
    case 'openai':
      return (await import('./aiOpenAi.ts')).readWithOpenAi(jpegBase64, apiKey)
    case 'anthropic':
      return (await import('./aiAnthropic.ts')).readWithAnthropic(jpegBase64, apiKey)
  }
}

/** 補正した名刺・バッジの画像（JPEG）を AI で読み取る */
export async function readCardWithAi(photo: Blob, apiKey: string): Promise<AiResult> {
  const text = await readRaw(providerOrThrow(apiKey), await toBase64(photo), apiKey)
  try {
    return toAiResult(parseAiJson(text))
  } catch {
    throw new AiReadError('failed', 'unexpected response')
  }
}

/** API キーで AI が使えるか確かめる（読み取りはしないので料金はかからない） */
export async function checkAiKey(apiKey: string): Promise<'ok' | 'auth' | 'failed'> {
  try {
    const provider = providerOrThrow(apiKey)
    if (provider === 'gemini') await (await import('./aiGemini.ts')).checkGemini(apiKey)
    else if (provider === 'openai') await (await import('./aiOpenAi.ts')).checkOpenAi(apiKey)
    else await (await import('./aiAnthropic.ts')).checkAnthropic(apiKey)
    return 'ok'
  } catch (e) {
    if (e instanceof AiReadError && e.reason === 'auth') return 'auth'
    console.error('[ai-check]', e)
    return 'failed'
  }
}

/** AI の再解析で、今の入力と違う項目（AI が空の項目は除く）。画面で、どれを反映するか選んでもらう */
export function aiChanges(current: Extracted, found: Extracted): (keyof Extracted)[] {
  return FIELD_KEYS.filter((k) => found[k] !== '' && found[k] !== current[k].trim())
}
