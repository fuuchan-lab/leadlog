import writeExcelFile from 'write-excel-file/universal'
import { findDuplicates } from './duplicates.ts'
import { ensureFolder, ensureSubfolder, uploadFile } from './drive.ts'
import { exportFileName, exportPackageName, hourlySheet, leadsSheet } from './excelData.ts'
import { loadLeadPhoto } from './photos.ts'
import { fitSize, imageSize } from './scan/logo.ts'
import { PACKAGE_DATA_FILE, photoFileName, serializeLeads } from './syncMerge.ts'
import { createZip, type ZipEntry } from './zip.ts'
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
  // 展示会ロゴを、1行目（展示会名の行）の右上に小さく置く。壊れた画像などで失敗しても、書き出し自体は続ける
  const images = []
  try {
    const logo = ex?.logoId ? await loadLeadPhoto(ex.logoId) : null
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
  } catch (e) {
    console.error('[export-logo]', e)
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
  /** Google ドライブに保存した場合の、開くリンクに使う ID */
  id?: string
  /** id が、ファイルではなくフォルダーを指しているか */
  isFolder?: boolean
}

/**
 * Excel と一緒に、あとで「読み込む」で戻せるように、名刺・バッジの画像とデータ（JSON）も集める。
 * 削除・ごみ箱のリードは対象外（leads は既にそれらを除いたもの）
 */
async function collectPackageFiles(leads: Lead[], workbook: Blob, workbookName: string): Promise<ZipEntry[]> {
  const files: ZipEntry[] = [
    { name: workbookName, data: new Uint8Array(await workbook.arrayBuffer()) },
    { name: PACKAGE_DATA_FILE, data: new TextEncoder().encode(serializeLeads(leads)) },
  ]
  for (const l of leads) {
    if (!l.photoId) continue
    const photo = await loadLeadPhoto(l.photoId)
    if (photo) files.push({ name: photoFileName(l.photoId), data: new Uint8Array(await photo.arrayBuffer()) })
  }
  return files
}

/**
 * Google ドライブに保存する。展示会ごとのフォルダーを作り（無ければ）、その中に Excel・名刺画像・
 * データ（JSON）をまとめて置く。書き出すたびに、Excel だけ時刻入りの名前で新しく追加する
 */
export async function exportToDrive(
  leads: Lead[],
  settings: SharedSettings,
  ex: Exhibition | null,
  t: TFn,
  lang: Lang,
): Promise<ExportResult> {
  const workbook = await buildWorkbook(leads, settings, ex, t, lang)
  const now = new Date()
  const workbookName = exportFileName(ex?.name ?? '', now)
  const folderName = exportPackageName(ex?.name ?? '', now)
  const folderId = await ensureFolder()
  const subId = await ensureSubfolder(folderId, folderName)
  const files = await collectPackageFiles(leads, workbook, workbookName)
  for (const f of files) {
    await uploadFile({
      name: f.name,
      mimeType: f.name.endsWith('.json') ? 'application/json' : f.name.endsWith('.jpg') ? 'image/jpeg' : XLSX_MIME,
      blob: new Blob([f.data.slice()]),
      parentId: subId,
    })
  }
  return { name: folderName, id: subId, isFolder: true }
}

/** この端末にダウンロードする（ログインしていない時・オフラインの時にも使える）。ZIP に Excel・名刺画像・データをまとめる */
export async function exportToDevice(
  leads: Lead[],
  settings: SharedSettings,
  ex: Exhibition | null,
  t: TFn,
  lang: Lang,
): Promise<ExportResult> {
  const workbook = await buildWorkbook(leads, settings, ex, t, lang)
  const now = new Date()
  const workbookName = exportFileName(ex?.name ?? '', now)
  const files = await collectPackageFiles(leads, workbook, workbookName)
  const zip = await createZip(files)
  const name = `${exportPackageName(ex?.name ?? '', now)}.zip`
  const url = URL.createObjectURL(zip)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return { name }
}
