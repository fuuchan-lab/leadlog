/** OpenAI（ChatGPT の API）で名刺を読み取る。platform.openai.com の API キー（有料・先払い） */
import { AiReadError, postJson, PROMPT, SCHEMA, SYSTEM } from './aiCommon.ts'

/** 画像の読み取りに向いた、速くて安いモデル */
const MODEL = 'gpt-6.1-terra'
const BASE = 'https://api.openai.com/v1'

const isAuthError = (status: number) => status === 401 || status === 403

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]
}

export async function readWithOpenAi(jpegBase64: string, apiKey: string): Promise<string> {
  const data = (await postJson(
    `${BASE}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    {
      model: MODEL,
      // 画像から書き写すだけなので、待ち時間の短い low にする
      reasoning_effort: 'low',
      max_completion_tokens: 4000,
      response_format: { type: 'json_schema', json_schema: { name: 'business_card', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}`, detail: 'high' } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    },
    isAuthError,
  )) as ChatResponse
  const choice = data.choices?.[0]
  if (choice?.message?.refusal) throw new AiReadError('refused', choice.message.refusal)
  if (choice?.finish_reason === 'content_filter') throw new AiReadError('refused', 'content_filter')
  const text = choice?.message?.content
  if (!text) throw new AiReadError('failed', `empty response (${choice?.finish_reason ?? 'none'})`)
  return text
}

/** キーで OpenAI が使えるか（モデルの情報を見るだけ。料金はかからない） */
export async function checkOpenAi(apiKey: string): Promise<void> {
  await postJson(`${BASE}/models/${MODEL}`, { Authorization: `Bearer ${apiKey}` }, undefined, isAuthError)
}
