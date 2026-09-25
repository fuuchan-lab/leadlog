/**
 * 名刺・バッジの写真を、スキャンした書類のような画像に整える処理。ブラウザ機能に依存しない（テストできる）。
 *
 * 1. detectQuad: 写真の中の、名刺やバッジの四隅を探す（見つからなければ null。画面で四隅を手で直せる）
 * 2. warpQuad: 四隅を長方形に引き伸ばして、斜めから撮った歪みを直す（射影変換）
 * 3. enhanceDocument: 照明のムラを消し、背景を白く、文字を濃くして、読み取りやすくする
 */

export interface Point {
  x: number
  y: number
}

/** 左上・右上・右下・左下 の順 */
export type Quad = [Point, Point, Point, Point]

export interface RGBAImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export function toGray({ data, width, height }: RGBAImage): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
  }
  return gray
}

/** 大津の方法で、明るい部分と暗い部分を分けるしきい値を求める */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0)
  for (const v of gray) hist[v]++
  const total = gray.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/**
 * 写真の中央にある名刺・バッジの四隅を探す。
 * 名刺は背景と明るさが違うことが多いので、明るい部分と暗い部分に分け、中央を含むかたまりを名刺とみなす。
 * かたまりが小さすぎる・画面いっぱい（背景と区別できない）場合は null。
 */
export function detectQuad(gray: Uint8Array, width: number, height: number): Quad | null {
  const t = otsuThreshold(gray)
  // 中央付近で多い方（明るい・暗い）を、名刺の色とする
  let bright = 0
  let count = 0
  const cx0 = Math.floor(width * 0.4)
  const cx1 = Math.ceil(width * 0.6)
  const cy0 = Math.floor(height * 0.4)
  const cy1 = Math.ceil(height * 0.6)
  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      if (gray[y * width + x] > t) bright++
      count++
    }
  }
  const cardIsBright = bright * 2 >= count
  const inCard = (i: number) => (gray[i] > t) === cardIsBright

  // 中央に最も近い「名刺の色」の画素から、つながっている部分を塗りつぶして集める
  const start = findNearestToCenter(width, height, inCard)
  if (start < 0) return null
  const visited = new Uint8Array(width * height)
  const stack = [start]
  visited[start] = 1
  let area = 0
  let tl = { v: Infinity, i: start }
  let br = { v: -Infinity, i: start }
  let tr = { v: -Infinity, i: start }
  let bl = { v: -Infinity, i: start }
  while (stack.length > 0) {
    const i = stack.pop()!
    area++
    const x = i % width
    const y = (i - x) / width
    if (x + y < tl.v) tl = { v: x + y, i }
    if (x + y > br.v) br = { v: x + y, i }
    if (x - y > tr.v) tr = { v: x - y, i }
    if (y - x > bl.v) bl = { v: y - x, i }
    const visit = (j: number) => {
      if (visited[j] || !inCard(j)) return
      visited[j] = 1
      stack.push(j)
    }
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (y > 0) visit(i - width)
    if (y < height - 1) visit(i + width)
  }
  const ratio = area / (width * height)
  if (ratio < 0.08 || ratio > 0.97) return null
  const pt = (i: number): Point => ({ x: i % width, y: Math.floor(i / width) })
  const quad: Quad = [pt(tl.i), pt(tr.i), pt(br.i), pt(bl.i)]
  // 四隅がつぶれている（細長すぎる・面積がほとんどない）場合は、見つからなかったことにする
  if (quadArea(quad) < width * height * 0.05) return null
  return quad
}

function findNearestToCenter(width: number, height: number, inCard: (i: number) => boolean): number {
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const maxR = Math.floor(Math.min(width, height) / 4)
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= width || y >= height) continue
        const i = y * width + x
        if (inCard(i)) return i
      }
    }
  }
  return -1
}

export function quadArea(q: Quad): number {
  let s = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

/** 見つからなかった時の四隅（写真の端から少し内側） */
export function defaultQuad(width: number, height: number, inset = 0.06): Quad {
  const dx = width * inset
  const dy = height * inset
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ]
}

export function scaleQuad(q: Quad, s: number): Quad {
  return q.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** 補正後の画像の大きさ。四辺の長さから決め、長辺は maxSide 以内にする */
export function outputSize(q: Quad, maxSide = 1600): { width: number; height: number } {
  const w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]))
  const h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]))
  const s = Math.min(1, maxSide / Math.max(w, h, 1))
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) }
}

/** 8元連立方程式をガウスの消去法で解く */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    ;[m[c], m[pivot]] = [m[pivot], m[c]]
    const d = m[c][c] || 1e-12
    for (let k = c; k <= n; k++) m[c][k] /= d
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r][c]
      if (f === 0) continue
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((row) => row[n])
}

/** from の4点を to の4点に移す射影変換の係数（h33 = 1） */
export function homography(from: Quad, to: Quad): number[] {
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  return [...solve(a, b), 1]
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w }
}

/** 元の画像の四隅 quad の部分を、width × height の長方形に引き伸ばす（双線形補間） */
export function warpQuad(src: RGBAImage, quad: Quad, width: number, height: number): RGBAImage {
  const rect: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  // 出力の各画素が、元の画像のどこに当たるか（出力 → 元 の変換）
  const h = homography(rect, quad)
  const out = new Uint8ClampedArray(width * height * 4)
  const sw = src.width
  const sh = src.height
  const sd = src.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = h[6] * x + h[7] * y + h[8]
      let sx = (h[0] * x + h[1] * y + h[2]) / w
      let sy = (h[3] * x + h[4] * y + h[5]) / w
      sx = Math.min(sw - 1.001, Math.max(0, sx))
      sy = Math.min(sh - 1.001, Math.max(0, sy))
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const fx = sx - x0
      const fy = sy - y0
      const p00 = (y0 * sw + x0) * 4
      const p10 = p00 + 4
      const p01 = p00 + sw * 4
      const p11 = p01 + 4
      const o = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const top = sd[p00 + c] * (1 - fx) + sd[p10 + c] * fx
        const bottom = sd[p01 + c] * (1 - fx) + sd[p11 + c] * fx
        out[o + c] = top * (1 - fy) + bottom * fy
      }
      out[o + 3] = 255
    }
  }
  return { data: out, width, height }
}

/** 各画素の周り (2r+1)×(2r+1) の平均。積分画像で計算する */
export function boxBlur(gray: Uint8Array, width: number, height: number, r: number): Float32Array {
  const iw = width + 1
  const integral = new Float64Array(iw * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + row
    }
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height, y + r + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width, x + r + 1)
      const s = integral[y1 * iw + x1] - integral[y0 * iw + x1] - integral[y1 * iw + x0] + integral[y0 * iw + x0]
      out[y * width + x] = s / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

/**
 * 書類のように整える。照明のムラ（影・反射）を、周りの明るさで割って消し、
 * 背景をほぼ白、文字をはっきり黒くなるようにコントラストを広げる。白黒（グレー）の画像になる。
 */
export function enhanceDocument(img: RGBAImage): RGBAImage {
  const { width, height } = img
  const gray = toGray(img)
  // 文字より十分大きい範囲の明るさを「背景の明るさ」とみなす
  const r = Math.max(8, Math.round(Math.max(width, height) / 20))
  const bg = boxBlur(gray, width, height, r)
  const norm = new Uint8Array(width * height)
  for (let i = 0; i < norm.length; i++) {
    norm[i] = Math.min(255, Math.round((gray[i] / Math.max(1, bg[i])) * 235))
  }
  // 暗い側 2% を黒に、背景の明るさ（書類は大半が背景なので、全体の真ん中の明るさ）より明るい部分を白にそろえる
  const hist = new Array<number>(256).fill(0)
  for (const v of norm) hist[v]++
  const lo = percentile(hist, norm.length * 0.02)
  const hi = Math.max(lo + 1, percentile(hist, norm.length * 0.5) - 4)
  const out = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, p = 0; i < norm.length; i++, p += 4) {
    const t = Math.min(1, Math.max(0, (norm[i] - lo) / (hi - lo)))
    // 少しだけ濃くして、かすれた文字を読みやすくする
    const v = Math.round(255 * Math.pow(t, 1.4))
    out[p] = out[p + 1] = out[p + 2] = v
    out[p + 3] = 255
  }
  return { data: out, width, height }
}

function percentile(hist: number[], target: number): number {
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= target) return v
  }
  return 255
}

/** 90度単位で右に回す（縦書きの名刺や、横向きに撮った写真のため） */
export function rotate90(img: RGBAImage, times: number): RGBAImage {
  const n = ((times % 4) + 4) % 4
  if (n === 0) return img
  let cur = img
  for (let k = 0; k < n; k++) {
    const { data, width, height } = cur
    const out = new Uint8ClampedArray(data.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = (y * width + x) * 4
        const nx = height - 1 - y
        const ny = x
        const d = (ny * height + nx) * 4
        out[d] = data[s]
        out[d + 1] = data[s + 1]
        out[d + 2] = data[s + 2]
        out[d + 3] = data[s + 3]
      }
    }
    cur = { data: out, width: height, height: width }
  }
  return cur
}
