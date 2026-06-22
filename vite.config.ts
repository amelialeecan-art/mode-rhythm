import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Phase 1: 기본 React 빌드만. PWA 플러그인은 후속 단계에서 추가.
export default defineConfig({
  plugins: [react()],
})
