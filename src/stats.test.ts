import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findDuplicates, matchingLeads } from './duplicates.ts'
import { newExhibition } from './exhibitions.ts'
import { buildDashboard } from './stats.ts'
import { EMPTY_FIELDS, type Lead } from './types.ts'

function lead(id: string, createdAt: Date, extra: Partial<Lead> = {}, deviceId = 'aaaaaaaa', member = '田中'): Lead {
  const author = { deviceId, member, device: 'Android · Chrome' }
  return {
    ...EMPTY_FIELDS,
    id,
    photoId: null,
    ocrText: '',
    exhibition: 'Expo',
    createdAt: createdAt.getTime(),
    createdBy: author,
    updatedAt: createdAt.getTime(),
    updatedBy: author,
    synced: true,
    ...extra,
  }
}

const ex = {
  ...newExhibition('ex1', new Date(2026, 9, 7)),
  name: 'Expo',
  startDate: '2026-10-07',
  endDate: '2026-10-09',
  startHour: 10,
  endHour: 17,
}

test('会期中のリードを、時間帯 × 日で数える', () => {
  const leads = [
    lead('1', new Date(2026, 9, 7, 10, 5), { importance: 'imp-a' }),
    lead('2', new Date(2026, 9, 7, 10, 59)),
    lead('3', new Date(2026, 9, 8, 16, 30), {}, 'bbbbbbbb', '佐藤'),
    lead('4', new Date(2026, 9, 9, 18, 0)), // 閉場後
    lead('5', new Date(2026, 9, 6, 12, 0)), // 会期前
    lead('6', new Date(2026, 9, 7, 11, 0), { exhibitionId: 'other' }), // 別の展示会
  ]
  const d = buildDashboard(leads, ex, new Date(2026, 9, 8, 12).getTime())
  assert.equal(d.total, 4)
  assert.deepEqual(d.perDay, [2, 1, 1])
  assert.equal(d.rows.length, 7)
  assert.equal(d.rows[0].day0, 2)
  assert.equal(d.rows[6].day1, 1)
  assert.equal(d.outside, 1)
  assert.equal(d.todayIndex, 1)
  assert.equal(d.today, 1)
  assert.equal(d.byImportance.get('imp-a'), 1)
  assert.deepEqual(
    d.byMember.map((m) => [m.member, m.count]),
    [
      ['田中', 3],
      ['佐藤', 1],
    ],
  )
})

test('会期外の日は、今日の件数を 0 にする', () => {
  const d = buildDashboard([], ex, new Date(2026, 9, 20).getTime())
  assert.equal(d.todayIndex, null)
  assert.equal(d.today, 0)
})

test('メールアドレス・氏名と会社名が同じリードを、重複の可能性として見つける', () => {
  const t = new Date(2026, 9, 7, 11)
  const leads = [
    lead('1', t, { email: 'Taro@Example.jp' }),
    lead('2', t, { email: 'taro@example.jp' }, 'bbbbbbbb'),
    lead('3', t, { name: '山田 太郎', company: '株式会社サンプル' }),
    lead('4', t, { name: '山田太郎', company: '株式会社 サンプル' }),
    lead('5', t, { name: '鈴木', company: '株式会社サンプル', phone: '03-1111-2222' }),
    lead('6', t, { name: '佐藤', company: '別会社', phone: '03-1111-2222' }), // 代表番号が同じだけ
  ]
  const dup = findDuplicates(leads)
  assert.deepEqual([...dup.keys()].sort(), ['1', '2', '3', '4'])
  assert.deepEqual(
    matchingLeads({ ...EMPTY_FIELDS, email: 'TARO@example.jp' }, leads).map((l) => l.id),
    ['1', '2'],
  )
  assert.deepEqual(matchingLeads({ ...EMPTY_FIELDS, email: 'taro@example.jp' }, leads, '1').map((l) => l.id), ['2'])
})
