/**
 * Google の Gemini で名刺を読み取る（Google AI Studio の API キー。無料枠あり）。
 * 無料枠では、送った画像が Google の製品改善に使われることがある（設定画面で知らせる）
 */
import { AiReadError, postJson, PROMPT, SCHEMA, SYSTEM } from './aiCommon.ts'

const MODEL = 'gemini-3.8-flash'
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** キーの誤り。Gemini は無効なキーを 400（API_KEY_INVALID）で返す */
function isAuthError(status: number, data: unknown): boolean {
  if (status === 401 || status === 403) return true
  return status === 400 && /API_KEY_INVALID|API key not valid/i.test(JSON.stringify(data ?? ''))
}

/** 安全のための判定で止められた時の理由 */
const BLOCKED = /SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|IMAGE_SAFETY|IMAGE_PROHIBITED_CONTENT|RECITATION/

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

/** Gemini の JSON Schema は additionalProperties を受け付けないことがあるので外す */
const { additionalProperties: _omit, ...geminiSchema } = SCHEMA

export async function readWithGemini(jpegBase64: string, apiKey: string): Promise<string> {
  const data = (await postJson(
    `${BASE}/${MODEL}:generateContent`,
    { 'x-goog-api-key': apiKey },
    {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } }, { text: PROMPT }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: geminiSchema,
        maxOutputTokens: 4000,
        // 画像から書き写すだけなので、待ち時間の短い low にする
        thinkingConfig: { thinkingLevel: 'low' },
      },
    },
    isAuthError,
  )) as GeminiResponse
  if (data.promptFeedback?.blockReason) throw new AiReadError('refused', data.promptFeedback.blockReason)
  const candidate = data.candidates?.[0]
  if (candidate?.finishReason && BLOCKED.test(candidate.finishReason)) throw new AiReadError('refused', candidate.finishReason)
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('')
  if (!text) throw new AiReadError('failed', `empty response (${candidate?.finishReason ?? 'none'})`)
  return text
}

/** キーで Gemini が使えるか（モデルの情報を見るだけ。料金はかからない） */
export async function checkGemini(apiKey: string): Promise<void> {
  await postJson(`${BASE}/${MODEL}`, { 'x-goog-api-key': apiKey }, undefined, isAuthError)
}
