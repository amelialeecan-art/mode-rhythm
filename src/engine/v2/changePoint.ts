/* =====================================================================
   MODE · V2 분석 · baseline 수준 변화 후보 탐지 (보수적, 순수)
   ⚠️ "이 날짜부터 원인이 바뀌었다"고 하지 않는다.
      "baseline level 변화 후보"로만 표현한다.
   ===================================================================== */
import { mean, sd } from './descriptive'

export interface LinearTrend {
  slopePerStep: number // 인덱스 1 증가당 기울기
  intercept: number
  available: boolean // n>=3 여부
}

/** 시간(인덱스) 대비 선형 추세(최소제곱). x는 0..n-1. */
export function linearDateTrend(series: number[]): LinearTrend {
  const n = series.length
  if (n < 3) return { slopePerStep: 0, intercept: n ? mean(series) : NaN, available: false }
  const xbar = (n - 1) / 2
  const ybar = mean(series)
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xbar) * (series[i] - ybar)
    den += (i - xbar) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  return { slopePerStep: slope, intercept: ybar - slope * xbar, available: true }
}

/** 최근 window 이동 baseline(평균). 반환 길이 = series 길이(앞쪽은 가능한 만큼만). */
export function rollingBaseline(series: number[], window: number): number[] {
  const w = Math.max(1, window)
  return series.map((_, i) => {
    const start = Math.max(0, i - w + 1)
    return mean(series.slice(start, i + 1))
  })
}

export interface ShiftCandidate {
  /** baseline 수준 변화 후보가 있는가(보수적 임계 통과). */
  isCandidate: boolean
  /** 변화 후보 인덱스(그 지점부터 두 번째 구간). null이면 없음. */
  index: number | null
  /** 표준화된 수준 차이(|Δmean|/pooled sd). */
  standardizedShift: number
  beforeMean: number
  afterMean: number
}

export interface ShiftOptions {
  minSegment?: number // 각 구간 최소 길이 (기본 7)
  threshold?: number // 표준화 차이 임계 (기본 1.0 — 보수적)
}

/**
 * 단일 baseline 수준 변화 후보를 보수적으로 찾는다.
 * 모든 분할을 훑되(그리드), 표준화 평균차가 최대인 지점을 후보로 두고
 * 보수적 임계를 넘을 때만 isCandidate=true. (인과·정확한 시점 단정 아님)
 */
export function detectBaselineShift(series: number[], opts: ShiftOptions = {}): ShiftCandidate {
  const minSeg = opts.minSegment ?? 7
  const threshold = opts.threshold ?? 1.0
  const n = series.length
  const none: ShiftCandidate = { isCandidate: false, index: null, standardizedShift: 0, beforeMean: NaN, afterMean: NaN }
  if (n < minSeg * 2) return none

  // 모든 분할에 동일한 분모(전체 series sd)를 써서 정규화한다.
  // pooled sd를 분할마다 쓰면 한쪽이 상수인 지점에서 분모가 작아져 가짜로 커진다.
  const overallSd = sd(series)
  if (!Number.isFinite(overallSd) || overallSd === 0) return none
  let best = none
  let bestShift = 0
  for (let split = minSeg; split <= n - minSeg; split++) {
    const before = series.slice(0, split)
    const after = series.slice(split)
    const shift = Math.abs(mean(after) - mean(before)) / overallSd
    if (shift > bestShift) {
      bestShift = shift
      best = {
        isCandidate: shift >= threshold,
        index: split,
        standardizedShift: shift,
        beforeMean: mean(before),
        afterMean: mean(after),
      }
    }
  }
  return best
}
