import assert from 'node:assert/strict'
import { test } from 'node:test'
import writeExcelFile from 'write-excel-file/universal'
import { chunkText, DATA_SHEET_NAME, readExcelPackage } from './excelPackage.ts'
import { patchWorkbook } from './xlsxPatch.ts'
import { readZip } from './zip.ts'

const png = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64'),
)

test('chunkText: つなぎ直すと元に戻り、空でも1行になる', () => {
  const text = 'あ'.repeat(70_000) + '😀'
  const chunks = chunkText(text, 30_000)
  assert.equal(chunks.length, 3)
  assert.equal(chunks.join(''), text)
  assert.deepEqual(chunkText(''), [''])
})

test('書き出したブックから、非表示シートの JSON と、図の名前（リード ID）ごとの画像を取り出せる', async () => {
  const json = JSON.stringify({ version: 1, leads: [{ id: 'a<&>"', company: '九州半導体産業展 ' + 'x'.repeat(70_000) }] })
  const image = (id: string, column: number) => ({
    content: new Blob([png]),
    contentType: 'image/png',
    width: 5,
    height: 5,
    dpi: 96,
    anchor: { row: 1, column },
    title: id,
  })
  const book = await writeExcelFile([
    { data: [[{ value: 'リード' }]], sheet: 'リード' },
    { data: [[{ value: '' }, { value: '' }]], sheet: '名刺画像', images: [image('lead-1', 1), image('lead-2', 2)] },
    { data: chunkText(json).map((value) => [{ value }]), sheet: DATA_SHEET_NAME },
  ]).toBlob()
  const patched = await patchWorkbook(book, { hiddenSheets: [DATA_SHEET_NAME] })
  const pkg = readExcelPackage(await readZip(patched))
  assert.equal(pkg.dataText, json)
  assert.deepEqual([...pkg.photos.keys()].sort(), ['lead-1', 'lead-2'])
  assert.deepEqual(pkg.photos.get('lead-1'), png)
})

test('LeadLog 以外の Excel は、データなしとして扱う', async () => {
  const book = await writeExcelFile([{ data: [[{ value: 'A' }]], sheet: 'S' }]).toBlob()
  const pkg = readExcelPackage(await readZip(book))
  assert.equal(pkg.dataText, null)
  assert.equal(pkg.photos.size, 0)
})
