/**
 * 名刺・バッジの画像を AI（Anthropic の Claude）に読ませて、氏名・会社名などを取り出す。
 * 端末の中の OCR（tesseract.js）より、氏名の読み取りと項目の振り分けがずっと正確。
 * API キーは設定の「AI で読み取る」で入れる（全端末で共有）。使えない時は、呼び出し側で端末の OCR に切り替える。
 */
import Anthropic from '@anthropic-ai/sdk'
import { PREFECTURES, type Extracted } from './extract.ts'

const MODEL = 'claude-opus-5-5'

export interface AiResult {
  fields: Extracted
  /** 画像に書かれている文字（「読み取った文字を見る」に出す） */
  text: string
}

/** AI で読み取れなかった理由。auth は API キーの誤り（設定で直してもらう） */
export class AiReadError extends Error {
  readonly reason: 'auth' | 'refused' | 'failed'
  constructor(reason: 'auth' | 'refused' | 'failed', message: string) {
    super(message)
    this.name = 'AiReadError'
    this.reason = reason
  }
}

const FIELD_KEYS = ['name', 'company', 'department', 'title', 'prefecture', 'city', 'phone', 'email'] as const

/** 構造化出力の形（すべて文字列。書かれていない項目は空文字） */
const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '人の氏名。姓と名の間に半角スペース（例: 山田 太郎、John Smith）。ふりがな・ローマ字の併記は含めない' },
    company: { type: 'string', description: '会社・団体の名前（例: 株式会社サンプル）' },
    department: { type: 'string', description: '部署名（例: 営業本部 第一営業部）' },
    title: { type: 'string', description: '役職（例: 課長、Sales Manager）' },
    prefecture: { type: 'string', description: '住所の都道府県（例: 東京都）。日本以外や住所が無ければ空' },
    city: { type: 'string', description: '住所の市区町村（例: 港区、横浜市西区）。番地は含めない' },
    phone: { type: 'string', description: '電話番号。携帯・直通があればそれを優先し、無ければ代表。FAX は除く。書かれている通りの区切り' },
    email: { type: 'string', description: 'メールアドレス（小文字）' },
    text: { type: 'string', description: '画像に書かれている文字をすべて、行ごとに改行して書き写したもの' },
  },
  required: [...FIELD_KEYS, 'text'],
  additionalProperties: false,
} as const

const SYSTEM = `あなたは展示会で受け取った名刺・展示会バッジの画像から、連絡先を正確に書き写すアシスタントです。
画像に書かれている文字だけを使い、推測で補わないでください。読めない・書かれていない項目は空文字にします。
氏名は、会社名・部署名・役職・ロゴ・キャッチコピーと取り違えないでください。名刺では多くの場合、一番大きな文字で書かれた人の名前です。
漢字は画像の通りに書き写し、似た字（例: 斉/斎、辺/邊）を勝手に置き換えないでください。`

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

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** 補正した名刺・バッジの画像（JPEG）を AI で読み取る */
export async function readCardWithAi(photo: Blob, apiKey: string): Promise<AiResult> {
  // 社内の共有キーを、サーバーを通さずブラウザから直接使う（キーは共有アカウントでログインした端末だけが持つ）
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 })
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
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toBase64(photo) } },
            { type: 'text', text: 'この名刺（または展示会バッジ）の内容を読み取ってください。' },
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
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  try {
    return toAiResult(JSON.parse(text))
  } catch {
    throw new AiReadError('failed', `unexpected response (${response.stop_reason})`)
  }
}

/** API キーで AI が使えるか確かめる（読み取りはしないので料金はかからない） */
export async function checkAiKey(apiKey: string): Promise<'ok' | 'auth' | 'failed'> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 0, timeout: 20_000 })
  try {
    await client.models.retrieve(MODEL)
    return 'ok'
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'auth'
    console.error('[ai-check]', e)
    return 'failed'
  }
}
