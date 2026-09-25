/**
 * Excel に書き出す表の中身を作る。ライブラリに依存しない部分（テストしやすいよう分けている）。
 *
 * 「リード」シートは、これまで展示会ごとに手作業で集約していた表と同じ形にしている:
 * 1行目に展示会名、黄色の見出し（日本語と英語の2段）、会社・氏名・都道府県・役職・電話・メール・
 * 来場日・時間・受付・優先度（赤）・興味のある分野（0/1、該当は緑）・担当・メモ。
 * その右に、アプリが自動で記録した情報（登録日時・端末・更新・重複・読み取った文字）を灰色で付ける。
 */
import { authorLabel } from './device.ts'
import type { Lang, TFn } from './i18n/context.ts'
import { prefectureInEnglish } from './scan/extract.ts'
import { categoryLabel, visibleCategories, type SharedSettings } from './settings.ts'
import { buildDashboard } from './stats.ts'
import type { Lead } from './types.ts'

interface Cell {
  value: string | number | Date
  format?: string
  fontWeight?: 'bold'
  fontSize?: number
  textColor?: string
  textDecoration?: { underline: true }
  backgroundColor?: string
  align?: 'left' | 'center' | 'right'
  alignVertical?: 'top' | 'center' | 'bottom'
  wrap?: boolean
  columnSpan?: number
  rowSpan?: number
  borderColor?: string
  borderStyle?: 'thin' | 'medium'
  height?: number
}

/** 空のセルは null（結合したセルに覆われる部分も null） */
type Row = (Cell | null)[]

export interface SheetContent {
  data: Row[]
  columns: { width: number }[]
  /** 固定する見出しの行数 */
  headerRows: number
}

// 以前の集約表の配色
const COLOR = {
  title: '#0000FF',
  header: '#FFFF00',
  priorityHeader: '#FF0000',
  interestHeader: '#DCE6F1',
  auditHeader: '#D9D9D9',
  main: '#FFC000',
  contact: '#FCD5B4',
  visit: '#FFF2CC',
  interest: '#DCE6F1',
  interestOn: '#92D050',
  priorityText: '#C00000',
  audit: '#F2F2F2',
  border: '#A6A6A6',
}

const border = { borderColor: COLOR.border, borderStyle: 'thin' as const }

/**
 * 日時のセル。Excel には時刻だけが入り、タイムゾーンの情報がない。ライブラリは Date を UTC として書くので、
 * 端末のローカル時刻（年月日時分）がそのままセルに表示されるよう、UTC の値としてその年月日時分を持つ Date にする。
 */
function asExcelDate(ts: number): Date {
  const d = new Date(ts)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()))
}

const cell = (value: string | number | Date | null | undefined, style: Omit<Cell, 'value'> = {}): Cell | null =>
  value === null || value === undefined || value === '' ? { value: '', ...border, ...style } : { value, ...border, ...style }

/** 見出し（日本語と英語の2段） */
const H = (ja: string, en: string) => `${ja}\n${en}`

export function leadsSheet(
  leads: Lead[],
  settings: SharedSettings,
  t: TFn,
  lang: Lang,
  duplicates: Set<string>,
): SheetContent {
  const interests = visibleCategories(settings.interests)
  // 削除した分野でも、書き出すリードで選ばれていれば列を残す
  for (const c of settings.interests) {
    if (c.deleted && leads.some((l) => (l.interests ?? []).includes(c.id))) interests.push(c)
  }
  const ex = settings.exhibition

  interface Col {
    header: string
    width: number
    bg?: string
    fg?: string
  }
  const before: Col[] = [
    { header: 'No.', width: 5 },
    { header: H('会社名', 'Company'), width: 24 },
    { header: H('氏名', 'Name'), width: 18 },
    { header: H('部署', 'Department'), width: 20 },
    { header: H('役職', 'Position'), width: 14 },
    { header: H('都道府県', 'Prefecture'), width: 11 },
    { header: H('市区町村', 'City'), width: 12 },
    { header: H('電話番号', 'Phone'), width: 15 },
    { header: H('メール', 'Email'), width: 28 },
    { header: H('来場日', 'Date'), width: 7 },
    { header: H('時間', 'Time'), width: 7 },
    { header: H('受付', 'Recvd.'), width: 10 },
    { header: H('優先度', 'Priority'), width: 9, bg: COLOR.priorityHeader, fg: '#FFFFFF' },
    { header: H('顧客の種類', 'Customer type'), width: 14 },
  ]
  const after: Col[] = [
    { header: H('次のアクション', 'Next steps'), width: 30 },
    { header: H('担当', 'PIC'), width: 10 },
    { header: H('メモ・コメント', 'Notes / Comments'), width: 50 },
    { header: H('登録日時', 'Added at'), width: 16, bg: COLOR.auditHeader },
    { header: H('登録端末', 'Device'), width: 24, bg: COLOR.auditHeader },
    { header: H('更新', 'Edited'), width: 26, bg: COLOR.auditHeader },
    { header: H('重複の可能性', 'Duplicate?'), width: 10, bg: COLOR.auditHeader },
    { header: H('読み取った文字', 'Recognized text'), width: 40, bg: COLOR.auditHeader },
  ]
  const hasGroup = interests.length > 0
  const headerStyle = (c: Col): Omit<Cell, 'value'> => ({
    fontWeight: 'bold',
    backgroundColor: c.bg ?? COLOR.header,
    textColor: c.fg,
    align: 'center',
    alignVertical: 'center',
    wrap: true,
  })

  // 1行目: 展示会名（と会場）
  const totalCols = before.length + interests.length + after.length
  const title = [ex.name, ex.location].filter(Boolean).join(' @') || t('app.title')
  const titleRow: Row = [
    {
      value: title,
      fontSize: 18,
      fontWeight: 'bold',
      textColor: COLOR.title,
      textDecoration: { underline: true },
      columnSpan: Math.min(9, totalCols),
      height: 30,
      alignVertical: 'center',
    },
    ...Array<null>(totalCols - 1).fill(null),
  ]

  // 見出し: 興味のある分野があれば2行（上に「興味のある分野」、下に各分野）、なければ1行
  const head1: Row = []
  const head2: Row = []
  const pushSpanned = (c: Col) => {
    head1.push({ value: c.header, ...border, ...headerStyle(c), ...(hasGroup ? { rowSpan: 2 } : {}), height: 34 })
    if (hasGroup) head2.push(null)
  }
  before.forEach(pushSpanned)
  if (hasGroup) {
    head1.push({
      value: H('興味のある分野', 'Interest - 0 or 1'),
      ...border,
      ...headerStyle({ header: '', width: 0, bg: COLOR.interestHeader }),
      columnSpan: interests.length,
    })
    head1.push(...Array<null>(interests.length - 1).fill(null))
    for (const c of interests) {
      head2.push({ value: c.label, ...border, ...headerStyle({ header: '', width: 0, bg: COLOR.interestHeader }), fontWeight: undefined, height: 34 })
    }
  }
  after.forEach(pushSpanned)

  const rows = [...leads]
    .filter((l) => !l.deleted)
    .sort((a, b) => (a.metAt || a.createdAt) - (b.metAt || b.createdAt))
    .map((l, i): Row => {
      const met = asExcelDate(l.metAt || l.createdAt)
      const steps = (l.nextSteps ?? []).map((s) => {
        const label = categoryLabel(settings.nextActions, s.action)
        const extra = [s.who, s.when.slice(5).replace('-', '/')].filter(Boolean).join(' ')
        return extra ? `${label} (${extra})` : label
      })
      const pic = [...new Set((l.nextSteps ?? []).map((s) => s.who).filter(Boolean))].join(', ')
      const main = { backgroundColor: COLOR.main }
      return [
        cell(i + 1, { ...main, align: 'right' }),
        cell(l.company, { ...main, fontWeight: 'bold' }),
        cell(l.name, main),
        cell(l.department, main),
        cell(l.title, main),
        cell(lang === 'en' ? prefectureInEnglish(l.prefecture) : l.prefecture, main),
        cell(l.city, main),
        cell(l.phone, { backgroundColor: COLOR.contact }),
        cell(l.email, { backgroundColor: COLOR.contact }),
        cell(met, { backgroundColor: COLOR.visit, format: 'm/d', align: 'center' }),
        cell(met, { backgroundColor: COLOR.visit, format: 'h:mm', align: 'center' }),
        cell(l.staff ?? l.createdBy.member, { backgroundColor: COLOR.visit, align: 'center' }),
        cell(categoryLabel(settings.importance, l.importance), {
          ...main,
          fontWeight: 'bold',
          fontSize: 12,
          textColor: COLOR.priorityText,
          align: 'center',
        }),
        cell(categoryLabel(settings.customerTypes, l.customerType), main),
        ...interests.map((c) =>
          (l.interests ?? []).includes(c.id)
            ? cell(1, { backgroundColor: COLOR.interestOn, align: 'center', fontWeight: 'bold' })
            : cell('', { backgroundColor: COLOR.interest }),
        ),
        cell(steps.join(' / '), { ...main, wrap: true }),
        cell(pic, main),
        cell(l.note, { ...main, wrap: true, alignVertical: 'top' }),
        cell(asExcelDate(l.createdAt), { backgroundColor: COLOR.audit, format: 'yyyy/mm/dd hh:mm' }),
        cell(authorLabel(l.createdBy) + ` #${l.createdBy.deviceId}`, { backgroundColor: COLOR.audit }),
        cell(
          l.updatedAt !== l.createdAt ? `${formatStamp(l.updatedAt)} ${authorLabel(l.updatedBy)}` : '',
          { backgroundColor: COLOR.audit },
        ),
        cell(duplicates.has(l.id) ? t('xlsx.duplicateYes') : '', { backgroundColor: COLOR.audit, align: 'center' }),
        cell(l.ocrText, { backgroundColor: COLOR.audit, wrap: true, alignVertical: 'top' }),
      ]
    })

  return {
    data: [titleRow, head1, ...(hasGroup ? [head2] : []), ...rows],
    columns: [...before, ...interests.map(() => ({ width: 7 })), ...after].map((c) => ({ width: c.width })),
    headerRows: hasGroup ? 3 : 2,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function formatStamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`
}

/** 会期中の、時間帯 × 日 の件数（ダッシュボードのグラフと同じ集計） */
export function hourlySheet(leads: Lead[], settings: SharedSettings, t: TFn): SheetContent {
  const d = buildDashboard(leads, settings.exhibition)
  const dayLabels = d.perDay.map((_, i) => t('chart.day', { n: i + 1 }))
  const head = (value: string): Cell => ({ value, ...border, fontWeight: 'bold', backgroundColor: COLOR.header, align: 'center' })
  const data: Row[] = [[head(t('xlsx.colHour')), ...dayLabels.map(head), head(t('xlsx.colTotal'))]]
  for (const row of d.rows) {
    const counts = d.perDay.map((_, i) => row[`day${i}`])
    data.push([
      { value: `${row.hour}:00-${row.hour + 1}:00`, ...border },
      ...counts.map((value): Cell => ({ value, align: 'right', ...border })),
      { value: counts.reduce((a, b) => a + b, 0), align: 'right', fontWeight: 'bold', ...border },
    ])
  }
  data.push([
    { value: t('xlsx.colTotal'), fontWeight: 'bold', ...border },
    ...d.perDay.map((value): Cell => ({ value, align: 'right', fontWeight: 'bold', ...border })),
    { value: d.total - d.outside, align: 'right', fontWeight: 'bold', ...border },
  ])
  if (d.outside > 0) data.push([{ value: t('xlsx.outside', { n: d.outside }) }])
  return { data, columns: [{ width: 14 }, ...d.perDay.map(() => ({ width: 10 })), { width: 10 }], headerRows: 1 }
}

/** 書き出すファイル名。ExhibitionLeadLog_<展示会名>_YYYYMMDD-HHMM.xlsx（ファイル名に使えない文字は _ にする） */
export function exportFileName(exhibition: string, now: Date): string {
  const safe = exhibition.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `ExhibitionLeadLog_${safe ? `${safe}_` : ''}${stamp}.xlsx`
}
