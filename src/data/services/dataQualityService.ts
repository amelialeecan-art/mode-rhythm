/* =====================================================================
   MODE · 데이터 품질 서비스 (DB → 엔진)
   저장소에서 원자료를 읽어 순수 엔진(dataQuality)에 넘긴다.
   engine은 DB를 모른다 — 이 서비스가 경계다.
   ===================================================================== */
import { getTodayISODate, parseISODate, toISODate } from '../../lib/date'
import {
  analysisReadiness,
  buildDataQualityReport,
  type AnalysisReadiness,
  type DataQualityReport,
} from '../../engine'
import { mealEpisodeRepository, stateMeasurementRepository } from '../repositories'
import type { ISODate } from '../models'

function addDaysISO(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export interface DataQualitySummary {
  rangeDays: number
  /** 직접 측정(v2_core) 상태 기록 수 — "분석 가능한 기록 N회". */
  analyzableStateCount: number
  totalStateCount: number
  /** 기간 중 아침/저녁 체크인이 있는 날 비율(0~1). */
  morningCoverageRate: number
  eveningCoverageRate: number
  /** 먹기 직전 상태(hunger/craving/bingeUrge 중 하나라도)가 기록된 식사 수. */
  mealPreStateCount: number
  totalMealCount: number
  anyMetricReady: boolean
  readiness: AnalysisReadiness
}

/** 기간 내 StateMeasurement 품질 리포트. */
export async function getStateQualityReport(rangeDays = 90): Promise<DataQualityReport> {
  const end = getTodayISODate()
  const start = addDaysISO(end, -(rangeDays - 1))
  const measurements = await stateMeasurementRepository.listByDateRange(start, end)
  return buildDataQualityReport(measurements)
}

/** Analysis 화면 상단 coverage/품질 요약. */
export async function getDataQualitySummary(rangeDays = 90): Promise<DataQualitySummary> {
  const end = getTodayISODate()
  const start = addDaysISO(end, -(rangeDays - 1))
  const [measurements, meals] = await Promise.all([
    stateMeasurementRepository.listByDateRange(start, end),
    mealEpisodeRepository.listByDateRange(start, end),
  ])

  const readiness = analysisReadiness(measurements)

  const morningDays = new Set(measurements.filter((m) => m.checkInType === 'morning').map((m) => m.localDate))
  const eveningDays = new Set(measurements.filter((m) => m.checkInType === 'evening').map((m) => m.localDate))

  const mealPreStateCount = meals.filter(
    (m) =>
      typeof m.prePhysicalHunger === 'number' ||
      typeof m.preCraving === 'number' ||
      typeof m.preBingeUrge === 'number',
  ).length

  return {
    rangeDays,
    analyzableStateCount: readiness.coreMeasurementCount,
    totalStateCount: measurements.length,
    morningCoverageRate: Math.min(1, morningDays.size / rangeDays),
    eveningCoverageRate: Math.min(1, eveningDays.size / rangeDays),
    mealPreStateCount,
    totalMealCount: meals.length,
    anyMetricReady: readiness.anyMetricReady,
    readiness,
  }
}
