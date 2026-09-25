import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyHomography,
  detectQuad,
  enhanceDocument,
  homography,
  outputSize,
  rotate90,
  warpQuad,
  type Quad,
  type RGBAImage,
} from './document.ts'

/** 暗い背景の中に、明るい平行四辺形（名刺）を置いた画像 */
function syntheticCard(width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height).fill(40)
  for (let y = 20; y < 80; y++) {
    const shift = Math.round((y - 20) * 0.2)
    for (let x = 30 + shift; x < 130 + shift; x++) gray[y * width + x] = 220
  }
  // 名刺の中の文字（暗い点）
  for (let x = 60; x < 90; x++) gray[50 * width + x] = 30
  return gray
}

test('名刺の四隅を見つける', () => {
  const quad = detectQuad(syntheticCard(200, 100), 200, 100)
  assert.ok(quad)
  const [tl, tr, br, bl] = quad
  assert.deepEqual(tl, { x: 30, y: 20 })
  assert.ok(Math.abs(tr.x - 129) <= 1 && tr.y === 20)
  assert.ok(Math.abs(br.x - 141) <= 1 && br.y === 79)
  assert.ok(Math.abs(bl.x - 42) <= 1 && bl.y === 79)
})

test('背景と区別できない（一面同じ明るさ）場合は null', () => {
  assert.equal(detectQuad(new Uint8Array(100 * 100).fill(128), 100, 100), null)
})

test('射影変換は4点を正しく移す', () => {
  const from: Quad = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 50 },
  ]
  const to: Quad = [
    { x: 10, y: 5 },
    { x: 120, y: 12 },
    { x: 110, y: 70 },
    { x: 3, y: 60 },
  ]
  const h = homography(from, to)
  for (let i = 0; i < 4; i++) {
    const p = applyHomography(h, from[i])
    assert.ok(Math.abs(p.x - to[i].x) < 1e-6 && Math.abs(p.y - to[i].y) < 1e-6)
  }
})

test('補正後の大きさは、四辺の長い方に合わせ、長辺を上限以内にする', () => {
  const q: Quad = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 1800 },
    { x: 0, y: 1800 },
  ]
  assert.deepEqual(outputSize(q, 1600), { width: 1600, height: 960 })
})

function solid(width: number, height: number, v: number): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = v
  return { data, width, height }
}

test('台形補正で、四隅の内側の色を取り出す', () => {
  const src = solid(50, 50, 0)
  for (let y = 10; y < 40; y++) for (let x = 10; x < 40; x++) src.data[(y * 50 + x) * 4] = 200
  const q: Quad = [
    { x: 12, y: 12 },
    { x: 37, y: 12 },
    { x: 37, y: 37 },
    { x: 12, y: 37 },
  ]
  const out = warpQuad(src, q, 20, 20)
  assert.equal(out.width, 20)
  for (let i = 0; i < out.data.length; i += 4) assert.equal(out.data[i], 200)
})

test('書類化で、影のある背景は白に、文字は黒になる', () => {
  const w = 80
  const h = 40
  const img = solid(w, h, 0)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 左から右へ暗くなる背景（影）
      const bg = 200 - x
      const text = y >= 18 && y <= 21 && x >= 20 && x <= 60
      const v = text ? bg * 0.3 : bg
      const p = (y * w + x) * 4
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v
    }
  }
  const out = enhanceDocument(img)
  const at = (x: number, y: number) => out.data[(y * w + x) * 4]
  assert.ok(at(5, 5) > 230, 'left background should be white')
  assert.ok(at(75, 35) > 230, 'shadowed background should be white')
  assert.ok(at(40, 19) < 60, 'text should be dark')
})

test('90度回すと、幅と高さが入れ替わる', () => {
  const img = solid(3, 2, 0)
  img.data[0] = 255 // 左上
  const r = rotate90(img, 1)
  assert.equal(r.width, 2)
  assert.equal(r.height, 3)
  // 右に回すと、左上は右上に来る
  assert.equal(r.data[1 * 4], 255)
  assert.equal(rotate90(img, 4), img)
})
