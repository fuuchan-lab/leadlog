import { LOCALES, type Lang } from './i18n/context.ts'

export function formatDateTime(ts: number, lang: Lang): string {
  return new Date(ts).toLocaleString(LOCALES[lang], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
