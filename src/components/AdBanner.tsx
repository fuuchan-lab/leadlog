import { useEffect, useRef, useState } from 'react'
import { ADSENSE_CLIENT, ADSENSE_SLOT, isAndroidApp } from '../adsense.ts'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const enabled = ADSENSE_CLIENT !== '' && ADSENSE_SLOT !== '' && !isAndroidApp()

/** 広告が出ない（unfilled のまま・読み込めない）と判断するまでの待ち時間 */
const GIVE_UP_MS = 15000

/**
 * 画面の下のドックに置く AdSense の広告。ID が入っていない間と、Android アプリ（TWA）の中では何も表示しない。
 * AI で読み取る設定（API キー）がある時も出さない。広告のスクリプトは同じ画面の中で動くので、
 * キーや読み取った内容に手が届いてしまう。スクリプト自体を読み込まないことで、外に出る経路を作らない。
 * 広告を読み出せない時（広告ブロッカー・オフラインなどでスクリプトが読めない、unfilled、一定時間たっても表示されない、
 * push の失敗）は、空白の枠を残さないよう、広告の DOM（.ad-banner ごと）を消す
 */
export function AdBanner({ disabled = false }: { disabled?: boolean }) {
  const requested = useRef(false)
  const insRef = useRef<HTMLModElement>(null)
  const [removed, setRemoved] = useState(false)

  useEffect(() => {
    if (!enabled || disabled) return
    const ins = insRef.current
    if (!ins) return

    const giveUp = () => setRemoved(true)
    let timer = 0
    const onStatus = () => {
      const status = ins.getAttribute('data-ad-status')
      if (status === 'unfilled') giveUp()
      else if (status === 'filled') window.clearTimeout(timer)
    }
    const observer = new MutationObserver(onStatus)
    observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] })
    timer = window.setTimeout(() => {
      if (ins.getAttribute('data-ad-status') !== 'filled') giveUp()
    }, GIVE_UP_MS)

    if (!requested.current) {
      requested.current = true
      const script = document.createElement('script')
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`
      script.onerror = giveUp
      document.head.append(script)
      try {
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      } catch (error) {
        console.error('[ads]', error)
        giveUp()
      }
    }

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [disabled])

  if (!enabled || disabled || removed) return null
  return (
    <div className="ad-banner">
      <ins
        ref={insRef}
        className="adsbygoogle"
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="horizontal"
      />
    </div>
  )
}
