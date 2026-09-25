import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractFields, findAddress, findEmail, findPhone, normalizeLine } from './extract.ts'

const lines = (texts: [string, number][]) => texts.map(([text, height]) => ({ text, height }))

test('OCR が入れた日本語の間の空白を消し、全角英数字を半角にする', () => {
  assert.equal(normalizeLine('株 式 会 社 サ ン プ ル'), '株式会社サンプル')
  assert.equal(normalizeLine('ＴＥＬ ０３－１２３４－５６７８'), 'TEL 03-1234-5678')
  assert.equal(normalizeLine('Sample Co., Ltd.'), 'Sample Co., Ltd.')
})

test('メールアドレスは、@ の前後の空白や見出しを除いて取り出す', () => {
  assert.equal(findEmail(['E-mail: taro.yamada @ example.co.jp']), 'taro.yamada@example.co.jp')
  assert.equal(findEmail(['mail:Info@Example.COM']), 'info@example.com')
  assert.equal(findEmail(['メールなし']), '')
})

test('電話番号は TEL を優先し、FAX は選ばない', () => {
  assert.equal(findPhone(['TEL 03-1234-5678 FAX 03-1234-5679']), '03-1234-5678')
  assert.equal(findPhone(['FAX 045(123)4567', 'Mobile 090-1234-5678']), '090-1234-5678')
  assert.equal(findPhone(['T 06-6123-4567 F 06-6123-4568']), '06-6123-4567')
  assert.equal(findPhone(['+81-3-1234-5678']), '03-1234-5678')
  assert.equal(findPhone(['〒100-0005']), '')
})

test('住所から都道府県と市区町村を取り出す', () => {
  assert.deepEqual(findAddress(['〒220-0012 神奈川県横浜市西区みなとみらい2-2-1']), { prefecture: '神奈川県', city: '横浜市' })
  assert.deepEqual(findAddress(['東京都千代田区丸の内1-1-1']), { prefecture: '東京都', city: '千代田区' })
  assert.deepEqual(findAddress(['三重県四日市市諏訪町1-5']), { prefecture: '三重県', city: '四日市市' })
  assert.deepEqual(findAddress(['東京都西多摩郡瑞穂町箱根ケ崎2335']), { prefecture: '東京都', city: '西多摩郡瑞穂町' })
  assert.deepEqual(findAddress(['〒460-0008 名古屋市中区栄3-1-1']), { prefecture: '', city: '名古屋市' })
})

test('日本語の名刺から各項目を取り出す', () => {
  const result = extractFields(
    lines([
      ['株 式 会 社 サ ン プ ル 工 業', 30],
      ['営業本部 第一営業部 課長', 22],
      ['山田 太郎', 60],
      ['〒 530-0001 大阪府大阪市北区梅田1-1-1', 18],
      ['TEL 06-1234-5678 FAX 06-1234-5679', 18],
      ['E-mail taro.yamada@sample.co.jp', 18],
    ]),
  )
  assert.deepEqual(result, {
    name: '山田 太郎',
    company: '株式会社サンプル工業',
    department: '営業本部 第一営業部',
    title: '課長',
    prefecture: '大阪府',
    city: '大阪市',
    phone: '06-1234-5678',
    email: 'taro.yamada@sample.co.jp',
  })
})

test('英語の名刺から各項目を取り出す', () => {
  const result = extractFields(
    lines([
      ['Evatec AG', 28],
      ['John Smith', 44],
      ['Sales Manager', 20],
      ['Phone +81-3-5555-1234', 16],
      ['john.smith@evatecnet.com', 16],
    ]),
  )
  assert.equal(result.company, 'Evatec AG')
  assert.equal(result.name, 'John Smith')
  assert.equal(result.title, 'Manager')
  assert.equal(result.phone, '03-5555-1234')
  assert.equal(result.email, 'john.smith@evatecnet.com')
})

test('OCR がよく間違えるメールアドレスの形を直す', () => {
  assert.equal(findEmail(['E-mail taro.yamada@sample-kogyo.cojp']), 'taro.yamada@sample-kogyo.co.jp')
  assert.equal(findEmail(['john.smith@evatecnet com・www.evatecnet com']), 'john.smith@evatecnet.com')
  assert.equal(findEmail(['info＠example.co.jp']), 'info@example.co.jp')
  assert.equal(findEmail(['naoki@nakamura-techcom']), 'naoki@nakamura-tech.com')
  assert.equal(findEmail(['sales@abc.co.jp']), 'sales@abc.co.jp')
})

test('氏名の後ろにローマ字が続く行、前後のごみ、空白の入った役職', () => {
  const r = extractFields(
    lines([
      ['NAKAMURA TECH 株 式 会 社 の 》', 24],
      ['代表 取締 役 社長', 22],
      ['中 村 直樹 Naoki Nakamura', 20],
      ['TEL 045-222-3333 / naoki@nakamura-tech.com', 17],
    ]),
  )
  assert.equal(r.name, '中村直樹') // OCR が1文字ずつ区切った空白は詰める
  assert.equal(r.company, 'NAKAMURA TECH 株式会社')
  assert.equal(r.title, '代表取締役社長')

  const r2 = extractFields(
    lines([
      ['日 本 マテ リア ル 株 式 会 社', 21],
      ['課長 代理', 20],
      ['ーー', 20],
      ['| [| 品', 20],
      ['TEL 052-123-4567', 24],
    ]),
  )
  // 「課長 代理」は役職。OCR のごみ（「品」など）は名前にしない
  assert.equal(r2.title, '課長代理')
  assert.equal(r2.name, '')

  const r3 = extractFields(lines([['ーー John Smith', 40], ['_ Evatec AG', 30], ['Sales Manager', 20]]))
  assert.equal(r3.name, 'John Smith')
  assert.equal(r3.company, 'Evatec AG')
})

test('よくある姓で始まる行を、名前として優先する', () => {
  const r = extractFields(
    lines([
      ['株式会社サンプル', 30],
      ['技術 開発', 40], // 大きいが名前ではない
      ['佐藤 花子', 34],
    ]),
  )
  assert.equal(r.name, '佐藤 花子')
})
