import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 프로젝트 페이지(/mode-rhythm/) 배포 대비.
// dev는 '/', build는 '/mode-rhythm/'. 사용자/조직 루트 페이지면 build base를 '/'로.
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/mode-rhythm/' : '/'
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg', 'icons/maskable.svg'],
        manifest: {
          name: 'MODE',
          short_name: 'MODE',
          description: '개인 리듬 기록과 분석 앱',
          lang: 'ko',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#A985E8',
          background_color: '#EBE3FA',
          icons: [
            { src: 'icons/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icons/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icons/maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          // 앱 셸만 프리캐시. IndexedDB(개인 기록)는 캐시 대상이 아니며 로컬에 남는다.
          globPatterns: ['**/*.{js,css,html,svg}'],
          navigateFallback: `${base}index.html`,
          cleanupOutdatedCaches: true,
        },
      }),
    ],
  }
})
