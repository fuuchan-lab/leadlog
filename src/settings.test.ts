import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addCategory,
  defaultSettings,
  mergeSettings,
  moveCategory,
  parseSettings,
  removeCategory,
  serializeSettings,
  updateCategory,
  visibleCategories,
} from './settings.ts'
import { newExhibition } from './exhibitions.ts'

const base = defaultSettings('ja')

test('既定の重要度は A〜E、展示会はまだ無い', () => {
  assert.deepEqual(
    base.importance.map((c) => c.label),
    ['A', 'B', 'C', 'D', 'E'],
  )
  assert.deepEqual(base.exhibitions, [])
})

test('保存した内容を読み戻せる。壊れた値は既定値で補う', () => {
  assert.deepEqual(parseSettings(serializeSettings(base), base), base)
  const broken = parseSettings(JSON.stringify({ exhibitions: [{ id: 'x' }], importance: 'bad' }), base)
  assert.deepEqual(broken.exhibitions, [])
  assert.deepEqual(broken.importance, base.importance)
  // 以前のバージョン（展示会が1つだけ）の設定を読み込むと、展示会の一覧になる
  const legacy = parseSettings(JSON.stringify({ exhibition: { name: 'Expo', startDate: '2026-10-07', days: 3, startHour: 10, endHour: 17 }, exhibitionUpdatedAt: 9 }), base)
  assert.equal(legacy.exhibitions.length, 1)
  assert.equal(legacy.exhibitions[0].endDate, '2026-10-09')
})

test('まとまりごとに新しい方を採用する。展示会は両方の端末のものを残す', () => {
  const exA = { ...newExhibition('a', new Date(2026, 9, 7)), name: 'A' }
  const exB = { ...newExhibition('b', new Date(2026, 9, 8)), name: 'B' }
  const local = { ...base, exhibitions: [exA] }
  const remote = {
    ...base,
    exhibitions: [exB],
    customerTypes: [{ id: 'x', label: 'X', color: '#000' }],
    customerTypesUpdatedAt: 300,
  }
  const merged = mergeSettings(local, remote)
  assert.deepEqual(
    merged.exhibitions.map((e) => e.name),
    ['A', 'B'],
  )
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

