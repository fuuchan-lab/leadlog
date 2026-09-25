/** 画像ファイルとキャンバスのやり取り（ブラウザ機能を使う部分）。計算そのものは document.ts */
import {
  defaultQuad,
  detectDocument,
  enhanceDocument,
  outputSize,
  rotate90,
  scaleQuad,
  warpQuad,
  type Quad,
  type RGBAImage,
} from './document.ts'

/** 読み込む写真の長辺の上限。スマホの写真（4000px 以上）をそのまま扱うと重いため */
const LOAD_MAX_SIDE = 2400
/** 四隅を探す時の長辺。小さくして速くする */
const DETECT_MAX_SIDE = 360

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return c
}

function readPixels(source: CanvasImageSource, width: number, height: number): RGBAImage {
  const c = newCanvas(width, height)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { data, width, height }
}

/** 写真を読み込む（撮影した向きに合わせて回し、大きすぎれば縮める） */
export async function loadPhoto(file: Blob): Promise<RGBAImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, LOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const img = readPixels(bitmap, Math.round(bitmap.width * s), Math.round(bitmap.height * s))
  bitmap.close()
  return img
}

export function toCanvas(img: RGBAImage): HTMLCanvasElement {
  const c = newCanvas(img.width, img.height)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
  return c
}

/** 名刺・バッジの四隅を探す（写真の座標）。見つからなければ、写真の端から少し内側の四角 */
export function findDocument(img: RGBAImage): { quad: Quad; found: boolean } {
  const s = Math.min(1, DETECT_MAX_SIDE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * s))
  const h = Math.max(1, Math.round(img.height * s))
  const small = s < 1 ? readPixels(toCanvas(img), w, h) : img
  const quad = detectDocument(small)
  return quad ? { quad: scaleQuad(quad, 1 / s), found: true } : { quad: defaultQuad(img.width, img.height), found: false }
}

/** 四隅の範囲を長方形に直し、書類のように整え、向きを直す */
export function makeDocument(img: RGBAImage, quad: Quad, rotation: number): RGBAImage {
  const { width, height } = outputSize(quad)
  return rotate90(enhanceDocument(warpQuad(img, quad, width, height)), rotation)
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image-encode-failed'))), 'image/jpeg', quality)
  })
}
