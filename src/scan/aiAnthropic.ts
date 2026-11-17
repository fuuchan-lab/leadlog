/** Anthropic の Claude で名刺を読み取る（console.anthropic.com の API キー。有料） */
import Anthropic from '@anthropic-ai/sdk'
import { AiReadError, PROMPT, SCHEMA, SYSTEM, TIMEOUT_MS } from './aiCommon.ts'

const MODEL = 'claude-opus-5-5'

export async function readWithAnthropic(jpegBase64: string, apiKey: string): Promise<string> {
  // 社内の共有キーを、サーバーを通さずブラウザから直接使う（キーは共有アカウントでログインした端末だけが持つ）
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: TIMEOUT_MS })
  let response: Anthropic.Beta.BetaMessage
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      // 画像から書き写すだけなので、待ち時間の短い low にする
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // 安全のための判定で断られた時は、サーバー側で別のモデルに読み直させる
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new AiReadError('auth', e.message)
    }
    throw new AiReadError('failed', e instanceof Error ? e.message : String(e))
  }
  if (response.stop_reason === 'refusal') throw new AiReadError('refused', 'refusal')
  return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

/** キーで Claude が使えるか（モデルの情報を見るだけ。料金はかからない） */
export async function checkAnthropic(apiKey: string): Promise<void> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20_000 })
  try {
    await client.models.retrieve(MODEL)
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new AiReadError('auth', e.message)
    }
    throw new AiReadError('failed', e instanceof Error ? e.message : String(e))
  }
}
