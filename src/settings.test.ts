import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addCategory,
  defaultSettings,
  exhibitionDays,
  mergeSettings,
  moveCategory,
  parseSettings,
  removeCategory,
  serializeSettings,
  updateCategory,
  visibleCategories,
} from './settings.ts'

const base = defaultSettings('ja', new Date(2026, 9, 7))

test('既定の重要度は A〜E、会期は3日・10時〜17時', () => {
  assert.deepEqual(
    base.importance.map((c) => c.label),
    ['A', 'B', 'C', 'D', 'E'],
  )
  assert.deepEqual(base.exhibition, { name: '', startDate: '2026-10-07', days: 3, startHour: 10, endHour: 17, location: '' })
})

test('保存した内容を読み戻せる。壊れた値は既定値で補う', () => {
  assert.deepEqual(parseSettings(serializeSettings(base), base), base)
  const broken = parseSettings(JSON.stringify({ exhibition: { days: 99, startHour: 20, endHour: 5 } }), base)
  assert.equal(broken.exhibition.days, 7)
  assert.equal(broken.exhibition.endHour, 21)
  assert.deepEqual(broken.importance, base.importance)
})

test('まとまりごとに新しい方を採用する', () => {
  const local = { ...base, exhibition: { ...base.exhibition, name: 'Local' }, exhibitionUpdatedAt: 200 }
  const remote = {
    ...base,
    exhibition: { ...base.exhibition, name: 'Remote' },
    exhibitionUpdatedAt: 100,
    customerTypes: [{ id: 'x', label: 'X', color: '#000' }],
    customerTypesUpdatedAt: 300,
  }
  const merged = mergeSettings(local, remote)
  assert.equal(merged.exhibition.name, 'Local')
  assert.equal(merged.customerTypes[0].label, 'X')
  assert.equal(merged.importance, local.importance)
})

test('初めて使う端末の既定値（更新時刻 0）は、ドライブの設定に負ける', () => {
  const remote = { ...base, importance: [{ id: 'imp-s', label: 'S', color: '#f00' }], importanceUpdatedAt: 5 }
  assert.equal(mergeSettings(base, remote).importance[0].label, 'S')
})

test('追加・重複・名前の変更・削除・並べ替え', () => {
  const added = addCategory(base.customerTypes, '大学', 'new')
  assert.ok(added.ok)
  assert.equal(addCategory(base.customerTypes, ' 競合 ', 'dup').ok, false)
  assert.equal(addCategory(base.customerTypes, '  ', 'e').ok, false)
  const renamed = updateCategory(base.importance, 'imp-a', 'A 至急', '#000000')
  assert.ok(renamed.ok && renamed.list[0].label === 'A 至急')
  const removed = removeCategory(base.importance, 'imp-b')
  assert.equal(visibleCategories(removed).length, 4)
  assert.equal(removed.length, 5) // 過去のリードの表示のために残す
  const moved = moveCategory(removed, 'imp-c', -1) // 削除済みの B を飛ばして A と入れ替わる
  assert.deepEqual(
    visibleCategories(moved).map((c) => c.label),
    ['C', 'A', 'D', 'E'],
  )
  assert.equal(moveCategory(base.importance, 'imp-a', -1), base.importance)
})

test('会期の各日', () => {
  const days = exhibitionDays({ ...base.exhibition, startDate: '2026-10-30', days: 3 })
  assert.deepEqual(
    days.map((d) => new Date(d).getDate()),
    [30, 31, 1],
  )
})
