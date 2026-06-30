/* =====================================================================
   MODE · 개발용 콘솔 핸들 (DEV 전용)
   브라우저 콘솔에서 window.MODE.seed() / window.MODE.reset() 호출 가능.
   프로덕션 빌드에서는 import 자체를 가드한다(main.tsx).
   ===================================================================== */
import { db } from './db'
import { seedDemoData } from './seed'
import { resetDatabase } from './reset'
import * as repositories from './repositories'

declare global {
  interface Window {
    MODE?: {
      db: typeof db
      seed: typeof seedDemoData
      reset: typeof resetDatabase
      repositories: typeof repositories
    }
  }
}

export function installDevtools(): void {
  if (typeof window === 'undefined') return
  window.MODE = { db, seed: seedDemoData, reset: resetDatabase, repositories }
  console.info('[MODE] devtools 준비됨 — window.MODE.seed() / window.MODE.reset()')
}
