import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 프로젝트 페이지(/mode-rhythm/) 배포 대비.
// dev는 '/', build는 '/mode-rhythm/'. 사용자/조직 루트 페이지면 build base를 '/'로.
export default defineConfig(({ command, isPreview }) => {
  // preview도 build와 같은 base를 써야 로컬에서 GitHub Pages 경로/SW scope를 그대로 검증할 수 있다
  const base = command === 'build' || isPreview ? '/mode-rhythm/' : '/'
  return {
    base,
    define: {
      // 빌드 식별자 (Settings 표시 + 업데이트 확인용)
      __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    },
    plugins: [
      react(),
      VitePWA({
        // 'prompt': 새 SW를 자동 활성화하지 않고, 앱 배너에서 사용자가 업데이트를 결정
        registerType: 'prompt',
        includeAssets: ['icons/icon.svg', 'icons/maskable.svg'],
        manifest: {
          // 고정 ID — 배포 경로가 같으면 같은 앱으로 인식 (새 설치 취급 방지)
          id: base,
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
