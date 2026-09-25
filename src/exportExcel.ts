import writeExcelFile from 'write-excel-file/universal'
import { findDuplicates } from './duplicates.ts'
import { ensureFolder, uploadFile } from './drive.ts'
import { exportFileName, hourlySheet, leadsSheet } from './excelData.ts'
import type { Lang, TFn } from './i18n/context.ts'
import type { SharedSettings } from './settings.ts'
import type { Lead } from './types.ts'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** リードの一覧を Excel ブック (.xlsx) にする。「リード」（以前の集約表と同じ形）と「時間帯別」の2シート */
export async function buildWorkbook(leads: Lead[], settings: SharedSettings, t: TFn, lang: Lang): Promise<Blob> {
  const duplicates = new Set(findDuplicates(leads).keys())
  const list = leadsSheet(leads, settings, t, lang, duplicates)
  const hourly = hourlySheet(leads, settings, t)
  return writeExcelFile([
    // 見出しと、No.・会社名・氏名の列を固定する
    { data: list.data, sheet: t('xlsx.sheetLeads'), columns: list.columns, stickyRowsCount: list.headerRows, stickyColumnsCount: 3 },
    { data: hourly.data, sheet: t('xlsx.sheetHourly'), columns: hourly.columns, stickyRowsCount: hourly.headerRows },
  ]).toBlob()
}

export interface ExportResult {
  name: string
  /** Google ドライブに保存した場合のファイルID（開くリンクに使う） */
  id?: string
}

/** Google ドライブの LeadLog フォルダーに保存する。書き出すたびに、時刻入りの名前の新しいファイルを作る */
export async function exportToDrive(leads: Lead[], settings: SharedSettings, t: TFn, lang: Lang, exhibition: string): Promise<ExportResult> {
  const blob = await buildWorkbook(leads, settings, t, lang)
  const folderId = await ensureFolder()
  const name = exportFileName(exhibition, new Date())
  const { id } = await uploadFile({ name, mimeType: XLSX_MIME, blob, parentId: folderId })
  return { name, id }
}

/** この端末にダウンロードする（ログインしていない時・オフラインの時にも使える） */
export async function exportToDevice(leads: Lead[], settings: SharedSettings, t: TFn, lang: Lang, exhibition: string): Promise<ExportResult> {
  const blob = await buildWorkbook(leads, settings, t, lang)
  const name = exportFileName(exhibition, new Date())
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
