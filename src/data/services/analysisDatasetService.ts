/* =====================================================================
   MODE · V2 분석 dataset 서비스 (DB → engine 경계)
   저장소에서 원자료를 읽어 순수 engine(v2)에 넘길 배열을 만든다.
   engine은 DB를 모른다 — 이 서비스가 유일한 경계다.
   ⚠️ V1 patternAnalysisService(기존)와 분리된 V2 전용 경로다.
   ===================================================================== */
import { getTodayISODate, parseISODate, toISODate } from '../../lib/date'
import type { ISODate } from '../models'
import type { ActivityEpisode, HealthException, MealEpisode, SleepEpisode, StateMeasurement } from '../modelsV2'
import {
  activityEpisodeRepository,
  eventLogRepository,
  healthExceptionRepository,
  mealEpisodeRepository,
  sleepEpisodeRepository,
  stateMeasurementRepository,
} from '../repositories'
import { isV2StressEvent, type StressCategoryCode } from '../catalog/stressEvents'

function addDaysISO(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** V2 분석에 필요한 원자료 묶음(engine이 아니라 여기서만 DB 접근). */
export interface V2AnalysisBundle {
  rangeDays: number
  start: ISODate
  end: ISODate
  measurements: StateMeasurement[]
  meals: MealEpisode[]
  sleeps: SleepEpisode[]
  activities: ActivityEpisode[]
  healthExceptions: HealthException[]
  /** 날짜별 canonical 스트레스 사건(occurredAt 보유 V2만). */
  stressEvents: { localDate: ISODate; category: StressCategoryCode; intensity: number; occurredAt: string }[]
}

/** 최근 rangeDays의 V2 원자료를 모은다. */
export async function getV2AnalysisBundle(rangeDays = 120): Promise<V2AnalysisBundle> {
  const end = getTodayISODate()
  const start = addDaysISO(end, -(rangeDays - 1))
  const [measurements, meals, sleeps, activities, healthExceptions, events] = await Promise.all([
    stateMeasurementRepository.listByDateRange(start, end),
    mealEpisodeRepository.listByDateRange(start, end),
    sleepEpisodeRepository.listByDateRange(start, end),
    activityEpisodeRepository.listByDateRange(start, end),
    healthExceptionRepository.listByDateRange(start, end),
    eventLogRepository.listByDateRange(start, end),
  ])
  const stressEvents = events
    .filter((e) => isV2StressEvent(e) && !!e.occurredAt)
    .map((e) => ({
      localDate: e.date,
      category: e.mappedFactorGroup as StressCategoryCode,
      intensity: e.intensity,
      occurredAt: e.occurredAt as string,
    }))
  return { rangeDays, start, end, measurements, meals, sleeps, activities, healthExceptions, stressEvents }
}
