/** 展示会ロゴの画像（ブラウザ機能を使う） */

/** 保存するロゴの大きさの上限。ダッシュボードと Excel では、さらに小さく表示する */
const MAX_WIDTH = 480
const MAX_HEIGHT = 240

export interface LogoImage {
  blob: Blob
  width: number
  height: number
}

/**
 * アルバムから選んだロゴを縮小して JPEG にする。透明な部分は白にする
 * （Excel やダッシュボードの白い枠の中に置くので、白で目立たない）
 */
export async function shrinkLogo(file: Blob): Promise<LogoImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const s = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height)
  const width = Math.max(1, Math.round(bitmap.width * s))
  const height = Math.max(1, Math.round(bitmap.height * s))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image-encode-failed'))), 'image/jpeg', 0.92),
  )
  return { blob, width, height }
}

/** 画像の大きさ（ピクセル） */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const size = { width: bitmap.width, height: bitmap.height }
  bitmap.close()
  return size
}

/** 縦横比を保ったまま、高さ maxHeight・幅 maxWidth に収まる大きさ */
export function fitSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const s = Math.min(maxWidth / width, maxHeight / height)
  return { width: Math.round(width * s), height: Math.round(height * s) }
}
