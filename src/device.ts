/**
 * この端末の識別。展示会では最大5人が同じ Google アカウント（会社の共有アカウント）でログインするため、
 * Google のアカウントでは登録者を区別できない。そこで端末ごとに ID を作り、登録者名と一緒に記録に残す。
 */
import type { Author } from './types.ts'

const DEVICE_ID_KEY = 'leadlog-device-id'
const MEMBER_KEY = 'leadlog-member'

let cachedId: string | null = null

/** 端末 ID（8文字）。初回に作ってこの端末に保存する */
export function getDeviceId(): string {
  if (cachedId) return cachedId
  try {
    const saved = localStorage.getItem(DEVICE_ID_KEY)
    if (saved && /^[a-z0-9]{8}$/.test(saved)) return (cachedId = saved)
  } catch {
    // 保存できない環境では、その回だけの ID になる
  }
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  try {
    localStorage.setItem(DEVICE_ID_KEY, id)
  } catch {
    // 無視
  }
  return (cachedId = id)
}

export function loadMember(): string {
  try {
    return localStorage.getItem(MEMBER_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveMember(name: string) {
  try {
    localStorage.setItem(MEMBER_KEY, name.trim())
  } catch {
    // 無視
  }
}

/** ユーザーエージェントから「Android · Chrome」のような端末の種類を作る */
export function describeDevice(ua: string): string {
  const os = /iPad/.test(ua)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /CriOS|Chrome\//.test(ua)
        ? 'Chrome'
        : /FxiOS|Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''
  return [os, browser].filter(Boolean).join(' · ') || 'Browser'
}

export function currentAuthor(): Author {
  return { deviceId: getDeviceId(), member: loadMember(), device: describeDevice(navigator.userAgent) }
}

/** 一覧などに出す「田中（Android · Chrome）」の形 */
export function authorLabel(a: Author): string {
  return a.member ? `${a.member} (${a.device})` : `${a.device} #${a.deviceId.slice(0, 4)}`
}
