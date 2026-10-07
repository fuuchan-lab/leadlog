import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CARD_COLUMNS, cardsSheet } from './excelData.ts'
import type { Lead } from './types.ts'

const day = (d: number, h: number) => new Date(2026, 9, d, h).getTime()
const lead = (id: string, metAt: number, photo = true): Lead =>
  ({ id, name: id, company: 'C' + id, metAt, createdAt: metAt, photoId: photo ? 'p' + id : null }) as unknown as Lead
const t = ((key: string, vars?: { n?: number }) => `${key}${vars?.n ?? ''}`) as never

test('名刺画像シート: 来場日ごとに見出しを付け、登録順に CARD_COLUMNS 枚ずつ並べる', () => {
  const leads = [lead('d', day(8, 9)), lead('a', day(7, 10)), lead('x', day(7, 11), false), lead('b', day(7, 12)),
    lead('c', day(7, 13)), lead('e', day(7, 14)), lead('f', day(7, 15))]
  const sheet = cardsSheet(leads, new Set(['a', 'b', 'c', 'd', 'e', 'f']), null, t)
  assert.deepEqual(sheet.tiles.map((x) => x.leadId), ['a', 'b', 'c', 'e', 'f', 'd'])
  // 1日目: 見出し + (見出し行+画像行) × 2、2日目: 見出し + 2行
  assert.equal(sheet.data.length, 1 + 4 + 1 + 2)
  assert.deepEqual([sheet.tiles[3].row, sheet.tiles[3].column], [3, 4]) // 4枚目は1段目の右端
  assert.deepEqual([sheet.tiles[4].row, sheet.tiles[4].column], [5, 1]) // 5枚目は2段目の左端
  assert.equal(CARD_COLUMNS, 4)
  assert.match(String(sheet.data[0][0]?.value), /^chart\.day1/)
  assert.match(String(sheet.data[5][0]?.value), /^chart\.day2/)
  assert.match(String(sheet.data[1][0]?.value), /^No\.1 /)
  assert.match(String(sheet.data[1][1]?.value), /^No\.3 /) // 「リード」シートの No.（画像なしの x も数える）
})
