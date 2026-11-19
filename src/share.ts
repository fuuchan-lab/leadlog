/**
 * 名刺（リード）をメールで共有するための中身を作る。
 * 件名・本文と、連絡先として取り込める vCard（.vcf）。画面や端末には触れない（テストできるように）
 */
import type { TFn } from './i18n/context.ts'
import type { Lead } from './types.ts'

export interface ShareMail {
  subject: string
  body: string
}

/** 漢字・かな（日本語の氏名は「姓 名」の順） */
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/

/** 添付ファイルの名前（拡張子なし）。氏名か会社名、無ければ「名刺」 */
export function shareFileBase(lead: Pick<Lead, 'name' | 'company'>, t: TFn): string {
  const who = (lead.name || lead.company).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '')
  return `${t('share.fileName')}${who ? `_${who}` : ''}`
}

/** メールの件名と本文。名刺に書いてある内容と、会った展示会・日時を入れる（社内のメモ・重要度は入れない） */
export function buildShareMail(lead: Lead, t: TFn, metAt: string): ShareMail {
  const who = [lead.name, lead.company].filter(Boolean).join(' / ')
  const lines: [string, string][] = [
    [t('field.name'), lead.name],
    [t('field.company'), lead.company],
    [t('field.department'), lead.department],
    [t('field.title'), lead.title],
    [t('share.address'), lead.prefecture + lead.city],
    [t('field.phone'), lead.phone],
    [t('field.email'), lead.email],
    [t('xlsx.colExhibition'), lead.exhibition],
    [t('field.metAt'), metAt],
  ]
  const details = lines.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`)
  return {
    subject: who ? t('share.subject', { who }) : t('share.subjectNoName'),
    body: [t('share.greeting'), '', ...details, '', t('share.attached')].join('\n'),
  }
}

/** vCard の値の中の特別な文字を逃がす */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')

/** 氏名を姓と名に分ける。日本語は「姓 名」、英語は「名 姓」の順 */
function splitName(name: string): { family: string; given: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { family: parts[0] ?? '', given: '' }
  if (CJK.test(name)) return { family: parts[0], given: parts.slice(1).join(' ') }
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
}

/** 連絡先のアプリに取り込める vCard 3.0 */
export function buildVCard(lead: Lead, note = ''): string {
  const { family, given } = splitName(lead.name)
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(given)};;;`, `FN:${esc(lead.name || lead.company)}`]
  if (lead.company || lead.department) lines.push(`ORG:${esc(lead.company)}${lead.department ? `;${esc(lead.department)}` : ''}`)
  if (lead.title) lines.push(`TITLE:${esc(lead.title)}`)
  if (lead.phone) lines.push(`TEL;TYPE=WORK,VOICE:${esc(lead.phone)}`)
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(lead.email)}`)
  if (lead.prefecture || lead.city) lines.push(`ADR;TYPE=WORK:;;;${esc(lead.city)};${esc(lead.prefecture)};;`)
  if (note) lines.push(`NOTE:${esc(note)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n') + '\r\n'
}

/** 共有の画面が使えない時に開く、メールの下書きのリンク */
export function mailtoUrl({ subject, body }: ShareMail, to = ''): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
}
