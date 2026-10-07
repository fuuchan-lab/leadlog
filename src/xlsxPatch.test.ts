import assert from 'node:assert/strict'
import { test } from 'node:test'
import writeExcelFile from 'write-excel-file/universal'
import { columnLetters, patchWorkbook } from './xlsxPatch.ts'
import { readZip } from './zip.ts'

test('列名: 1→A, 26→Z, 27→AA, 52→AZ, 53→BA', () => {
  assert.deepEqual([1, 26, 27, 52, 53].map(columnLetters), ['A', 'Z', 'AA', 'AZ', 'BA'])
})

const text = (entries: { name: string; data: Uint8Array }[], name: string) =>
  new TextDecoder().decode(entries.find((e) => e.name === name)!.data)

test('1枚目のシートに、見出し行から最終行までのフィルターを付ける', async () => {
  const book = await writeExcelFile([
    { data: [[{ value: 'タイトル' }], [{ value: 'A' }, { value: 'B' }], [{ value: 1 }, { value: 2 }], [{ value: 3 }, { value: 4 }]], sheet: "リード's", columns: [{ width: 5 }, { width: 5 }] },
  ]).toBlob()
  const out = await readZip(await patchWorkbook(book, { filter: { sheetName: "リード's", headerRow: 2, lastRow: 4, columnCount: 2 } }))
  assert.match(text(out, 'xl/worksheets/sheet1.xml'), /<\/sheetData><autoFilter ref="A2:B4"\/>/)
  assert.match(text(out, 'xl/workbook.xml'), /_xlnm\._FilterDatabase[^>]*>'リード''s'!\$A\$2:\$B\$4</)
  assert.equal(out.length, (await readZip(book)).length)
})

test('指定したシートを非表示にする', async () => {
  const book = await writeExcelFile([
    { data: [[{ value: 'A' }]], sheet: 'S1' },
    { data: [[{ value: 'x' }]], sheet: '_leadlog' },
  ]).toBlob()
  const out = await readZip(await patchWorkbook(book, { hiddenSheets: ['_leadlog'] }))
  const xml = text(out, 'xl/workbook.xml')
  assert.match(xml, /name="_leadlog" state="hidden"/)
  assert.doesNotMatch(xml, /name="S1"[^>]*hidden/)
})

test('書き足すものがない時は、元のブックをそのまま返す', async () => {
  const book = await writeExcelFile([{ data: [[{ value: 'A' }]], sheet: 'S' }]).toBlob()
  assert.equal(await patchWorkbook(book, { filter: { sheetName: 'S', headerRow: 1, lastRow: 1, columnCount: 1 } }), book)
})
