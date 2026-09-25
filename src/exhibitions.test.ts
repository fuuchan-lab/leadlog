import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  belongsTo,
  dayCount,
  exhibitionDays,
  fromLegacy,
  mergeExhibitions,
  newExhibition,
  normalizeRange,
  parseExhibition,
  resolveCurrent,
  type Exhibition,
} from './exhibitions.ts'

const ex = (id: string, startDate: string, extra: Partial<Exhibition> = {}): Exhibition => ({
  ...newExhibition(id, new Date(2026, 0, 1)),
  startDate,
  endDate: startDate,
  ...extra,
})

test('新しい展示会は今日から3日間・10時〜17時', () => {
  const e = newExhibition('x', new Date(2026, 9, 30))
  assert.equal(e.startDate, '2026-10-30')
  assert.equal(e.endDate, '2026-11-01')
  assert.equal(dayCount(e), 3)
  assert.deepEqual([e.startHour, e.endHour], [10, 17])
})

test('会期の各日（月をまたぐ）', () => {
  const days = exhibitionDays({ startDate: '2026-10-30', endDate: '2026-11-01' })
  assert.deepEqual(
    days.map((d) => new Date(d).getDate()),
    [30, 31, 1],
  )
})

test('カレンダーで逆の順に選んでも、初日と最終日を正しく並べる。最大14日に収める', () => {
  assert.deepEqual(normalizeRange('2026-10-09', '2026-10-07'), { startDate: '2026-10-07', endDate: '2026-10-09' })
  assert.deepEqual(normalizeRange('2026-10-01', '2026-12-01'), { startDate: '2026-10-01', endDate: '2026-10-14' })
})

test('壊れた値を補って読み込む', () => {
  assert.equal(parseExhibition({ id: 'a' }), null)
  const e = parseExhibition({ id: 'a', startDate: '2026-10-09', endDate: '2026-10-07', startHour: 20, endHour: 5 })
  assert.ok(e)
  assert.equal(e.startDate, '2026-10-07')
  assert.equal(e.endHour, 21)
})

test('以前の設定（展示会1つ・日数）を一覧に変換する。名前が空なら作らない', () => {
  const [e] = fromLegacy({ name: 'Expo', location: 'Hall', startDate: '2026-10-07', days: 3, startHour: 9, endHour: 18 }, 5)
  assert.equal(e.id, 'ex-legacy')
  assert.equal(e.endDate, '2026-10-09')
  assert.deepEqual([e.startHour, e.endHour, e.location], [9, 18, 'Hall'])
  assert.deepEqual(fromLegacy({ name: '', startDate: '2026-10-07', days: 3 }, 5), [])
})

test('別々の端末で作った展示会はどちらも残り、同じ展示会は新しい方を採用する', () => {
  const a = ex('a', '2026-10-07', { name: 'old', updatedAt: 1 })
  const b = ex('b', '2026-11-07')
  const a2 = { ...a, name: 'new', updatedAt: 2 }
  const merged = mergeExhibitions([a, b], [a2, ex('c', '2026-12-01')])
  assert.deepEqual(
    merged.map((e) => e.id).sort(),
    ['a', 'b', 'c'],
  )
  assert.equal(merged.find((e) => e.id === 'a')?.name, 'new')
  assert.equal(mergeExhibitions([a2], [a])[0].name, 'new')
})

test('開いている展示会: 端末で選んだもの、なければ会期がいちばん新しいもの', () => {
  const list = [ex('a', '2026-10-07'), ex('b', '2026-11-07'), ex('c', '2026-12-07', { deleted: true })]
  assert.equal(resolveCurrent(list, 'a')?.id, 'a')
  assert.equal(resolveCurrent(list, null)?.id, 'b')
  assert.equal(resolveCurrent(list, 'c')?.id, 'b') // 削除された展示会を選んでいた
  assert.equal(resolveCurrent([], null), null)
})

test('リードがどの展示会のものか。以前のリードは展示会名で判断する', () => {
  const e = ex('a', '2026-10-07', { name: 'Expo' })
  assert.ok(belongsTo({ exhibitionId: 'a', exhibition: 'x' }, e))
  assert.ok(!belongsTo({ exhibitionId: 'b', exhibition: 'Expo' }, e))
  assert.ok(belongsTo({ exhibitionId: '', exhibition: 'Expo' }, e))
  assert.ok(!belongsTo({ exhibitionId: '', exhibition: '' }, { ...e, name: '' }))
})
