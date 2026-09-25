import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEVICE_FILE_RE, isWithinLimit, sortRegistrations } from './devices.ts'

const reg = (deviceId: string, createdTime: string) => ({ deviceId, fileId: `f-${deviceId}`, createdTime })

test('登録ファイルの名前', () => {
  assert.ok(DEVICE_FILE_RE.test('device-ab12cd34.json'))
  assert.ok(!DEVICE_FILE_RE.test('leads-ab12cd34.json'))
})

test('登録の早い10台だけが有効。同時刻なら端末ID順で、全端末で同じ結果になる', () => {
  const files = Array.from({ length: 11 }, (_, i) => reg(`dev0000${i}`.slice(-8), `2026-10-07T10:00:${String(i).padStart(2, '0')}Z`))
  assert.ok(isWithinLimit(files, files[9].deviceId))
  assert.ok(!isWithinLimit(files, files[10].deviceId))
  // 最後の枠に2台が同時に登録
  const tie = [...files.slice(0, 9), reg('zzzzzzzz', '2026-10-07T11:00:00Z'), reg('aaaaaaaa', '2026-10-07T11:00:00Z')]
  assert.ok(isWithinLimit(tie, 'aaaaaaaa'))
  assert.ok(!isWithinLimit(tie, 'zzzzzzzz'))
  assert.equal(sortRegistrations(tie)[9].deviceId, 'aaaaaaaa')
})

test('同じ端末の登録ファイルが2つあっても、1台として数える', () => {
  const files = [...Array.from({ length: 9 }, (_, i) => reg(`d000000${i}`, `2026-10-07T10:0${i}:00Z`)), reg('d0000000', '2026-10-07T12:00:00Z'), reg('newdev00', '2026-10-07T13:00:00Z')]
  assert.ok(isWithinLimit(files, 'newdev00'))
})
