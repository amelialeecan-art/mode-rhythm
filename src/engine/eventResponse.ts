/* =====================================================================
   MODE · 사건 전후 변화 곡선 (순수 함수 · 9B-2A)
   기존 factor 분석이 실제로 연결한 (factorGroup, targetMetric)에 대해,
   사건 발생일을 0일로 정렬한 뒤 상대 날짜별 결과 지표 평균 흐름을 만든다.
   - 연속 노출은 하나의 노출 구간으로 묶어 중복 표본을 막는다(시작일=0일).
   - 결측일은 0으로 세지 않는다(기록 있는 날만 평균, 없으면 해당 상대날은 표본 0).
   - 상대 날짜별 실제 표본 수(n)를 따로 센다.
   새 분석 임계값을 만들지 않는다 — 표시용 집계.
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate, toISODate } from '../lib/date'
import { groupConsecutiveDates } from './exposureRuns'

export const EVENT_RESPONSE_BEFORE = 3 // -3일
export const EVENT_RESPONSE_AFTER = 5 // 최대 +5일 (기본 표시는 +3, 표본 있으면 +4/+5)
const CORE_AFTER = 3
/** 노출(사건) 최소 사례 수 — 표본 부족 게이트. 고정 상수(자의적 튜닝 금지). */
export const MIN_EXPOSURES = 3
/** 그래프를 그리려면 핵심 상대날(-3..+3) 중 표본 2+인 날이 이만큼 필요. */
const MIN_POPULATED_CORE_DAYS = 5

export interface EventResponsePoint {
  rel: number
  /** 존재하는 값만 평균. 표본 없으면 undefined(선 끊김). */
  mean?: number
  n: number
}

export interface EventResponseCurve {
  points: EventResponsePoint[]
  /** 평소 기준선 = 기록된 날 전체 metric 평균. */
  baseline: number
  /** 중복 제거된 노출(사건) 수. */
  exposures: number
  /** 그래프를 그릴 만큼 표본이 있는지. */
  eligible: boolean
}

function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
function round(n: number): number {
  return Math.round(n)
}

/** 연속(달력상 1일 간격) 발생일을 하나의 노출로 묶어 시작일만 남긴다.
 *  연속-묶기 로직은 exposureRuns.groupConsecutiveDates와 공유한다(중복 구현 방지). */
export function dedupeExposures(dates: ISODate[]): ISODate[] {
  return groupConsecutiveDates(dates).map((run) => run[0])
}

/**
 * 사건 전후 곡선. occurrenceDates = 해당 factorGroup의 발생 추정일들,
 * metricByDate = 날짜→해당 metric 값(기록된 날만 존재).
 */
export function buildEventResponse(occurrenceDates: ISODate[], metricByDate: Map<ISODate, number>): EventResponseCurve {
  const exposures = dedupeExposures(occurrenceDates)

  const baselineVals = [...metricByDate.values()]
  const baseline = baselineVals.length > 0 ? round(baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length) : 0

  const points: EventResponsePoint[] = []
  for (let rel = -EVENT_RESPONSE_BEFORE; rel <= EVENT_RESPONSE_AFTER; rel++) {
    const vals: number[] = []
    for (const e of exposures) {
      const v = metricByDate.get(addDays(e, rel))
      if (v !== undefined) vals.push(v)
    }
    points.push({ rel, mean: vals.length > 0 ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined, n: vals.length })
  }

  // 표본 없는 +4/+5 꼬리는 잘라낸다(표시 폭 절약)
  while (points.length > 0) {
    const last = points[points.length - 1]
    if (last.rel > CORE_AFTER && last.n < 2) points.pop()
    else break
  }

  const coreN2 = points.filter((p) => p.rel >= -EVENT_RESPONSE_BEFORE && p.rel <= CORE_AFTER && p.n >= 2).length
  const eligible = exposures.length >= MIN_EXPOSURES && coreN2 >= MIN_POPULATED_CORE_DAYS

  return { points, baseline, exposures: exposures.length, eligible }
}
