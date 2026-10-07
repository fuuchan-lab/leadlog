import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createZip, readZip } from './zip.ts'

test('ZIP に入れたファイルを、名前と中身そのまま取り出せる', async () => {
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, leads: [{ id: 'a' }] }))
  const photo = new Uint8Array(500).map((_, i) => i % 256)
  const zip = await createZip([
    { name: 'leadlog-data.json', data: json },
    { name: 'card-abc123.jpg', data: photo },
  ])
  const entries = await readZip(zip)
  assert.equal(entries.length, 2)
  const back = new Map(entries.map((e) => [e.name, e.data]))
  assert.deepEqual(back.get('leadlog-data.json'), json)
  assert.deepEqual(back.get('card-abc123.jpg'), photo)
})

test('空のファイルや、圧縮してもあまり縮まらないデータでも取り出せる', async () => {
  const zip = await createZip([
    { name: 'empty.json', data: new Uint8Array(0) },
    { name: 'random.bin', data: crypto.getRandomValues(new Uint8Array(2000)) },
  ])
  const entries = await readZip(zip)
  assert.equal(entries.find((e) => e.name === 'empty.json')?.data.length, 0)
  assert.equal(entries.find((e) => e.name === 'random.bin')?.data.length, 2000)
})

test('日本語のファイル名に UTF-8 フラグ (bit 11) と Unicode Path 拡張が付き、名前がそのまま戻る', async () => {
  const name = 'LeadLog_九州半導体産業展_20261007-1238.xlsx'
  const zip = await createZip([{ name, data: new Uint8Array([1, 2, 3]) }])
  const buf = new Uint8Array(await zip.arrayBuffer())
  const view = new DataView(buf.buffer)
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800, 'ローカルヘッダ')
  const central = view.getUint32(buf.length - 6, true)
  assert.equal(view.getUint16(central + 8, true) & 0x0800, 0x0800, '中央ディレクトリ')
  assert.equal(view.getUint16(central + 30, true) > 0, true, '拡張フィールドあり')
  assert.deepEqual((await readZip(zip)).map((e) => e.name), [name])
})
