/** AI 読み取りで、各社（Gemini・OpenAI・Claude）に共通の指示・答えの形・エラー */

/** AI で読み取れなかった理由。auth は API キーの誤り（設定で直してもらう） */
export class AiReadError extends Error {
  readonly reason: 'auth' | 'refused' | 'failed'
  constructor(reason: 'auth' | 'refused' | 'failed', message: string) {
    super(message)
    this.name = 'AiReadError'
    this.reason = reason
  }
}

export const FIELD_KEYS = ['name', 'company', 'department', 'title', 'prefecture', 'city', 'phone', 'email'] as const

/** 構造化出力の形（すべて文字列。書かれていない項目は空文字） */
export const SCHEMA = {
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

export const SYSTEM = `あなたは展示会で受け取った名刺・展示会バッジの画像から、連絡先を正確に書き写すアシスタントです。
画像に書かれている文字だけを使い、推測で補わないでください。読めない・書かれていない項目は空文字にします。
氏名は、会社名・部署名・役職・ロゴ・キャッチコピーと取り違えないでください。名刺では多くの場合、一番大きな文字で書かれた人の名前です。
漢字は画像の通りに書き写し、似た字（例: 斉/斎、辺/邊）を勝手に置き換えないでください。`

export const PROMPT = 'この名刺（または展示会バッジ）の内容を読み取ってください。'

/** 1回の読み取りの待ち時間の上限 */
export const TIMEOUT_MS = 60_000

/**
 * fetch で JSON を送り、JSON で受け取る（Gemini・OpenAI 用。SDK を使わず軽くする）。
 * 混み合い（429・5xx）の時は1回だけ待って送り直す。401・403 はキーの誤りとして扱う
 */
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  isAuthError: (status: number, data: unknown) => boolean,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(body === undefined ? 20_000 : TIMEOUT_MS),
      })
    } catch (e) {
      throw new AiReadError('failed', e instanceof Error ? e.message : String(e))
    }
    const data: unknown = await res.json().catch(() => null)
    if (res.ok) return data
    if (isAuthError(res.status, data)) throw new AiReadError('auth', errorMessage(data, res.status))
    if (attempt === 0 && body !== undefined && (res.status === 429 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    throw new AiReadError('failed', errorMessage(data, res.status))
  }
}

function errorMessage(data: unknown, status: number): string {
  const msg = (data as { error?: { message?: unknown } } | null)?.error?.message
  return typeof msg === 'string' ? `${status} ${msg}` : `HTTP ${status}`
}
