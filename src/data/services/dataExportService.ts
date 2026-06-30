/* =====================================================================
   MODE · 데이터 내보내기 (로컬 → JSON 파일)
   ⚠️ 민감한 개인 기록이다. 서버로 보내지 않으며, 파일은 사용자 기기에 저장된다.
   ===================================================================== */
import { db } from '../db'
import { toISODate } from '../../lib/date'
import type {
  CycleLog,
  DailyLog,
  DailyScore,
  EventLog,
  PatternInsight,
  RecoveryLog,
  UserSettings,
} from '../models'

export interface ModeExportPayload {
  app: 'MODE'
  version: 1
  exportedAt: string
  tables: {
    dailyLogs: DailyLog[]
    eventLogs: EventLog[]
    cycleLogs: CycleLog[]
    recoveryLogs: RecoveryLog[]
    dailyScores: DailyScore[]
    patternInsights: PatternInsight[]
    userSettings: UserSettings[]
  }
}

/** 모든 테이블을 모아 export payload를 만든다. */
export async function exportAllData(): Promise<ModeExportPayload> {
  const [dailyLogs, eventLogs, cycleLogs, recoveryLogs, dailyScores, patternInsights, userSettings] =
    await Promise.all([
      db.dailyLogs.toArray(),
      db.eventLogs.toArray(),
      db.cycleLogs.toArray(),
      db.recoveryLogs.toArray(),
      db.dailyScores.toArray(),
      db.patternInsights.toArray(),
      db.userSettings.toArray(),
    ])

  return {
    app: 'MODE',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: { dailyLogs, eventLogs, cycleLogs, recoveryLogs, dailyScores, patternInsights, userSettings },
  }
}

/** export payload를 JSON 파일로 다운로드한다(브라우저 전용). */
export async function downloadExportJson(): Promise<void> {
  const payload = await exportAllData()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mode-export-${toISODate(new Date())}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
