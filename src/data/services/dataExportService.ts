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

/**
 * 백업 파일(형식) 버전. ⚠️ DB_VERSION과 별개 개념이다.
 * DB_VERSION이 바뀌어도 이 값이 자동으로 따라 바뀌지 않는다 —
 * 백업 파일 구조가 실제로 달라질 때만 별도로 올린다.
 */
export const EXPORT_FORMAT_VERSION = 1

export interface ModeExportPayload {
  app: 'MODE'
  version: number
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

/** 모든 테이블을 모아 export payload를 만든다. (다운로드와 분리 — 자동 백업에서도 재사용) */
export async function buildExportPayload(): Promise<ModeExportPayload> {
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
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { dailyLogs, eventLogs, cycleLogs, recoveryLogs, dailyScores, patternInsights, userSettings },
  }
}

/** 하위 호환 별칭 — 기존 호출부/테스트에서 쓰던 이름 유지. */
export const exportAllData = buildExportPayload

/** payload를 지정한 파일명으로 JSON 다운로드한다(브라우저 전용). */
export function downloadExportPayload(payload: ModeExportPayload, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** export payload를 JSON 파일로 다운로드한다(브라우저 전용). 사용자 동작·파일명 그대로 유지. */
export async function downloadExportJson(): Promise<void> {
  const payload = await buildExportPayload()
  downloadExportPayload(payload, `mode-export-${toISODate(new Date())}.json`)
}
