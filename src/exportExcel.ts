import writeExcelFile from 'write-excel-file/universal'
import { findDuplicates } from './duplicates.ts'
import { ensureFolder, uploadFile } from './drive.ts'
import { exportFileName, hourlySheet, leadsSheet } from './excelData.ts'
import { loadLeadPhoto } from './photos.ts'
import { fitSize, imageSize } from './scan/logo.ts'
import type { Lang, TFn } from './i18n/context.ts'
import type { Exhibition } from './exhibitions.ts'
import type { SharedSettings } from './settings.ts'
import type { Lead } from './types.ts'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** リードの一覧を Excel ブック (.xlsx) にする。「リード」（以前の集約表と同じ形）と「時間帯別」の2シート */
export async function buildWorkbook(
  leads: Lead[],
  settings: SharedSettings,
  ex: Exhibition | null,
  t: TFn,
  lang: Lang,
): Promise<Blob> {
  const duplicates = new Set(findDuplicates(leads).keys())
  const list = leadsSheet(leads, settings, ex, t, lang, duplicates)
  // 時間帯別のシートは、1つの展示会を書き出す時だけ
  const hourly = ex ? hourlySheet(leads, ex, t) : null
  // 展示会ロゴを、1行目（展示会名の行）の右上に小さく置く
  const logo = ex?.logoId ? await loadLeadPhoto(ex.logoId) : null
  const images = []
  if (logo && list.logoColumn) {
    const size = await imageSize(logo)
    const { width, height } = fitSize(size.width, size.height, 220, 46)
    images.push({
      content: logo,
      contentType: logo.type || 'image/jpeg',
      width,
      height,
      dpi: 96,
      anchor: { row: 1, column: list.logoColumn },
      offsetX: 4,
      offsetY: 2,
      title: ex?.name ?? '',
    })
  }
  return writeExcelFile([
    // 見出しと、No.・会社名・氏名の列を固定する
    {
      data: list.data,
      sheet: t('xlsx.sheetLeads'),
      columns: list.columns,
      stickyRowsCount: list.headerRows,
      stickyColumnsCount: 3,
      ...(images.length > 0 ? { images } : {}),
    },
    ...(hourly ? [{ data: hourly.data, sheet: t('xlsx.sheetHourly'), columns: hourly.columns, stickyRowsCount: hourly.headerRows }] : []),
  ]).toBlob()
}

export interface ExportResult {
  name: string
  /** Google ドライブに保存した場合のファイルID（開くリンクに使う） */
  id?: string
}

/** Google ドライブの LeadLog フォルダーに保存する。書き出すたびに、時刻入りの名前の新しいファイルを作る */
export async function exportToDrive(
  leads: Lead[],
  settings: SharedSettings,
  ex: Exhibition | null,
  t: TFn,
  lang: Lang,
): Promise<ExportResult> {
  const blob = await buildWorkbook(leads, settings, ex, t, lang)
  const folderId = await ensureFolder()
  const name = exportFileName(ex?.name ?? '', new Date())
  const { id } = await uploadFile({ name, mimeType: XLSX_MIME, blob, parentId: folderId })
  return { name, id }
}

/** この端末にダウンロードする（ログインしていない時・オフラインの時にも使える） */
export async function exportToDevice(
  leads: Lead[],
  settings: SharedSettings,
  ex: Exhibition | null,
  t: TFn,
  lang: Lang,
): Promise<ExportResult> {
  const blob = await buildWorkbook(leads, settings, ex, t, lang)
  const name = exportFileName(ex?.name ?? '', new Date())
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { name }
}
