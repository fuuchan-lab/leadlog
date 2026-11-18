import assert from 'node:assert/strict'
import { test } from 'node:test'
import { translate } from './i18n/context.ts'
import { buildShareMail, buildVCard, mailtoUrl, shareFileBase } from './share.ts'
import { EMPTY_FIELDS, type Lead } from './types.ts'

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('ja', key, vars)
const author = { deviceId: 'd', member: '田中', device: 'Android' }
const lead: Lead = {
  ...EMPTY_FIELDS,
  id: '1',
  name: '山田 太郎',
  company: '株式会社サンプル',
  department: '営業部',
  title: '部長',
  prefecture: '東京都',
  city: '港区',
  phone: '03-1234-5678',
  email: 'taro@example.com',
  importance: 'a',
  note: '予算あり（社内メモ）',
  photoId: null,
  ocrText: '',
  exhibitionId: 'e',
  exhibition: 'SEMICON',
  createdAt: 0,
  createdBy: author,
  updatedAt: 0,
  updatedBy: author,
  synced: true,
}

test('件名と本文に名刺の内容を入れ、社内のメモは入れない', () => {
  const mail = buildShareMail(lead, t, '11/18 10:00')
  assert.equal(mail.subject, '名刺の共有: 山田 太郎 / 株式会社サンプル')
  assert.match(mail.body, /氏名: 山田 太郎/)
  assert.match(mail.body, /所在地: 東京都港区/)
  assert.match(mail.body, /来場日時: 11\/18 10:00/)
  assert.doesNotMatch(mail.body, /社内メモ/)
  // 空の項目は出さない
  assert.doesNotMatch(buildShareMail({ ...lead, title: '' }, t, '').body, /役職/)
})

test('vCard は日本語の氏名を姓・名に分け、特別な文字を逃がす', () => {
  const v = buildVCard({ ...lead, company: 'A, Inc.' }, '展示会: SEMICON')
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
  assert.match(v, /\r\nN:山田;太郎;;;\r\n/)
  assert.match(v, /\r\nORG:A\\, Inc\.;営業部\r\n/)
  assert.match(v, /\r\nADR;TYPE=WORK:;;;港区;東京都;;\r\n/)
  assert.match(v, /\r\nEND:VCARD\r\n$/)
  assert.match(buildVCard({ ...lead, name: 'John Smith' }), /\r\nN:Smith;John;;;\r\n/)
})

test('添付ファイルの名前に使えない文字は置き換える', () => {
  assert.equal(shareFileBase({ name: '山田 太郎', company: '' }, t), '名刺_山田_太郎')
  assert.equal(shareFileBase({ name: '', company: 'A/B' }, t), '名刺_A_B')
  assert.equal(shareFileBase({ name: '', company: '' }, t), '名刺')
})

test('メールの下書きのリンク', () => {
  assert.equal(mailtoUrl({ subject: 'a b', body: '1\n2' }), 'mailto:?subject=a%20b&body=1%0D%0A2')
})
