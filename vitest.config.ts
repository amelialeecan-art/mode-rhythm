import { defineConfig } from 'vitest/config'

// 저장 계층 단위 테스트. fake-indexeddb로 IndexedDB를 흉내낸다(브라우저 불필요).
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
