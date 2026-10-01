import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMPTY_FIELDS, fillEmpty } from './types.ts'

test('読み取った内容は空欄にだけ入れる', () => {
  const cur = { ...EMPTY_FIELDS, name: '山田 太郎', company: ' ' }
  const next = fillEmpty(cur, { name: '山田 大郎', company: '株式会社サンプル', email: '', phone: '03-1234-5678' })
  assert.equal(next.name, '山田 太郎') // 入力済みは変えない
  assert.equal(next.company, '株式会社サンプル') // 空白だけの欄は空欄とみなす
  assert.equal(next.email, '')
  assert.equal(next.phone, '03-1234-5678')
  assert.equal(cur.phone, '') // 元の値は変えない
})
