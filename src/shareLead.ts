/**
 * 名刺（リード）をメールで共有する。
 * スマホでは共有の画面（メール・Gmail など）を開き、名刺の画像と vCard を添付し、件名・本文を入れた下書きにする。
 * 共有の画面でファイルを送れない端末（PC など）では、添付ファイルを保存してからメールの下書きを開く
 */
import { formatDateTime } from './format.ts'
import type { Lang, TFn } from './i18n/context.ts'
import { loadLeadPhoto } from './photos.ts'
import { buildShareMail, buildVCard, mailtoUrl, shareFileBase, type ShareMail } from './share.ts'
import type { Lead } from './types.ts'

export type ShareResult = 'shared' | 'cancelled' | 'downloaded'

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export interface PreparedShare {
  mail: ShareMail
  files: File[]
}

/** 添付ファイルと件名・本文を用意する。画像を読むのに時間がかかるので、ボタンを押す前（詳細を開いた時）に作っておく */
export async function prepareShare(lead: Lead, t: TFn, lang: Lang): Promise<PreparedShare> {
  const mail = buildShareMail(lead, t, formatDateTime(lead.metAt || lead.createdAt, lang))
  const base = shareFileBase(lead, t)
  const files: File[] = []
  const photo = lead.photoId ? await loadLeadPhoto(lead.photoId) : null
  if (photo) files.push(new File([photo], `${base}.jpg`, { type: photo.type || 'image/jpeg' }))
  const note = lead.exhibition ? `${t('xlsx.colExhibition')}: ${lead.exhibition}` : ''
  files.push(new File([buildVCard(lead, note)], `${base}.vcf`, { type: 'text/vcard' }))
  return { mail, files }
}

/**
 * 共有する。iPhone の Safari はボタンを押した直後でないと共有の画面を開けないので、
 * 押してから共有の画面を開くまでの間に待つ処理を入れない
 */
export async function sendShare({ mail, files }: PreparedShare): Promise<ShareResult> {
  // Android の Chrome は vCard を共有で送れないので、その時は画像だけを添付する
  const images = files.filter((f) => f.type.startsWith('image/'))
  const attach = [files, images].find((list) => list.length > 0 && navigator.canShare?.({ files: list }))
  if (attach) {
    try {
      await navigator.share({ files: attach, title: mail.subject, text: mail.body })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      console.error('[share]', e)
      // 共有に失敗した時は、下の方法に切り替える
    }
  }
  files.forEach(download)
  location.href = mailtoUrl(mail)
  return 'downloaded'
}
