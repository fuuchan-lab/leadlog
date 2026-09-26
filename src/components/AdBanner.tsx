import { useEffect, useRef } from 'react'
import { ADSENSE_CLIENT, ADSENSE_SLOT, isAndroidApp } from '../adsense.ts'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const enabled = ADSENSE_CLIENT !== '' && ADSENSE_SLOT !== '' && !isAndroidApp()

/** 画面の下に置く AdSense の広告。ID が入っていない間と、Android アプリ（TWA）の中では何も表示しない */
export function AdBanner() {
  const requested = useRef(false)

  useEffect(() => {
    if (!enabled || requested.current) return
    requested.current = true
    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`
    document.head.append(script)
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (error) {
      console.error('[ads]', error)
    }
  }, [])

  if (!enabled) return null
  return (
    <div className="ad-banner">
      <ins
        className="adsbygoogle"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
