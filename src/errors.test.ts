import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describeError, isNetworkError } from './errors.ts'

test('通信できない時の失敗（fetch の TypeError・Google のスクリプトを読めない）は通信エラー', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isNetworkError(new Error('google-identity-not-loaded')), true)
})

test('認証の失敗・ユーザーの中止・サーバーのエラーは通信エラーではない（ログイン状態を消してよい）', () => {
  assert.equal(isNetworkError(new Error('drive-request-failed-401')), false)
  assert.equal(isNetworkError(new Error('drive-request-failed-403')), false)
  assert.equal(isNetworkError(new Error('popup_closed')), false)
  assert.equal(isNetworkError(new Error('access_denied')), false)
  assert.equal(isNetworkError('string'), false)
  assert.equal(isNetworkError(null), false)
})

test('describeError は名前とメッセージ、位置情報のエラーはコードとメッセージにする', () => {
  assert.equal(describeError(new Error('boom')), 'Error: boom')
  assert.equal(describeError({ code: 1, message: 'User denied Geolocation' }), '1: User denied Geolocation')
  assert.equal(describeError('x'), 'x')
})
