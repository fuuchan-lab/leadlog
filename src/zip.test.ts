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
