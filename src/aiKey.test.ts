import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aiProviderOf, looksLikeAiKey, normalizeAiKey } from './aiKey.ts'

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz_0123456789-AB'

test('コピーで付いた空白・改行・引用符・前置きを取り除く', () => {
  assert.equal(normalizeAiKey(`  ${KEY}\n`), KEY)
  assert.equal(normalizeAiKey(`"${KEY}"`), KEY)
  assert.equal(normalizeAiKey(`ANTHROPIC_API_KEY=${KEY}`), KEY)
  assert.equal(normalizeAiKey(`sk-ant-api03-abc\ndefghijklmnopqrstuvwxyz`), 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
})

test('API キーの形かどうか', () => {
  assert.ok(looksLikeAiKey(KEY))
  assert.ok(looksLikeAiKey('sk-proj-abcdefghijklmnopqrstuvwxyz')) // OpenAI
  assert.equal(looksLikeAiKey('sk-proj-abcdefghijklmnopqrstuvwxyz', 'anthropic'), false)
  assert.equal(looksLikeAiKey('sk-ant-short'), false)
  assert.equal(looksLikeAiKey(''), false)
})

test('キーの形から、どの会社のキーかを見分ける', () => {
  assert.equal(aiProviderOf(KEY), 'anthropic')
  assert.equal(aiProviderOf('sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz012345'), 'openai')
  assert.equal(aiProviderOf('AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'), 'gemini')
  assert.equal(aiProviderOf('AIza-short'), null)
  assert.equal(aiProviderOf('hello'), null)
  assert.equal(normalizeAiKey('GEMINI_API_KEY="AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q"'), 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q')
  assert.equal(normalizeAiKey('OPENAI_API_KEY=sk-proj-abc'), 'sk-proj-abc')
})
