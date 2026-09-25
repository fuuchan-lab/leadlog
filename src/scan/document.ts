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
 * 写真の中の名刺・バッジの四隅を探す（小さく縮めた画像で使う）。見つからなければ null。
 *
 * 名刺と背景の見分け方を2通り試し、いちばん「四角らしい」ものを選ぶ:
 * - 明るさ（白い名刺と暗い机など）
 * - 背景の色との違い（写真の外周の色を背景とみなす。明るさが近くても色が違えば分かれる）
 * どちらも、中央に最も近いかたまりを名刺とみなし、名刺の文字などでできた穴は埋め、
 * かたまりの外形（凸包）に最もよく合う四角形を四隅とする（斜めに置いた名刺にも合う）。
 */
export function detectDocument(img: RGBAImage): Quad | null {
  const { width, height } = img
  const gray = toGray(img)
  const masks: Uint8Array[] = []

  // 1. 明るさで分ける。中央付近で多い方（明るい・暗い）を名刺の側とする
  const t = otsuThreshold(gray)
  const brightMask = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i++) brightMask[i] = gray[i] > t ? 1 : 0
  masks.push(centerMajority(brightMask, width, height) ? brightMask : invert(brightMask))

  // 2. 背景（外周）の色との違いで分ける
  const bg = borderMeanColor(img)
  const dist = new Uint8Array(gray.length)
  for (let i = 0, p = 0; i < dist.length; i++, p += 4) {
    const d = Math.hypot(img.data[p] - bg[0], img.data[p + 1] - bg[1], img.data[p + 2] - bg[2])
    dist[i] = Math.min(255, Math.round(d))
  }
  const td = Math.max(20, otsuThreshold(dist))
  const colorMask = new Uint8Array(gray.length)
  for (let i = 0; i < dist.length; i++) colorMask[i] = dist[i] > td ? 1 : 0
  masks.push(colorMask)

  let best: { quad: Quad; score: number } | null = null
  for (const raw of masks) {
    // 名刺の縁まである文字などの小さなすき間を埋めてから（閉じる）、
    // 細いつながり（名刺と背景の境目のかすれ・影）を切り、小さな点を消す（開く）
    const closed = erode(dilate(raw, width, height, 2), width, height, 2)
    const mask = dilate(erode(closed, width, height, 2), width, height, 2)
    const found = shapeNearCenter(mask, width, height)
    if (!found) continue
    const ratio = found.area / (width * height)
    if (ratio < 0.08 || ratio > 0.95) continue
    const quad = quadFromHull(found.hull)
    if (!quad) continue
    const qa = quadArea(quad)
    if (qa < width * height * 0.05) continue
    // かたまりの面積と四角形の面積が近いほど「四角らしい」
    const rect = Math.min(found.area, qa) / Math.max(found.area, qa)
    if (rect < 0.85) continue
    const score = rect + ratio * 0.2
    if (!best || score > best.score) best = { quad, score }
  }
  return best?.quad ?? null
}

/** 以前の呼び方（グレーの画像だけで探す）。明るさだけで判定する */
export function detectQuad(gray: Uint8Array, width: number, height: number): Quad | null {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < gray.length; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray[i]
    data[i * 4 + 3] = 255
  }
  return detectDocument({ data, width, height })
}

function invert(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1
  return out
}

/** 中央付近（縦横 40〜60%）で、印の付いた画素が半分以上か */
function centerMajority(mask: Uint8Array, width: number, height: number): boolean {
  let on = 0
  let count = 0
  for (let y = Math.floor(height * 0.4); y < Math.ceil(height * 0.6); y++) {
    for (let x = Math.floor(width * 0.4); x < Math.ceil(width * 0.6); x++) {
      on += mask[y * width + x]
      count++
    }
  }
  return on * 2 >= count
}

/** 写真の外周（幅の 3%）の平均の色。背景の色とみなす */
function borderMeanColor({ data, width, height }: RGBAImage): [number, number, number] {
  const m = Math.max(1, Math.round(Math.min(width, height) * 0.03))
  const sum = [0, 0, 0]
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= m && x < width - m && y >= m && y < height - m) continue
      const p = (y * width + x) * 4
      sum[0] += data[p]
      sum[1] += data[p + 1]
      sum[2] += data[p + 2]
      n++
    }
  }
  return [sum[0] / n, sum[1] / n, sum[2] / n]
}

/** 縮める（周り r 画素がすべて印付きの画素だけ残す） */
function erode(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return morph(mask, width, height, r, 0)
}

/** 太らせる（周り r 画素のどれかが印付きなら印を付ける） */
function dilate(mask: Uint8Array, width: number, height: number, r: number): Uint8Array {
  return morph(mask, width, height, r, 1)
}

/** 横・縦の2回に分けて、四角い範囲の最小（keep=0）・最大（keep=1）を取る */
function morph(mask: Uint8Array, width: number, height: number, r: number, keep: 0 | 1): Uint8Array {
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let v = keep === 1 ? 0 : 1
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x
          const yy = horizontal ? y : y + k
          // 画像の外は、縮める時は印付き（外周に接した名刺を削らない）、太らせる時は印なしとみなす
          const s = xx < 0 || yy < 0 || xx >= width || yy >= height ? 1 - keep : src[yy * width + xx]
          if (s === keep) {
            v = keep
            break
          }
        }
        out[y * width + x] = v
      }
    }
    return out
  }
  return pass(pass(mask, true), false)
}

/**
 * 中央に最も近い、印付きの画素のかたまりを集め、中の穴を埋めた面積と、外形の点（各行の左端・右端）の凸包を返す
 */
function shapeNearCenter(mask: Uint8Array, width: number, height: number): { area: number; hull: Point[] } | null {
  const start = findNearestToCenter(width, height, (i) => mask[i] === 1)
  if (start < 0) return null
  const inShape = new Uint8Array(mask.length)
  const stack = [start]
  inShape[start] = 1
  while (stack.length > 0) {
    const i = stack.pop()!
    const x = i % width
    const y = (i - x) / width
    const visit = (j: number) => {
      if (inShape[j] || !mask[j]) return
      inShape[j] = 1
      stack.push(j)
    }
    if (x > 0) visit(i - 1)
    if (x < width - 1) visit(i + 1)
    if (y > 0) visit(i - width)
    if (y < height - 1) visit(i + width)
  }
  // 穴を埋める: 外周からたどれる「かたまりの外」以外は、すべてかたまりとみなす
  const outside = new Uint8Array(mask.length)
  const queue: number[] = []
  const seed = (i: number) => {
    if (!outside[i] && !inShape[i]) {
      outside[i] = 1
      queue.push(i)
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }
  while (queue.length > 0) {
    const i = queue.pop()!
    const x = i % width
    const y = (i - x) / width
    if (x > 0) seed(i - 1)
    if (x < width - 1) seed(i + 1)
    if (y > 0) seed(i - width)
    if (y < height - 1) seed(i + width)
  }
  let area = 0
  const points: Point[] = []
  for (let y = 0; y < height; y++) {
    let left = -1
    let right = -1
    for (let x = 0; x < width; x++) {
      if (outside[y * width + x]) continue
      area++
      if (left < 0) left = x
      right = x
    }
    if (left >= 0) points.push({ x: left, y }, { x: right, y })
  }
  return area > 0 ? { area, hull: convexHull(points) } : null
}

/** 凸包（Andrew の方法）。反時計回り（画像の座標では時計回りに見える）の順 */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * 凸包に合う四角形。最も離れた2点（長方形なら対角）と、その線から両側に最も離れた点を四隅とし、
 * 左上・右上・右下・左下の順に並べる
 */
export function quadFromHull(hull: Point[]): Quad | null {
  if (hull.length < 4) return null
  let a = 0
  let b = 1
  let bestD = -1
  for (let i = 0; i < hull.length; i++) {
    for (let j = i + 1; j < hull.length; j++) {
      const d = (hull[i].x - hull[j].x) ** 2 + (hull[i].y - hull[j].y) ** 2
      if (d > bestD) {
        bestD = d
        a = i
        b = j
      }
    }
  }
  const pa = hull[a]
  const pb = hull[b]
  const side = (p: Point) => (pb.x - pa.x) * (p.y - pa.y) - (pb.y - pa.y) * (p.x - pa.x)
  let c: Point | null = null
  let d: Point | null = null
  for (const p of hull) {
    const s = side(p)
    if (s > 0 && (!c || s > side(c))) c = p
    if (s < 0 && (!d || s < side(d))) d = p
  }
  if (!c || !d) return null
  return orderQuad([pa, c, pb, d])
}

/** 凸な四角形の4点（周の順）を、左上から時計回り（画像の座標）に並べ直す */
function orderQuad(pts: Point[]): Quad {
  // 画像の座標（y が下向き）で時計回りにする
  let s = 0
  for (let i = 0; i < 4; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % 4]
    s += p.x * q.y - q.x * p.y
  }
  const cw = s > 0 ? pts : [...pts].reverse()
  let start = 0
  for (let i = 1; i < 4; i++) if (cw[i].x + cw[i].y < cw[start].x + cw[start].y) start = i
  return [0, 1, 2, 3].map((k) => cw[(start + k) % 4]) as Quad
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
