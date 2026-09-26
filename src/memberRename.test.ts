import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renameMemberInLead, sameName } from './leadRename.ts'
import { renameOrMergeCategory, uniqueByLabel, visibleCategories, type Category } from './settings.ts'
import type { Author, Lead } from './types.ts'

const cat = (id: string, label: string, extra: Partial<Category> = {}): Category => ({ id, label, color: '#000000', ...extra })
const author = (member: string): Author => ({ deviceId: 'aaaaaaaa', member, device: 'Android · Chrome' })
const lead = (extra: Partial<Lead> = {}): Lead =>
  ({
    id: 'l1', staff: '', createdBy: author(''), updatedBy: author(''), nextSteps: [], updatedAt: 1000, synced: true,
    ...extra,
  }) as Lead

test('新しい名前がまだ一覧に無ければ、その項目の名前を変える', () => {
  const list = [cat('a', 'Hirai'), cat('b', '鈴木')]
  const r = renameOrMergeCategory(list, 'a', ' 平井 ', '#ff0000')
  assert.ok(r.ok)
  assert.equal(r.merged, false)
  assert.equal(r.label, '平井')
  assert.deepEqual(visibleCategories(r.list).map((c) => c.label), ['平井', '鈴木'])
  assert.equal(r.list[0].color, '#ff0000')
})

test('新しい名前がすでに一覧にあれば統合して、一覧には1つだけ残る（先にあった方の名前・位置を残す）', () => {
  const list = [cat('p', '平井'), cat('a', 'Hirai'), cat('b', '鈴木')]
  const r = renameOrMergeCategory(list, 'a', '平井', '#ff0000')
  assert.ok(r.ok)
  assert.equal(r.merged, true)
  assert.equal(r.label, '平井')
  assert.deepEqual(visibleCategories(r.list).map((c) => c.label), ['平井', '鈴木'])
  // 消した項目は、他の端末に削除を伝えるため deleted として残す
  assert.equal(r.list.find((c) => c.id === 'a')?.deleted, true)
})

test('大文字・小文字だけ違う名前も、同じ名前として統合する（一覧に残っている表記を使う）', () => {
  const r = renameOrMergeCategory([cat('a', 'hirai'), cat('b', 'Hirai')], 'a', 'HIRAI', '#000000')
  assert.ok(r.ok && r.merged)
  assert.equal(r.label, 'Hirai')
})

test('空の名前は変えられない', () => {
  assert.deepEqual(renameOrMergeCategory([cat('a', 'x')], 'a', '  ', '#000000'), { ok: false, reason: 'empty' })
})

test('uniqueByLabel は、重複を1つにする', () => {
  assert.deepEqual(uniqueByLabel([cat('1', '平井'), cat('2', 'Hirai'), cat('3', 'hirai'), cat('4', '平井')]).map((c) => c.id), ['1', '2'])
})

test('sameName は、空白と大文字・小文字の違いを無視する', () => {
  assert.ok(sameName(' Hirai ', 'hirai'))
  assert.ok(!sameName('Hirai', '平井'))
})

test('過去のリードの、担当者・登録者・次のアクションの担当を、新しい名前に置き換える', () => {
  const before = lead({
    staff: 'Hirai',
    createdBy: author('Hirai'),
    updatedBy: author('鈴木'),
    nextSteps: [
      { action: 'x', who: 'hirai', when: '' },
      { action: 'y', who: '鈴木', when: '' },
    ],
  })
  const after = renameMemberInLead(before, 'Hirai', '平井', 5000)
  assert.ok(after)
  assert.equal(after.staff, '平井')
  assert.equal(after.createdBy.member, '平井')
  assert.equal(after.updatedBy.member, '鈴木')
  assert.deepEqual(after.nextSteps.map((s) => s.who), ['平井', '鈴木'])
  // 他の端末に伝わるよう、更新時刻が進み、未同期になる。他の項目は変わらない
  assert.equal(after.updatedAt, 5000)
  assert.equal(after.synced, false)
  assert.equal(after.createdBy.deviceId, 'aaaaaaaa')
})

test('対象の名前が無いリードは変えない（null）。名前が同じ時も変えない', () => {
  assert.equal(renameMemberInLead(lead({ staff: '鈴木' }), 'Hirai', '平井', 5000), null)
  assert.equal(renameMemberInLead(lead({ staff: 'Hirai' }), 'Hirai', 'Hirai', 5000), null)
})

test('更新時刻は、元より必ず進む（時計がずれていても、新しい方として扱われる）', () => {
  const after = renameMemberInLead(lead({ staff: 'Hirai', updatedAt: 9000 }), 'Hirai', '平井', 5000)
  assert.equal(after?.updatedAt, 9001)
})
