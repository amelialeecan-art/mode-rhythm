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
import type {
  StateMeasurement,
  SleepEpisode,
  MealEpisode,
  ActivityEpisode,
  MedicationProfile,
  MedicationDose,
  HealthException,
  ScreenMetric,
  WeightMeasurement,
} from '../modelsV2'

/**
 * 백업 파일(형식) 버전. ⚠️ DB_VERSION과 별개 개념이다.
 * v1: V1 7테이블만. v2: V1 7테이블 + V2 신규 9테이블(원자료 전부).
 * ⚠️ v1 백업도 계속 import 가능해야 한다(하위호환). 이 값을 올려도 import는 두 버전을 모두 받는다.
 */
export const EXPORT_FORMAT_VERSION = 2
/** import이 허용하는 백업 포맷 버전 목록(하위호환). */
export const SUPPORTED_IMPORT_VERSIONS = [1, 2] as const

/** V2 신규 테이블 묶음(백업/복원 단위). v1 파일에는 존재하지 않는다. */
export interface ModeExportV2Tables {
  stateMeasurements: StateMeasurement[]
  sleepEpisodes: SleepEpisode[]
  mealEpisodes: MealEpisode[]
  activityEpisodes: ActivityEpisode[]
  medicationProfiles: MedicationProfile[]
  medicationDoses: MedicationDose[]
  healthExceptions: HealthException[]
  screenMetrics: ScreenMetric[]
  weightMeasurements: WeightMeasurement[]
}

export interface ModeExportPayload {
  app: 'MODE'
  version: number
  exportedAt: string
  tables: {
    // V1 (항상 존재)
    dailyLogs: DailyLog[]
    eventLogs: EventLog[]
    cycleLogs: CycleLog[]
    recoveryLogs: RecoveryLog[]
    dailyScores: DailyScore[]
    patternInsights: PatternInsight[]
    userSettings: UserSettings[]
  } & Partial<ModeExportV2Tables> // V2 테이블은 v1 파일엔 없을 수 있어 optional
}

/**
 * 모든 테이블(V1 + V2)을 모아 v2 export payload를 만든다.
 * 원자료를 모두 담아 분석 캐시(dailyScores/patternInsights)가 없어도 앱을 복구할 수 있게 한다.
 */
export async function buildExportPayload(): Promise<ModeExportPayload> {
  const [
    dailyLogs, eventLogs, cycleLogs, recoveryLogs, dailyScores, patternInsights, userSettings,
    stateMeasurements, sleepEpisodes, mealEpisodes, activityEpisodes,
    medicationProfiles, medicationDoses, healthExceptions, screenMetrics, weightMeasurements,
  ] = await Promise.all([
    db.dailyLogs.toArray(),
    db.eventLogs.toArray(),
    db.cycleLogs.toArray(),
    db.recoveryLogs.toArray(),
    db.dailyScores.toArray(),
    db.patternInsights.toArray(),
    db.userSettings.toArray(),
    db.stateMeasurements.toArray(),
    db.sleepEpisodes.toArray(),
    db.mealEpisodes.toArray(),
    db.activityEpisodes.toArray(),
    db.medicationProfiles.toArray(),
    db.medicationDoses.toArray(),
    db.healthExceptions.toArray(),
    db.screenMetrics.toArray(),
    db.weightMeasurements.toArray(),
  ])

  return {
    app: 'MODE',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      dailyLogs, eventLogs, cycleLogs, recoveryLogs, dailyScores, patternInsights, userSettings,
      stateMeasurements, sleepEpisodes, mealEpisodes, activityEpisodes,
      medicationProfiles, medicationDoses, healthExceptions, screenMetrics, weightMeasurements,
    },
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
