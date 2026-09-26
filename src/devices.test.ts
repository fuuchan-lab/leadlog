import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEVICE_FILE_RE, isWithinLimit, MAX_DEVICES, sortRegistrations } from './devices.ts'

const reg = (deviceId: string, createdTime: string) => ({ deviceId, fileId: `f-${deviceId}`, createdTime })
/** i 番目に登録した端末（端末ID は8文字、登録時刻は i 分ずつ後） */
const nth = (i: number) => reg(`d${String(i).padStart(7, '0')}`, `2026-10-07T10:${String(i).padStart(2, '0')}:00Z`)

test('登録ファイルの名前', () => {
  assert.ok(DEVICE_FILE_RE.test('device-ab12cd34.json'))
  assert.ok(!DEVICE_FILE_RE.test('leads-ab12cd34.json'))
})

test('端末の上限は20台', () => {
  assert.equal(MAX_DEVICES, 20)
})

test('登録の早い MAX_DEVICES 台だけが有効。同時刻なら端末ID順で、全端末で同じ結果になる', () => {
  const files = Array.from({ length: MAX_DEVICES + 1 }, (_, i) => nth(i))
  assert.ok(isWithinLimit(files, files[MAX_DEVICES - 1].deviceId))
  assert.ok(!isWithinLimit(files, files[MAX_DEVICES].deviceId))
  // 最後の枠に2台が同時に登録
  const tie = [...files.slice(0, MAX_DEVICES - 1), reg('zzzzzzzz', '2026-10-07T23:00:00Z'), reg('aaaaaaaa', '2026-10-07T23:00:00Z')]
  assert.ok(isWithinLimit(tie, 'aaaaaaaa'))
  assert.ok(!isWithinLimit(tie, 'zzzzzzzz'))
  assert.equal(sortRegistrations(tie)[MAX_DEVICES - 1].deviceId, 'aaaaaaaa')
})

test('同じ端末の登録ファイルが2つあっても、1台として数える', () => {
  const files = [
    ...Array.from({ length: MAX_DEVICES - 1 }, (_, i) => nth(i)),
    reg(nth(0).deviceId, '2026-10-07T22:00:00Z'),
    reg('newdev00', '2026-10-07T23:00:00Z'),
  ]
  assert.ok(isWithinLimit(files, 'newdev00'))
})
