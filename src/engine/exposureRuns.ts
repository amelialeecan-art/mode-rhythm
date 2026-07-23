/* =====================================================================
   MODE · 노출 구간(연속일) 모델 (순수 함수 · 9F)
   "같은 사건이 며칠 연속됐는지"를 실제 패턴 분석에 쓰기 위한 기반.
   - 같은 event key의 달력상 연속(빈 날 없음) 기록을 하나의 노출 구간으로 묶는다.
   - 같은 factorGroup이라도 실제 사건(key)이 다르면 합치지 않는다.
   - 기록하지 않은 날짜까지 지속됐다고 추정하지 않는다(기록된 날만 센다).
   - 하루 노출과 2일 이상 연속 노출을 구분해, 단일 vs 다일 결과를 비교한다.
   기존 dedupeExposures의 연속-묶기 로직을 여기서 일반화해 재사용한다.
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate } from '../lib/date'

export interface ExposureRun {
  /** 사건 식별 키(카탈로그=eventCode, 사용자정의=정규화 문구+factorGroup). */
  key: string
  factorGroup: string
  startDate: ISODate
  endDate: ISODate
  /** 구간에 실제 기록된 날 수(=연속이므로 달력 길이와 같다). */
  days: number
  dates: ISODate[]
}

/** 노출 구간 계산 입력(사건 1건의 발생일). */
export interface ExposureInput {
  date: ISODate
  factorGroup: string
  eventCode: string
  isCustom?: boolean
  /** 사용자정의 사건 식별용 문구(없으면 eventLabel/eventCode). */
  label?: string
}

/** 단일 vs 다일 노출 결과 비교. */
export interface ExposureCumulativeStat {
  /** 하루 노출들의 결과(metric) 평균. */
  singleMean: number
  /** 2일 이상 연속 노출들의 결과(metric) 평균. */
  multiMean: number
  /** multiMean - singleMean (양수 = 이어질수록 지표가 커짐). */
  effectSize: number
  singleRuns: number
  multiRuns: number
  totalRuns: number
}

/** 같은 사건의 별도 노출 구간이 이만큼은 있어야 누적 결과를 낸다. */
export const MIN_EXPOSURE_RUNS = 5
/** 하루 노출 구간이 이만큼은 있어야 비교 기준이 된다. */
export const MIN_SINGLE_RUNS = 2
/** 여러 날(2일↑) 노출 사례가 이만큼은 있어야 "누적될수록"을 허용한다. */
export const MIN_MULTIDAY_RUNS = 2
/** 구간 종료 후 며칠까지의 변화를 결과에 포함할지(1~2일). */
const POST_EXPOSURE_AFTER = 2

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}
function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
function round(n: number): number {
  return Math.round(n)
}

/** 사용자정의 사건 문구 정규화(대소문자·앞뒤·중복 공백 무시). */
export function normalizeEventLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** 사건 식별 키. 카탈로그=eventCode, 사용자정의=정규화 문구+factorGroup. */
export function exposureKey(i: Pick<ExposureInput, 'factorGroup' | 'eventCode' | 'isCustom' | 'label'>): string {
  if (i.isCustom) return `custom:${i.factorGroup}:${normalizeEventLabel(i.label ?? i.eventCode)}`
  return `catalog:${i.eventCode}`
}

/**
 * 날짜 목록을 달력상 연속(빈 날 없음) 구간들로 나눈다. 중복 날짜는 제거·정렬.
 * dedupeExposures가 이 위에서 "구간 시작일"만 골라 쓰도록 공유한다.
 */
export function groupConsecutiveDates(dates: ISODate[]): ISODate[][] {
  const sorted = [...new Set(dates)].sort()
  const runs: ISODate[][] = []
  let cur: ISODate[] = []
  for (const d of sorted) {
    if (cur.length && daysBetween(cur[cur.length - 1], d) > 1) {
      runs.push(cur)
      cur = []
    }
    cur.push(d)
  }
  if (cur.length) runs.push(cur)
  return runs
}

/** 사건별(key) 노출 구간을 만든다. 같은 사건이 하루라도 비면 새 구간. */
export function buildExposureRuns(inputs: ExposureInput[]): ExposureRun[] {
  const byKey = new Map<string, { factorGroup: string; dates: ISODate[] }>()
  for (const i of inputs) {
    const key = exposureKey(i)
    const e = byKey.get(key)
    if (e) e.dates.push(i.date)
    else byKey.set(key, { factorGroup: i.factorGroup, dates: [i.date] })
  }
  const runs: ExposureRun[] = []
  for (const [key, { factorGroup, dates }] of byKey) {
    for (const run of groupConsecutiveDates(dates)) {
      runs.push({ key, factorGroup, startDate: run[0], endDate: run[run.length - 1], days: run.length, dates: run })
    }
  }
  runs.sort((a, b) => (a.startDate !== b.startDate ? (a.startDate < b.startDate ? -1 : 1) : a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return runs
}

/** 두 노출 구간이 겹친 날짜 수(서로 다른 사건이 같은 날 겹친 정도). */
export function overlapDays(a: ExposureRun, b: ExposureRun): number {
  const setB = new Set(b.dates)
  return a.dates.filter((d) => setB.has(d)).length
}

/**
 * 한 사건(key)의 노출 구간들에서 "하루 노출 vs 2일↑ 연속 노출"의 결과 차이.
 * 각 구간의 결과 = 노출 중 + 종료 후 1~2일의 metric 평균(기록된 날만).
 * 연속된 날을 독립 노출로 여러 번 세지 않는다(구간 단위로 1표본).
 * 반복 근거(구간 3회↑, 다일 2회↑)와 효과 기준(minEffect)을 통과할 때만 반환.
 */
export function cumulativeExposureEffect(
  runs: ExposureRun[],
  metricByDate: Map<ISODate, number>,
  minEffect = 0,
): ExposureCumulativeStat | null {
  // 게이트: 전체 구간 5회↑, 하루 노출 2회↑, 다일 노출 2회↑ (못 채우면 결과 없음)
  if (runs.length < MIN_EXPOSURE_RUNS) return null
  const single = runs.filter((r) => r.days === 1)
  const multi = runs.filter((r) => r.days >= 2)
  if (single.length < MIN_SINGLE_RUNS || multi.length < MIN_MULTIDAY_RUNS) return null

  const runResponse = (r: ExposureRun): number | undefined => {
    const dates = [...r.dates]
    for (let k = 1; k <= POST_EXPOSURE_AFTER; k++) dates.push(addDays(r.endDate, k))
    const vals = dates.map((d) => metricByDate.get(d)).filter((v): v is number => v !== undefined)
    return vals.length ? mean(vals) : undefined
  }
  const singleVals = single.map(runResponse).filter((v): v is number => v !== undefined)
  const multiVals = multi.map(runResponse).filter((v): v is number => v !== undefined)
  // 하루 노출 표본과 다일 노출 표본이 각각 충분해야 "하루일 때보다"를 말할 수 있다.
  if (singleVals.length < MIN_SINGLE_RUNS || multiVals.length < MIN_MULTIDAY_RUNS) return null

  const singleMean = round(mean(singleVals))
  const multiMean = round(mean(multiVals))
  const effectSize = multiMean - singleMean
  if (effectSize < minEffect) return null

  return { singleMean, multiMean, effectSize, singleRuns: single.length, multiRuns: multi.length, totalRuns: runs.length }
}
