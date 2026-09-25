/**
 * 文字の読み取り（OCR）。tesseract.js（端末の中で動く OCR）を使い、日本語と英語を読む。
 * 初回だけ、読み取り用のデータ（数十MB）をダウンロードする。以降はブラウザに保存されたものを使うので、
 * 展示会場の回線が弱くても読み取れる（設定の「OCRの準備」で、事前にダウンロードしておける）。
 */
import type { Worker } from 'tesseract.js'
import type { OcrLine } from './extract.ts'

export interface OcrProgress {
  /** 'loading' はデータの準備中、'recognizing' は読み取り中 */
  phase: 'loading' | 'recognizing'
  /** 0〜1 */
  progress: number
}

type Listener = (p: OcrProgress) => void

let workerPromise: Promise<Worker> | null = null
let listener: Listener | null = null
let ready = false

function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    // 大きいライブラリなので、使う時だけ読み込む
    const { createWorker, PSM } = await import('tesseract.js')
    const worker = await createWorker(['jpn', 'eng'], 1, {
      logger: (m) => {
        const phase = m.status === 'recognizing text' ? 'recognizing' : 'loading'
        listener?.({ phase, progress: typeof m.progress === 'number' ? m.progress : 0 })
      },
    })
    // 文字の大きさがまちまちな1段の文章として読む（PSM 4）。名刺では、自動（PSM 3）より
    // 大きな氏名や会社名を読み落としにくい（合成した名刺30枚で、氏名 16/30 → 29/30）
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
    ready = true
    return worker
  })().catch((e: unknown) => {
    workerPromise = null // 通信の失敗などの後に、もう一度試せるようにする
    throw e
  })
  return workerPromise
}

export const isOcrReady = () => ready

/** 読み取り用のデータを先にダウンロードしておく */
export async function prepareOcr(onProgress?: Listener): Promise<void> {
  listener = onProgress ?? null
  try {
    await getWorker()
  } finally {
    listener = null
  }
}

export interface OcrResult {
  text: string
  lines: OcrLine[]
}

export async function recognize(image: HTMLCanvasElement, onProgress?: Listener): Promise<OcrResult> {
  listener = onProgress ?? null
  try {
    const worker = await getWorker()
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
    const lines: OcrLine[] = []
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.replace(/\n/g, ' ').trim()
          if (text) lines.push({ text, height: line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0 })
        }
      }
    }
    return { text: data.text.trim(), lines }
  } finally {
    listener = null
  }
}
