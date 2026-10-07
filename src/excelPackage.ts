/**
 * Excel ブック (.xlsx) に、あとで「読み込む」で戻せるデータを持たせる・取り出す。
 *
 * - データ: 非表示シート「_leadlog」の A 列に、leadlog-data.json と同じ内容（JSON）を分けて入れる。
 *   セルの文字数の上限（約3万字）があるので、CHUNK_SIZE ごとに1行ずつ。Excel で保存し直しても残る。
 * - 画像: 「名刺画像」シートの画像。図の名前にリード ID を持たせてある（exportExcel.ts）ので、
 *   セルの位置ではなく図の情報だけで、どのリードの画像か分かる。
 * xlsx は ZIP なので、zip.ts の readZip だけで読める（Excel 読み込み用のライブラリは使わない）。
 */
import type { ZipEntry } from './zip.ts'

export const DATA_SHEET_NAME = '_leadlog'
const CHUNK_SIZE = 30_000

/** JSON の文字列を、1セルに入る長さに分ける（つなぎ直せば元に戻る） */
export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks.length > 0 ? chunks : ['']
}

const unescapeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]

/** 要素の中の文字（<t> をつなぐ。ふりがな <rPh> は除く） */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  return [...clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('')
}

/** 相対パス（baseFile のフォルダーからの target）を、ブック内のパスにする */
function resolvePath(baseFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = baseFile.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

function relationships(entries: Map<string, Uint8Array>, relsPath: string): Map<string, string> {
  const data = entries.get(relsPath)
  const map = new Map<string, string>()
  if (!data) return map
  const ownerFile = relsPath.replace('_rels/', '').replace(/\.rels$/, '')
  for (const m of new TextDecoder().decode(data).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const target = attr(m[0], 'Target')
    if (id && target) map.set(id, resolvePath(ownerFile, target))
  }
  return map
}

export interface ExcelPackage {
  /** leadlog-data.json と同じ形式の JSON。LeadLog が書き出したブックでなければ null */
  dataText: string | null
  /** リード ID → 名刺・バッジの画像 */
  photos: Map<string, Uint8Array>
}

export function readExcelPackage(zipEntries: ZipEntry[]): ExcelPackage {
  const entries = new Map(zipEntries.map((e) => [e.name, e.data]))
  const decoder = new TextDecoder()
  const text = (name: string) => decoder.decode(entries.get(name) ?? new Uint8Array())

  // 非表示シートの JSON
  let dataText: string | null = null
  const bookRels = relationships(entries, 'xl/_rels/workbook.xml.rels')
  const sheetTag = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].find(
    (m) => unescapeXml(attr(m[0], 'name') ?? '') === DATA_SHEET_NAME,
  )
  const sheetPath = sheetTag ? bookRels.get(attr(sheetTag[0], 'r:id') ?? '') : undefined
  if (sheetPath && entries.has(sheetPath)) {
    const strings = [...text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    const rows: { row: number; value: string }[] = []
    for (const m of text(sheetPath).matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /^A(\d+)$/.exec(attr(m[1], 'r') ?? '')
      if (!ref) continue
      const type = attr(m[1], 't')
      const raw = /<v>([\s\S]*?)<\/v>/.exec(m[2])?.[1] ?? ''
      const value = type === 's' ? (strings[Number(raw)] ?? '') : type === 'inlineStr' ? textOf(m[2]) : unescapeXml(raw)
      rows.push({ row: Number(ref[1]), value })
    }
    if (rows.length > 0) dataText = rows.sort((a, b) => a.row - b.row).map((r) => r.value).join('')
  }

  // 「名刺画像」シートなどの画像（図の名前 = リード ID）
  const photos = new Map<string, Uint8Array>()
  for (const name of entries.keys()) {
    if (!/^xl\/drawings\/[^/]+\.xml$/.test(name)) continue
    const rels = relationships(entries, name.replace('drawings/', 'drawings/_rels/') + '.rels')
    for (const pic of text(name).matchAll(/<(?:\w+:)?pic>([\s\S]*?)<\/(?:\w+:)?pic>/g)) {
      const leadId = unescapeXml(attr(/<(?:\w+:)?cNvPr\b[^>]*>/.exec(pic[1])?.[0] ?? '', 'name') ?? '')
      const embed = attr(/<a:blip\b[^>]*>/.exec(pic[1])?.[0] ?? '', 'r:embed')
      const data = embed ? entries.get(rels.get(embed) ?? '') : undefined
      if (leadId && data && !photos.has(leadId)) photos.set(leadId, data)
    }
  }
  return { dataText, photos }
}
