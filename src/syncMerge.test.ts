import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LEAD_FILE_RE, mergeLead, ownLeads, parseLeadFile, serializeLeads } from './syncMerge.ts'
import { EMPTY_FIELDS, type Lead } from './types.ts'

const author = (deviceId: string, member = '') => ({ deviceId, member, device: 'Android · Chrome' })

function lead(id: string, updatedAt: number, by: string, extra: Partial<Lead> = {}): Lead {
  return {
    ...EMPTY_FIELDS,
    id,
    photoId: null,
    ocrText: '',
    exhibition: 'Expo',
    createdAt: 1000,
    createdBy: author('aaaaaaaa'),
    updatedAt,
    updatedBy: author(by),
    synced: false,
    ...extra,
  }
}

test('端末ごとのファイル名だけを同期の対象にする', () => {
  assert.ok(LEAD_FILE_RE.test('leads-ab12cd34.json'))
  assert.ok(!LEAD_FILE_RE.test('settings.json'))
  assert.ok(!LEAD_FILE_RE.test('leads-AB12.json'))
})

test('自分のファイルには、自分が最後に更新したリードだけを書く', () => {
  const all = [lead('1', 10, 'aaaaaaaa'), lead('2', 20, 'bbbbbbbb'), lead('3', 30, 'aaaaaaaa', { deleted: true })]
  assert.deepEqual(
    ownLeads(all, 'aaaaaaaa').map((l) => l.id),
    ['1', '3'],
  )
})

test('ファイルに書いて読み戻すと、synced 以外は同じ内容になる', () => {
  const l = lead('1', 10, 'aaaaaaaa', { name: '山田', note: 'メモ' })
  const [back] = parseLeadFile(serializeLeads([l]))
  const { synced: _synced, ...expected } = l
  assert.deepEqual(back, expected)
})

test('壊れた行は捨て、ファイル全体が不正なら例外にする', () => {
  const text = JSON.stringify({ leads: [{ id: 'x' }, JSON.parse(serializeLeads([lead('1', 1, 'aaaaaaaa')])).leads[0]] })
  assert.equal(parseLeadFile(text).length, 1)
  assert.throws(() => parseLeadFile('{"foo":1}'))
})

test('新しい方を採用する。同時刻なら全端末で同じ方を選ぶ', () => {
  const local = lead('1', 100, 'aaaaaaaa', { name: 'old' })
  const newer = lead('1', 200, 'bbbbbbbb', { name: 'new' })
  assert.equal(mergeLead(local, newer)?.name, 'new')
  assert.equal(mergeLead(newer, local), null)
  const tieA = lead('1', 300, 'aaaaaaaa')
  const tieB = lead('1', 300, 'bbbbbbbb')
  assert.ok(mergeLead(tieA, tieB)) // b の方が大きいので採用
  assert.equal(mergeLead(tieB, tieA), null)
  assert.equal(mergeLead(undefined, newer)?.synced, true)
})

test('2台が別々に登録しても、どちらのリードも残る（端末ごとのファイル）', () => {
  const a = [lead('a1', 10, 'aaaaaaaa')]
  const b = [lead('b1', 11, 'bbbbbbbb')]
  const fileA = serializeLeads(ownLeads(a, 'aaaaaaaa'))
  const fileB = serializeLeads(ownLeads(b, 'bbbbbbbb'))
  const merged = new Map<string, Lead>()
  for (const f of [fileA, fileB]) {
    for (const r of parseLeadFile(f)) {
      const m = mergeLead(merged.get(r.id), r)
      if (m) merged.set(m.id, m)
    }
  }
  assert.deepEqual([...merged.keys()].sort(), ['a1', 'b1'])
})
