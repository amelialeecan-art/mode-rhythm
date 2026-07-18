/* =====================================================================
   MODE · 에피소드 시간 분석 원시 함수 (순수 함수 · 4단계)
   고정 날짜 구간(전날/3일/7일 enum) 대신 "연속적 시간 척도"를 다룬다:
   일별 lag, 다중 창 누적, 연속 발생일수, 개인 기준선 대비 편차, 악화 기울기.
   engine은 React/Dexie를 모른다. 입력(시계열 Map) → 숫자 결과.
   ⚠️ 어떤 함수도 anchor(D) '이후' 날짜를 보지 않는다(누수 방지, §12).
   ===================================================================== */
import type { ISODate } from '../data/models'
import { addDaysISO } from './correlation'

/** 시계열: 날짜 → 값(그날 factor 강도/발생 여부/부하 등). 없는 날 = 결측. */
export type DaySeries = Map<ISODate, number>

function mean(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length
}

/** anchor(D) 기준 정확히 lag일 전 값. 결측이면 undefined. */
export function valueAtLag(series: DaySeries, anchor: ISODate, lag: number): number | undefined {
  return series.get(addDaysISO(anchor, -lag))
}

/**
 * anchor(D) 기준 lag 0..maxLag(과거)의 값 [D, D-1, D-2, …]. 결측은 undefined로 자리 유지.
 * 고정 창이 아니라 "연속 lag"를 그대로 노출한다(호출부가 원하는 lag만 골라 씀).
 */
export function lagSeries(series: DaySeries, anchor: ISODate, maxLag: number): (number | undefined)[] {
  const out: (number | undefined)[] = []
  for (let lag = 0; lag <= maxLag; lag++) out.push(valueAtLag(series, anchor, lag))
  return out
}

/**
 * anchor(D) 포함 최근 windowDays일 누적합. 결측일은 0으로 본다(발생 안 함).
 * D 이후는 절대 더하지 않는다.
 */
export function cumulativeValue(series: DaySeries, anchor: ISODate, windowDays: number): number {
  let sum = 0
  for (let lag = 0; lag < windowDays; lag++) sum += valueAtLag(series, anchor, lag) ?? 0
  return sum
}

/** 여러 시간척도(기본 2/3/5/7일) 누적을 한 번에. 키 = 창 길이. */
export function cumulativeWindows(
  series: DaySeries,
  anchor: ISODate,
  windows: number[] = [2, 3, 5, 7],
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const w of windows) out[w] = cumulativeValue(series, anchor, w)
  return out
}

/**
 * anchor에서 과거로 "연속으로 발생(값 ≥ threshold)"한 일수.
 * 결측이나 threshold 미만을 만나면 멈춘다. anchor 당일부터 센다.
 * (집 지저분/공간 답답 같은 "연속 노출" 요인용 — §15 cumulative/연속.)
 */
export function consecutiveOccurrence(series: DaySeries, anchor: ISODate, threshold = 1): number {
  let count = 0
  for (let lag = 0; ; lag++) {
    const v = valueAtLag(series, anchor, lag)
    if (v === undefined || v < threshold) break
    count++
  }
  return count
}

/**
 * 개인 기준선 대비 편차 = (anchor 값) − (직전 baselineDays 평균).
 * baseline은 anchor '이전'(D-1..D-baselineDays)의 존재하는 값만 평균한다(D 미포함, 누수 없음).
 * anchor 값 결측이면 undefined. baseline 표본 없으면 편차는 anchor 값 그대로(기준선 0 취급).
 */
export function baselineDeviation(
  series: DaySeries,
  anchor: ISODate,
  baselineDays = 30,
): { value: number; baseline: number; deviation: number; baselineCount: number } | undefined {
  const value = series.get(anchor)
  if (value === undefined) return undefined
  const past: number[] = []
  for (let lag = 1; lag <= baselineDays; lag++) {
    const v = valueAtLag(series, anchor, lag)
    if (v !== undefined) past.push(v)
  }
  const baseline = mean(past)
  return { value, baseline, deviation: value - baseline, baselineCount: past.length }
}

/**
 * 악화 기울기: anchor 포함 과거 spanDays일의 선형 추세(하루당 변화량, 미래 방향 +).
 * 존재하는 점만 사용(x = -lag, 즉 과거일수록 작다). 점이 2개 미만이면 0.
 * 양수 = anchor로 갈수록 값이 오르는(악화되는) 추세.
 */
export function worseningSlope(series: DaySeries, anchor: ISODate, spanDays: number): number {
  const xs: number[] = []
  const ys: number[] = []
  for (let lag = 0; lag < spanDays; lag++) {
    const v = valueAtLag(series, anchor, lag)
    if (v !== undefined) {
      xs.push(-lag)
      ys.push(v)
    }
  }
  const n = xs.length
  if (n < 2) return 0
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}
