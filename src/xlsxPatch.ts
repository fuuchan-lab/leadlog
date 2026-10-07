/**
 * 書き出した Excel ブックの仕上げ。Excel 出力ライブラリにない機能（見出し行のフィルター・シートを隠す）を、
 * できあがった xlsx の中の XML に書き足す。
 */
import { createZip, readZip } from './zip.ts'

/** 1始まりの列番号 → Excel の列名（1 → A, 27 → AA） */
export function columnLetters(n: number): string {
  let s = ''
  for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s
  return s
}

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface PatchOptions {
  /** 1枚目のシートのフィルター。headerRow（1始まり）から lastRow まで、columnCount 列 */
  filter?: { sheetName: string; headerRow: number; lastRow: number; columnCount: number }
  /** 隠すシートの名前（Excel の「再表示」で見られる） */
  hiddenSheets?: string[]
}

/** 書き足せない時は、元のブックをそのまま返す（書き出し自体は続ける） */
export async function patchWorkbook(workbook: Blob, { filter, hiddenSheets = [] }: PatchOptions): Promise<Blob> {
  try {
    const entries = await readZip(workbook)
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    const book = entries.find((e) => e.name === 'xl/workbook.xml')
    if (!book) return workbook
    let bookXml = decoder.decode(book.data)
    let changed = false

    for (const name of hiddenSheets) {
      const next = bookXml.replace(new RegExp(`(<sheet [^>]*name="${escapeXml(name)}")`), '$1 state="hidden"')
      if (next !== bookXml) {
        bookXml = next
        changed = true
      }
    }

    if (filter && filter.columnCount >= 1 && filter.lastRow > filter.headerRow) {
      const sheet = entries.find((e) => e.name === 'xl/worksheets/sheet1.xml')
      const sheetXml = sheet ? decoder.decode(sheet.data) : ''
      if (sheet && sheetXml.includes('</sheetData>')) {
        const ref = `A${filter.headerRow}:${columnLetters(filter.columnCount)}${filter.lastRow}`
        sheet.data = encoder.encode(sheetXml.replace('</sheetData>', `</sheetData><autoFilter ref="${ref}"/>`))
        // Excel が内部で使う名前（なくても開けるが、付けておくとフィルターの状態が正しく扱われる）
        const absolute = ref.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')
        const name = `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${escapeXml(filter.sheetName.replace(/'/g, "''"))}'!${absolute}</definedName>`
        bookXml = bookXml.includes('<definedNames/>')
          ? bookXml.replace('<definedNames/>', `<definedNames>${name}</definedNames>`)
          : bookXml.replace('<definedNames>', `<definedNames>${name}`)
        changed = true
      }
    }

    if (!changed) return workbook
    book.data = encoder.encode(bookXml)
    return await createZip(entries)
  } catch (e) {
    console.error('[export-patch]', e)
    return workbook
  }
}
