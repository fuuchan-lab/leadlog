/**
 * OCR で読み取った文字から、名前・会社名・部署名・役職・都道府県・市区町村・電話番号・メールアドレスを取り出す。
 * ブラウザ機能に依存しない（テストできる）。名刺の書き方はさまざまなので、取り出した値は画面で確認・修正してもらう。
 */

export interface OcrLine {
  text: string
  /** 文字の高さ（ピクセル）。大きい文字ほど名前・会社名である可能性が高い */
  height: number
}

export interface Extracted {
  name: string
  company: string
  department: string
  title: string
  prefecture: string
  city: string
  phone: string
  email: string
}

export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
]

/** 都道府県の英語名（PREFECTURES と同じ順） */
export const PREFECTURES_EN = [
  'Hokkaido', 'Aomori', 'Iwate', 'Miyagi', 'Akita', 'Yamagata', 'Fukushima',
  'Ibaraki', 'Tochigi', 'Gunma', 'Saitama', 'Chiba', 'Tokyo', 'Kanagawa',
  'Niigata', 'Toyama', 'Ishikawa', 'Fukui', 'Yamanashi', 'Nagano', 'Gifu',
  'Shizuoka', 'Aichi', 'Mie', 'Shiga', 'Kyoto', 'Osaka', 'Hyogo',
  'Nara', 'Wakayama', 'Tottori', 'Shimane', 'Okayama', 'Hiroshima', 'Yamaguchi',
  'Tokushima', 'Kagawa', 'Ehime', 'Kochi', 'Fukuoka', 'Saga', 'Nagasaki',
  'Kumamoto', 'Oita', 'Miyazaki', 'Kagoshima', 'Okinawa',
]

/** 英語の表示用に、都道府県名を英語にする（一覧に無い名前・海外はそのまま） */
export function prefectureInEnglish(name: string): string {
  const i = PREFECTURES.indexOf(name)
  return i >= 0 ? PREFECTURES_EN[i] : name
}

const CJK ='\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆'

/**
 * OCR の文字を整える。全角英数字を半角にし、日本語の文字の間に入った余分な空白を消す
 * （OCR は「株 式 会 社」のように1文字ずつ空白を入れることが多い）。
 */
export function normalizeLine(text: string): string {
  const s = text.normalize('NFKC').replace(/[​\t]/g, ' ').replace(/\s{2,}/g, ' ').trim()
  // 日本語の文字の並びのうち、半分以上に空白が入っていれば OCR が入れた空白とみなして消す。
  // そうでなければ「山田 太郎」「営業本部 第一営業部」のような、もともとの区切りとして残す
  const pairs = s.match(new RegExp(`[${CJK}](?=\\s?[${CJK}])`, 'gu'))?.length ?? 0
  const spaced = s.match(new RegExp(`[${CJK}](?=\\s[${CJK}])`, 'gu'))?.length ?? 0
  if (pairs >= 3 && spaced * 2 >= pairs) {
    return s.replace(new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, 'gu'), '$1')
  }
  return s
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/

/**
 * OCR がよく間違える形を直す。
 * 「.co.jp」→「cojp」、「.com」→「 com」「com」（点が消える）、「@」→「＠」「®」など
 */
export function repairEmailText(raw: string): string {
  let s = raw.replace(/[＠®]/g, '@').replace(/\s*@\s*/g, '@')
  // ドメインの中の空白を点にする（「evatecnet com」→「evatecnet.com」）
  s = s.replace(/(@[A-Za-z0-9.-]+?)\s+(com|net|org|jp|co\.jp|ne\.jp|or\.jp|ac\.jp|biz|info)\b/gi, '$1.$2')
  // 「cojp」「nejp」など → 「.co.jp」
  s = s.replace(/(@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*?)\.?(co|ne|or|ac|go|ed|gr|lg)\.?jp\b/gi, '$1.$2.jp')
  // 点が1つも無いドメインが com / net / org / jp で終わっていれば、その前に点を入れる
  s = s.replace(/(@[A-Za-z0-9-]{2,}?)(com|net|org|jp)\b(?![.-])/gi, (all, head: string, tld: string) =>
    head.includes('.') ? all : `${head}.${tld}`,
  )
  // 点の前後の空白を詰める
  return s.replace(/\s*\.\s*(?=[A-Za-z]{2,}\b)/g, '.')
}

export function findEmail(lines: string[]): string {
  for (const raw of lines) {
    // 「@」の前後の空白や、「E-mail:」などの見出しを外してから探す
    const s = repairEmailText(raw)
    const m = s.match(EMAIL_RE)
    if (m) return m[0].replace(/^(?:e-?mail|mail)[:：]?/i, '').toLowerCase()
  }
  return ''
}

const PHONE_RE = /(?:\+81[\s-]?\(?0?\)?\s?|0)\d{1,4}[\s\-‐−ー().]{0,2}\d{1,4}[\s\-‐−ー().]{0,2}\d{3,4}/g
const FAX_RE = /fax|ファ[クッ]ス|Ｆ|^f[\s.:：]/i
const TEL_LABEL_RE = /tel|phone|電話|^t[\s.:：]|直通|代表/i
const MOBILE_RE = /mobile|cell|携帯|^m[\s.:：]/i

/** 数字の数が電話番号として正しいか（国内 10〜11桁） */
function cleanPhone(raw: string): string | null {
  let s = raw.replace(/[‐−ー]/g, '-').replace(/[().]/g, ' ').trim()
  if (s.startsWith('+81')) s = '0' + s.slice(3).replace(/^[\s-]*0?/, '')
  const digits = s.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 11 || !digits.startsWith('0')) return null
  const parts = s.split(/[\s-]+/).filter(Boolean)
  return parts.length >= 3 ? parts.join('-') : formatDigits(digits)
}

function formatDigits(d: string): string {
  if (/^0[5789]0/.test(d) && d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (/^0120/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`
  if (/^0[36]/.test(d) && d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d
}

/**
 * 連絡先の電話番号。「TEL」の付いた番号を優先し、次に携帯、次に見出しのない番号。FAX の番号は選ばない。
 * 1行に「TEL 03-... FAX 03-...」と並んでいる場合は、FAX より前の番号を使う。
 */
export function findPhone(lines: string[]): string {
  const candidates: { phone: string; score: number }[] = []
  for (const line of lines) {
    // 1行に複数の見出しがある場合に分ける（「TEL 03-… FAX 03-…」「T 03-… F 03-…」）
    const segments = line
      .replace(EMAIL_RE, ' ')
      .split(/(?=\b(?:tel|fax|mobile|phone)\b)|(?=携帯|電話|直通|ファクス|ファックス)|\s(?=[TFM][.:：\s]\s?[+\d(])/i)
    for (const seg of segments) {
      for (const m of seg.matchAll(PHONE_RE)) {
        const phone = cleanPhone(m[0])
        if (!phone) continue
        const isFax = FAX_RE.test(seg.trim())
        if (isFax) continue
        const score = TEL_LABEL_RE.test(seg.trim()) ? 3 : MOBILE_RE.test(seg.trim()) || /^0[789]0/.test(phone) ? 2 : 1
        candidates.push({ phone, score })
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.phone ?? ''
}

/** 「市」が名前の途中に入る市（「四日市」で切らないため） */
const CITY_WITH_SHI = ['四日市市', '廿日市市', '野々市市', '市川市', '市原市', '市貝町', '市川三郷町', '市川町']

/** 住所の文字から、都道府県と市区町村を取り出す */
export function findAddress(lines: string[]): { prefecture: string; city: string } {
  for (const line of lines) {
    const s = line.replace(/\s/g, '')
    for (const pref of PREFECTURES) {
      const at = s.indexOf(pref)
      if (at < 0) continue
      return { prefecture: pref, city: cityFrom(s.slice(at + pref.length)) }
    }
  }
  // 都道府県を書いていない住所（〒 の行など）から市区町村だけ探す
  for (const line of lines) {
    const s = line.replace(/\s/g, '')
    if (!/〒|\d{3}-\d{4}|住所|address/i.test(s)) continue
    const rest = s.replace(/^.*?(?:〒\s?)?\d{3}-?\d{4}/, '').replace(/^(?:住所|address)[:：]?/i, '')
    const city = cityFrom(rest)
    if (city) return { prefecture: '', city }
  }
  return { prefecture: '', city: '' }
}

function cityFrom(rest: string): string {
  for (const special of CITY_WITH_SHI) if (rest.startsWith(special)) return special
  // 郡の町村（例: 西多摩郡瑞穂町）
  const gun = rest.match(/^([^\d\s]{1,5}?郡[^\d\s]{1,5}?[町村])/u)
  if (gun) return gun[1]
  // 市（政令市は区の前の市まで。例: 横浜市港北区 → 横浜市）
  const shi = rest.match(/^([^\d\s]{1,6}?市)/u)
  if (shi) return shi[1]
  // 東京23区
  const ku = rest.match(/^([^\d\s]{1,4}?区)/u)
  if (ku) return ku[1]
  const town = rest.match(/^([^\d\s]{1,5}?[町村])/u)
  return town ? town[1] : ''
}

const COMPANY_RE =
  /株式会社|\(株\)|（株）|㈱|有限会社|\(有\)|㈲|合同会社|合資会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|独立行政法人|国立研究開発法人|学校法人|医療法人|社会福祉法人|大学|Co\.?,?\s?Ltd|Inc\.?\b|Corporation|\bCorp\.?|\bK\.K\.|\bLLC\b|\bLtd\.?|Limited|GmbH|\bAG\b|S\.A\.|\bB\.V\.|\bPLC\b/i

const TITLE_WORDS = [
  '代表取締役社長', '代表取締役会長', '代表取締役', '取締役社長', '専務取締役', '常務取締役', '取締役', '執行役員',
  '社長', '会長', '副社長', '本部長', '事業部長', '部長代理', '副部長', '部長', '次長', '室長', '所長', '支店長',
  'センター長', 'グループ長', 'グループリーダー', 'チームリーダー', 'リーダー', '課長代理', '課長補佐', '課長', '係長',
  '主任', '主査', '主幹', '担当', 'マネージャー', 'マネジャー', 'シニアマネージャー', 'エンジニア', '研究員', '教授', '准教授',
  'CEO', 'CTO', 'CFO', 'COO', 'President', 'Vice President', 'Director', 'General Manager', 'Senior Manager',
  'Manager', 'Engineer', 'Sales Representative', 'Representative', 'Specialist', 'Consultant', 'Professor',
]

const DEPT_RE =
  /[^\s]*(?:事業本部|本部|事業部|部|課|室|グループ|センター|研究所|支店|営業所|工場|チーム|Division|Dept\.?|Department|Section|Group|Team|Unit|Office)(?![a-z])/i

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 語の文字の間に空白があってもよい正規表現（OCR は「課長 代理」のように空白を入れることがある） */
const looseRe = (w: string) =>
  new RegExp(
    w
      .replace(/\s/g, '')
      .split('')
      .map(escapeRe)
      .join('\\s*'),
    'i',
  )

function findTitle(line: string): string {
  const collapsed = line.replace(/\s+/g, '').toLowerCase()
  const found = TITLE_WORDS.filter((w) => collapsed.includes(w.replace(/\s/g, '').toLowerCase()))
  if (found.length === 0) return ''
  // 長い語を優先（「代表取締役」と「取締役」が両方当たる場合など）
  return found.sort((a, b) => b.length - a.length)[0]
}

/** 行から役職を取り除く */
const removeTitle = (line: string, title: string) => line.replace(looseRe(title), ' ').replace(/\s{2,}/g, ' ').trim()

/** 行の前後に付いた、OCR のごみ（線・かっこ・記号など）を取り除く */
export function trimJunk(s: string): string {
  return s
    .replace(/^[\s\-‐ー_|｜/\\[\]【】「」『』()（）<>《》〈〉.,。、・:：;'"`~*※〇○●◯]+/u, '')
    .replace(/[\s\-‐ー_|｜/\\[\]【】「」『』()（）<>《》〈〉.,。、・:：;'"`~*※〇○●◯]+$/u, '')
    .trim()
}

/** よくある日本の姓（名前らしさの手がかり） */
const SURNAMES = new Set(
  (
    '佐藤 鈴木 高橋 田中 伊藤 渡辺 渡邊 山本 中村 小林 加藤 吉田 山田 佐々木 山口 松本 井上 木村 林 斎藤 斉藤 清水 山崎 森 池田 ' +
    '橋本 阿部 石川 山下 中島 石井 小川 前田 岡田 長谷川 藤田 後藤 近藤 村上 遠藤 青木 坂本 福田 太田 西村 藤井 金子 岡本 ' +
    '藤原 中野 三浦 原田 中川 松田 竹内 小野 田村 中山 和田 石田 森田 上田 原 内田 柴田 酒井 宮崎 横山 高木 安藤 宮本 大野 ' +
    '小島 谷口 今井 工藤 高田 増田 丸山 杉山 村田 大塚 新井 小山 平野 藤本 河野 上野 野口 武田 松井 千葉 岩崎 菅原 木下 久保 ' +
    '佐野 野村 松尾 市川 菊地 杉本 古川 大西 島田 水野 桜井 高野 渡部 吉川 山内 西田 飯田 菊池 西川 小松 北村 安田 五十嵐 ' +
    '川口 平田 関 中田 久保田 服部 東 岩田 土屋 川崎 福島 本田 辻 樋口 秋山 永井 中西 吉村 川上 大橋 石原 松岡 浅野 荒木 ' +
    '大久保 熊谷 小池 内藤 桑原 松下 野田 早川 大川 片山 須藤 平井 堀 星 岡崎 石塚 小田 奥村 北川 松浦 菅野 田辺 岩本 大島 ' +
    '伊東 西山 荒井 本間 富田 川村 堀内 宮田 小西 植田 松村 黒田 上原 大石 竹田 竹中 今村 森本 堤 半田 望月 河合 小倉 ' +
    '中井 松原 新田 足立 滝沢 岡 高山 奥田 松永 今野 大谷 宮下 中尾 西尾 村井 三宅 片岡 長田 金井 富永 岸 土井 八木 堀田 ' +
    '菅 野崎 永田 久野 丹羽 栗原 平川 新谷 神田 吉野 吉岡 若林 大山 岩井 下田 森下 稲垣 萩原 白石 北野 坂口 宇野 岩瀬 高島'
  ).split(' '),
)

/** 氏名の先頭が、よくある姓か */
function startsWithSurname(name: string): boolean {
  const s = name.replace(/\s/g, '')
  for (let len = 3; len >= 1; len--) if (s.length > len && SURNAMES.has(s.slice(0, len))) return true
  return false
}

const KANA_NAME_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]{2,6}\s?[\p{Script=Hiragana}\p{Script=Katakana}ー]{1,6}$/u
const EN_NAME_CAPS_RE = /^[A-Z][A-Z'’-]+(?:\s[A-Z][A-Za-z.'’-]*){1,2}$/

const JA_NAME_RE = /^[\p{Script=Han}々]{1,4}\s?[\p{Script=Han}々\p{Script=Hiragana}\p{Script=Katakana}]{1,5}$/u
/** 漢字の氏名の後ろにローマ字が続く行（「中村 直樹 Naoki Nakamura」） */
const JA_WITH_ROMAJI_RE = /^([\p{Script=Han}々]{1,4}\s?[\p{Script=Han}々\p{Script=Hiragana}\p{Script=Katakana}]{1,5})\s+[A-Za-z][A-Za-z .'’-]*$/u
const EN_NAME_RE = /^[A-Z][a-zA-Z'’-]+(?:\s[A-Z][a-zA-Z.'’-]*){1,2}$/

/** 行が住所・連絡先などの、名前ではない情報か */
function isContactLine(s: string): boolean {
  return (
    /\d{2,}/.test(s) ||
    /@|https?:|www\.|\.com|\.jp/i.test(s) ||
    /〒|住所|tel|fax|mail|url/i.test(s) ||
    PREFECTURES.some((p) => s.includes(p))
  )
}

/** 名前のラベル（「氏名」など）や、ふりがなの行を除いた文字 */
function stripNameLabel(s: string): string {
  return s.replace(/^(?:氏名|名前|お名前|name)[:：]?\s*/i, '').trim()
}

/** 会社名の行を整える。前後のごみと、「株式会社」などの後ろの短いごみ（「株式会社の 》」）を取り除く */
function cleanCompany(line: string): string {
  let s = trimJunk(line).replace(/\s*(?:本社|本店)$/, '')
  const m = s.match(/^(.*?(?:株式会社|有限会社|合同会社|\(株\)|（株）|㈱))\s*(.{1,2})$/u)
  if (m && !/[A-Za-z]{2}/.test(m[2])) s = m[1]
  return s
}

export function extractFields(input: OcrLine[]): Extracted {
  const lines = input.map((l) => ({ text: normalizeLine(l.text), height: l.height })).filter((l) => l.text.length > 0)
  const texts = lines.map((l) => l.text)

  const email = findEmail(texts)
  const phone = findPhone(texts)
  const { prefecture, city } = findAddress(texts)

  const companyLine = lines.find((l) => COMPANY_RE.test(l.text) && !isContactLine(l.text.replace(COMPANY_RE, '')))
  const company = companyLine ? cleanCompany(companyLine.text) : ''

  let title = ''
  let department = ''
  for (const l of lines) {
    if (l === companyLine || isContactLine(l.text)) continue
    const t = findTitle(l.text)
    if (t && !title) title = t
    if (!department && DEPT_RE.test(l.text)) {
      const rest = t ? removeTitle(l.text, t) : l.text
      // 役職だけの行（「部長」など）は部署にしない
      if (rest && !TITLE_WORDS.includes(rest)) department = rest.replace(/[\s/／|｜・]+$/, '')
    }
  }

  // 名前: 住所・連絡先・会社・部署・役職の行を除き、名前らしい形で、文字の大きい行を選ぶ
  let best: { text: string; score: number } | null = null
  const maxHeight = Math.max(1, ...lines.map((l) => l.height))
  for (const l of lines) {
    if (l === companyLine || isContactLine(l.text)) continue
    let text = trimJunk(stripNameLabel(l.text))
    const t = findTitle(text)
    if (t) text = trimJunk(removeTitle(text, t))
    // 漢字の氏名の後ろのローマ字は外す（ローマ字があれば、氏名である手がかりにもなる）
    const withRomaji = text.match(JA_WITH_ROMAJI_RE)
    if (withRomaji) text = withRomaji[1]
    // 漢字の氏名の後ろの、1〜2文字の OCR のごみ（「中村直樹 s。」）を外す
    text = text.replace(/^([\p{Script=Han}々].*?[\p{Script=Han}々\p{Script=Hiragana}])\s+[A-Za-z0-9。、.,]{1,2}$/u, '$1')
    if (!text || text === department || DEPT_RE.test(text)) continue
    let score = (l.height / maxHeight) * 3
    if (JA_NAME_RE.test(text)) {
      score += 4
      if (startsWithSurname(text)) score += 2
      if (withRomaji) score += 1
      // 漢字1文字だけ・役職の一部のような行は名前らしくない
      if (text.replace(/\s/g, '').length < 2) score -= 3
    } else if (EN_NAME_RE.test(text) || EN_NAME_CAPS_RE.test(text)) score += 3
    else if (KANA_NAME_RE.test(text)) score += 0.5
    // 名前らしい形（漢字の氏名・英語の氏名・かなの氏名）でない行は、名前にしない（OCR のごみを名前にしないため）
    else continue
    if (!best || score > best.score) best = { text, score }
  }
  const name = best && best.score > 1 ? best.text : ''

  return { name, company, department, title, prefecture, city, phone, email }
}
