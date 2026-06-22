/* =====================================================================
   MODE · 로컬 데이터 초기화 (개발/관리용)
   ⚠️ 위험: 모든 로컬 기록을 지운다. 되돌릴 수 없다.
   ===================================================================== */
import { db } from './db'

/** 모든 테이블 clear. (DB/스키마는 유지, 데이터만 비움) */
export async function resetDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [db.dailyLogs, db.eventLogs, db.cycleLogs, db.recoveryLogs, db.dailyScores, db.patternInsights, db.userSettings],
    async () => {
      await Promise.all([
        db.dailyLogs.clear(),
        db.eventLogs.clear(),
        db.cycleLogs.clear(),
        db.recoveryLogs.clear(),
        db.dailyScores.clear(),
        db.patternInsights.clear(),
        db.userSettings.clear(),
      ])
    },
  )
}
