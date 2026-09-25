import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '展示会リードログ',
        short_name: '展示会リードログ',
        description: '展示会で交換した名刺・バッジを読み取り、リードとして記録・共有します',
        lang: 'ja',
        id: './',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['business', 'productivity'],
        start_url: './',
        scope: './',
        background_color: '#f4f6fb',
        theme_color: '#1d4ed8',
        // PNG アイコン（192/512・maskable）はストア公開の前に用意する（docs/android.md）
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // OCR の部品（tesseract.js の worker・wasm・言語データ）は CDN から読み込む。
        // 一度読み込んだら端末に保存し、電波のない展示会場でも読み取れるようにする
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/(?:tesseract\.js|tesseract\.js-core|@tesseract\.js-data)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ocr-assets',
              expiration: { maxEntries: 40, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
