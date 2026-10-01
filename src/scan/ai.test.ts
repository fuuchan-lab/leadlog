import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aiChanges, toAiResult } from './ai.ts'

test('AI の答えを入力欄の形にそろえる', () => {
  const r = toAiResult({
    name: ' 山田 太郎 ',
    company: '株式会社サンプル',
    department: '営業部',
    title: '課長',
    prefecture: '東京',
    city: '港区',
    phone: '03-1234-5678',
    email: 'Taro.Yamada@Example.co.jp',
    text: '株式会社サンプル\n山田 太郎',
  })
  assert.equal(r.fields.name, '山田 太郎')
  assert.equal(r.fields.prefecture, '東京都') // 「都」が抜けていても直す
  assert.equal(r.fields.email, 'taro.yamada@example.co.jp')
  assert.equal(r.text, '株式会社サンプル\n山田 太郎')
})

test('一覧に無い都道府県・足りない項目・壊れた答えは空にする', () => {
  const r = toAiResult({ name: 'John Smith', prefecture: 'California', phone: 123 })
  assert.equal(r.fields.prefecture, '')
  assert.equal(r.fields.phone, '')
  assert.equal(r.fields.company, '')
  assert.deepEqual(toAiResult(null).fields.name, '')
})

test('再解析で変わる項目だけを選ぶ（AI が空・同じ値の項目は除く）', () => {
  const current = { name: '山田 大郎', company: '株式会社サンプル', department: '営業部', title: '', prefecture: '', city: '', phone: '03-1234-5678', email: 'x@example.com' }
  const found = { name: '山田 太郎', company: '株式会社サンプル', department: '', title: '課長', prefecture: '東京都', city: '', phone: '03-1234-5678', email: 'x@example.com' }
  assert.deepEqual(aiChanges(current, found), ['name', 'title', 'prefecture'])
})
