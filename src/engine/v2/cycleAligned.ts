/* =====================================================================
   MODE · V2 분석 · cycle-aligned retrospective (순수 함수)
   실제 periodStart를 D0로 놓고 "이미 완료된" 여러 cycle을 겹친다.
   ⚠️ 미래 생리를 모르는 현재 시점 forecast가 아니다 — 이미 발생한 다음
      생리 기준의 사후(retrospective) 분석이다.
   ⚠️ physicalHunger / craving / bingeUrge는 절대 합치지 않는다(metric별 호출).
   ===================================================================== */
import { mean, sd } from './descriptive'
import { scoreV2Confidence, type V2Confidence } from './confidence'
import { tPValueTwoSided } from './pvalue'
import { benjaminiHochberg } from './fdr'
import { getRelativeDayToNextPeriod } from '../cycle'
import type { DailyValueSeries } from './dataset'
import type { ISODate } from '../../data/models'

/** cycle 상대일 window (음수/0, 포함). 예: D-7~D-1 → {fromDay:-7, toDay:-1}. */
export interface CycleWindow {
  label: string
  fromDay: number
  toDay: number
}

export const PREMENSTRUAL_WINDOW: CycleWindow = { label: 'D-7~D-1', fromDay: -7, toDay: -1 }

/** 정렬된 관찰 1건: 상대일 + 소속 cycle(anchor start) + 값. */
export interface AlignedObservation {
  relativeDay: number
  cycleKey: ISODate // 이 관찰이 향하는 실제 다음 periodStart
  value: number
}

const MIN_LOOKBACK = -20
const MAX_LOOKAHEAD = 3

/**
 * metric 시계열을 완료된 cycle에 정렬한다.
 * - 실제 다음 periodStart 기준 상대일(getRelativeDayToNextPeriod).
 * - anchor가 "이전 시작이 있는" 완료 cycle이어야 한다(첫 시작 이전 날짜/현재 미완료 cycle 제외).
 */
export function alignToCycles(series: DailyValueSeries, cycleStarts: ISODate[]): AlignedObservation[] {
  const starts = [...cycleStarts].sort()
  if (starts.length < 2) return []
  const validAnchors = new Set(starts.slice(1)) // 첫 시작은 이전 cycle이 없어 제외
  const out: AlignedObservation[] = []
  for (const point of series) {
    const rel = getRelativeDayToNextPeriod(point.date, starts)
    if (rel.day === null || rel.anchorStart === null) continue // 현재 미완료 cycle 등 → 제외
    if (!validAnchors.has(rel.anchorStart)) continue
    if (rel.day < MIN_LOOKBACK || rel.day > MAX_LOOKAHEAD) continue
    out.push({ relativeDay: rel.day, cycleKey: rel.anchorStart, value: point.value })
  }
  return out
}

/** 완료된 cycle 수(연속 periodStart 쌍). */
export function completedCycleCount(cycleStarts: ISODate[]): number {
  return Math.max(0, new Set(cycleStarts).size - 1)
}

export interface CycleWindowResult {
  status: 'ok' | 'insufficient'
  window: CycleWindow
  /** window에 관찰이 있는 완료 cycle 수. */
  usableCycleCount: number
  /** window 안 총 관찰 수. */
  observations: number
  /** 개인·cycle baseline 대비 평균 차이(점). "+2.3" */
  baselineDifference: number
  /** 표시용 실측 평균: 각 cycle 자기 baseline의 across-cycle 평균("평소" 수준). 없으면 NaN.
   *  ⚠️ 새 통계가 아니라 이미 쓰는 관찰의 descriptive mean이다. windowMean = baselineMean + baselineDifference. */
  baselineMean: number
  /** 표시용 실측 평균: window(예: 생리 전) 값의 across-cycle 평균("이때" 수준). 없으면 NaN. */
  windowMean: number
  /** 표준화 효과크기(cycle 단위 diff의 one-sample d). */
  effectSize: number
  /** 불확실성(cycle 단위 across-cycle). 불가면 null. */
  ci: { lo: number; hi: number } | null
  ciExcludesZero: boolean
  /** 같은 방향(부호)인 cycle 수 / usableCycleCount. "4/4 cycles 같은 방향" */
  sameDirectionCycleCount: number
  /** across-cycle one-sample t 양측 p (탐색). family FDR 전. */
  rawP: number
  /** metric family FDR 적용 후 q. 미적용이면 null. */
  adjustedQ: number | null
  fdrPassed: boolean
  /** window 커버리지(관찰/이론최대). */
  coverageRate: number
  /** 개인·cycle baseline을 뺀 within-person 보정 여부. */
  adjusted: boolean
  confidence: V2Confidence
  /** 각 cycle의 (window mean - 그 cycle baseline) — 반복성 근거. */
  perCycleDiffs: number[]
  note: string
}

export interface CycleAlignedOptions {
  minCycles?: number // 최소 완료 cycle(기본 3)
  minCycleDays?: number // cycle baseline 계산에 필요한 최소 일수(기본 4)
}

const NOTE = '이미 완료된 주기의 사후 정렬 분석이야. 원인이라고 단정하지 않아.'

/**
 * 특정 metric의 cycle window(예: D-7~D-1) 결과.
 * 각 cycle의 자기 baseline(그 cycle의 전체 평균)을 빼서 within-person 보정한다.
 * cycle을 독립 단위로 across-cycle 통계 → within-cycle 자기상관에 의한 가짜 정밀도 회피.
 */
export function cycleWindowAssociation(
  series: DailyValueSeries,
  cycleStarts: ISODate[],
  window: CycleWindow = PREMENSTRUAL_WINDOW,
  opts: CycleAlignedOptions = {},
): CycleWindowResult {
  const minCycles = opts.minCycles ?? 3
  const minCycleDays = opts.minCycleDays ?? 4
  const aligned = alignToCycles(series, cycleStarts)

  // cycle별 그룹
  const byCycle = new Map<ISODate, AlignedObservation[]>()
  for (const a of aligned) {
    const arr = byCycle.get(a.cycleKey) ?? []
    arr.push(a)
    byCycle.set(a.cycleKey, arr)
  }

  const perCycleDiffs: number[] = []
  const perCycleBaselines: number[] = [] // 표시용(각 cycle 자기 평균)
  const perCycleWindowMeans: number[] = [] // 표시용(각 cycle window 평균)
  let observations = 0
  for (const [, obs] of byCycle) {
    if (obs.length < minCycleDays) continue // 그 cycle에 자료가 너무 적으면 baseline 불안정 → 제외
    const windowVals = obs.filter((o) => o.relativeDay >= window.fromDay && o.relativeDay <= window.toDay).map((o) => o.value)
    if (windowVals.length === 0) continue
    const cycleBaseline = mean(obs.map((o) => o.value)) // 그 cycle 자기 평균
    const cycleWindowMean = mean(windowVals)
    perCycleDiffs.push(cycleWindowMean - cycleBaseline)
    perCycleBaselines.push(cycleBaseline)
    perCycleWindowMeans.push(cycleWindowMean)
    observations += windowVals.length
  }

  const usableCycleCount = perCycleDiffs.length
  const windowLen = window.toDay - window.fromDay + 1
  // 표시용 실측 평균(descriptive). 기존 계산값에는 영향 없음. windowMean = baselineMean + baselineDifference.
  const baselineMean = usableCycleCount > 0 ? mean(perCycleBaselines) : NaN
  const windowMean = usableCycleCount > 0 ? mean(perCycleWindowMeans) : NaN

  const base: CycleWindowResult = {
    status: 'insufficient',
    window,
    usableCycleCount,
    observations,
    baselineDifference: NaN,
    baselineMean,
    windowMean,
    effectSize: NaN,
    ci: null,
    ciExcludesZero: false,
    sameDirectionCycleCount: 0,
    rawP: 1,
    adjustedQ: null,
    fdrPassed: false,
    coverageRate: usableCycleCount > 0 ? observations / (usableCycleCount * windowLen) : 0,
    adjusted: true,
    confidence: 'insufficient',
    perCycleDiffs,
    note: NOTE,
  }
  if (usableCycleCount < minCycles) return base

  const diffMean = mean(perCycleDiffs)
  const diffSd = sd(perCycleDiffs)
  const effectSize = Number.isFinite(diffSd) && diffSd > 0 ? diffMean / diffSd : 0
  const sameDir = perCycleDiffs.filter((d) => Math.sign(d) === Math.sign(diffMean) && d !== 0).length

  // across-cycle 정규 근사 CI (cycle을 독립 단위로). n 작으므로 근사임을 감안.
  let ci: { lo: number; hi: number } | null = null
  let ciExcludesZero = false
  let rawP = 1
  if (Number.isFinite(diffSd) && diffSd > 0) {
    const se = diffSd / Math.sqrt(usableCycleCount)
    ci = { lo: diffMean - 1.96 * se, hi: diffMean + 1.96 * se }
    ciExcludesZero = Math.sign(ci.lo) === Math.sign(ci.hi) && ci.lo !== 0
    rawP = tPValueTwoSided(diffMean / se, usableCycleCount - 1) // one-sample t
  } else if (Number.isFinite(diffSd) && diffSd === 0 && diffMean !== 0) {
    // 모든 cycle이 동일 방향·동일 크기 → 매우 일관적. 근사 CI/ p는 보수적으로.
    ci = { lo: diffMean, hi: diffMean }
    ciExcludesZero = diffMean !== 0
    rawP = 0.001
  }

  const confidence = scoreV2Confidence({
    n: observations,
    coverageRate: base.coverageRate,
    effectMagnitude: effectSize,
    directionConsistency: usableCycleCount > 0 ? sameDir / usableCycleCount : 0,
    uncertaintyAvailable: ci !== null,
    ciExcludesZero,
    fdrPassed: undefined, // 서비스에서 metric family FDR 적용
    adjustedAvailable: true,
  }).level

  return {
    ...base,
    status: 'ok',
    baselineDifference: diffMean,
    effectSize,
    ci,
    ciExcludesZero,
    sameDirectionCycleCount: sameDir,
    rawP,
    confidence,
  }
}

/** metric family에 BH FDR을 적용하고 confidence를 재계산한다(라벨 유지). */
export function applyCycleFamilyFdr<T extends { metric: string; result: CycleWindowResult }>(
  entries: T[],
  alpha = 0.1,
): T[] {
  const ok = entries.filter((e) => e.result.status === 'ok')
  if (ok.length === 0) return entries
  const fdr = benjaminiHochberg(ok.map((e) => e.result.rawP), alpha)
  let k = 0
  return entries.map((e) => {
    if (e.result.status !== 'ok') return e
    const q = fdr.q[k]
    const passed = fdr.rejected[k]
    k++
    const r = e.result
    const confidence = scoreV2Confidence({
      n: r.observations,
      coverageRate: r.coverageRate,
      effectMagnitude: r.effectSize,
      directionConsistency: r.usableCycleCount > 0 ? r.sameDirectionCycleCount / r.usableCycleCount : 0,
      uncertaintyAvailable: r.ci !== null,
      ciExcludesZero: r.ciExcludesZero,
      fdrPassed: passed,
      adjustedAvailable: true,
    }).level
    return { ...e, result: { ...r, adjustedQ: q, fdrPassed: passed, confidence } }
  })
}

/* ---------------------------------------------------------------------
   상대일 곡선 (UI 그래프용) — 각 relativeDay의 across-cycle 평균 diff
   --------------------------------------------------------------------- */
export interface CycleProfilePoint {
  relativeDay: number
  meanDiff: number // across-cycle 평균(그 날 값 - 각 cycle baseline)
  cycleCount: number
  observations: number
}

export function cycleAlignedProfile(
  series: DailyValueSeries,
  cycleStarts: ISODate[],
  opts: CycleAlignedOptions = {},
): CycleProfilePoint[] {
  const minCycleDays = opts.minCycleDays ?? 4
  const aligned = alignToCycles(series, cycleStarts)
  const byCycle = new Map<ISODate, AlignedObservation[]>()
  for (const a of aligned) {
    const arr = byCycle.get(a.cycleKey) ?? []
    arr.push(a)
    byCycle.set(a.cycleKey, arr)
  }
  // relativeDay → per-cycle diffs
  const byDay = new Map<number, number[]>()
  for (const [, obs] of byCycle) {
    if (obs.length < minCycleDays) continue
    const cycleBaseline = mean(obs.map((o) => o.value))
    for (const o of obs) {
      const arr = byDay.get(o.relativeDay) ?? []
      arr.push(o.value - cycleBaseline)
      byDay.set(o.relativeDay, arr)
    }
  }
  return [...byDay.entries()]
    .map(([relativeDay, diffs]) => ({ relativeDay, meanDiff: mean(diffs), cycleCount: diffs.length, observations: diffs.length }))
    .sort((a, b) => a.relativeDay - b.relativeDay)
}
