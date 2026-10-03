import assert from 'node:assert/strict'
import { test } from 'node:test'
import { looksLikeAiKey, normalizeAiKey } from './aiKey.ts'

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz_0123456789-AB'

test('コピーで付いた空白・改行・引用符・前置きを取り除く', () => {
  assert.equal(normalizeAiKey(`  ${KEY}\n`), KEY)
  assert.equal(normalizeAiKey(`"${KEY}"`), KEY)
  assert.equal(normalizeAiKey(`ANTHROPIC_API_KEY=${KEY}`), KEY)
  assert.equal(normalizeAiKey(`sk-ant-api03-abc\ndefghijklmnopqrstuvwxyz`), 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
})

test('API キーの形かどうか', () => {
  assert.ok(looksLikeAiKey(KEY))
  assert.equal(looksLikeAiKey('sk-proj-abcdefghijklmnopqrstuvwxyz'), false) // 別の会社のキー
  assert.equal(looksLikeAiKey('sk-ant-short'), false)
  assert.equal(looksLikeAiKey(''), false)
})
