/* =====================================================================
   MODE · V2 분석 · 고수준 association 분석 (순수 함수)
   관찰 데이터이므로 인과가 아니라 association/temporal association/repeated
   pattern/candidate/adjusted association으로 표현한다.
   ===================================================================== */
import { cohensDPaired, mean, meanDifference, pearson, spearman } from './descriptive'
import { linearRegression, type RegressionOk } from './regression'
import { tPValueTwoSided } from './pvalue'
import { benjaminiHochberg } from './fdr'
import { movingBlockBootstrapCI, type BootstrapCI } from './bootstrap'
import { scoreV2Confidence, type V2Confidence } from './confidence'
import {
  buildAlignedTable,
  alignLagged,
  type DailyValueSeries,
  type MorningEveningPair,
  type PredictorSpec,
} from './dataset'

const ASSOCIATION_NOTE = '관찰 데이터의 association이야. 원인이라고 단정하지 않아.'

/* ---------------------------------------------------------------------
   방향 일치(반복성) — 여러 시간 블록에서 같은 방향인지
   --------------------------------------------------------------------- */
export function directionConsistency(x: number[], y: number[], blocks = 3): number {
  const n = Math.min(x.length, y.length)
  const overall = pearson(x.slice(0, n), y.slice(0, n))
  if (overall === null || overall === 0) return 0
  const sign = Math.sign(overall)
  const size = Math.floor(n / blocks)
  if (size < 3) return overall !== null ? 1 : 0 // 블록화 불가 → 단일 방향으로 간주
  let match = 0
  let valid = 0
  for (let b = 0; b < blocks; b++) {
    const s = b * size
    const e = b === blocks - 1 ? n : s + size
    const r = pearson(x.slice(s, e), y.slice(s, e))
    if (r === null || r === 0) continue
    valid++
    if (Math.sign(r) === sign) match++
  }
  return valid === 0 ? 0 : match / valid
}

/* ---------------------------------------------------------------------
   B. 같은 날 탐색 association (Spearman) — exploratory only
   --------------------------------------------------------------------- */
export interface ExploratoryAssociation {
  n: number
  spearman: number | null
  pearson: number | null
  note: string
  exploratory: true
}

export function sameDayAssociation(xSeries: DailyValueSeries, ySeries: DailyValueSeries): ExploratoryAssociation {
  const { x, y } = alignLagged(xSeries, ySeries, 0)
  return {
    n: x.length,
    spearman: spearman(x, y),
    pearson: pearson(x, y),
    note: `탐색용(Spearman) — ${ASSOCIATION_NOTE}`,
    exploratory: true,
  }
}

/* ---------------------------------------------------------------------
   C. Morning → Evening 변화 요약
   --------------------------------------------------------------------- */
export interface MorningEveningSummary {
  n: number
  meanDelta: number // evening - morning 평균
  standardizedEffect: number // cohen d (delta vs 0)
  ci: { lo: number; hi: number } | null
  direction: 'increase' | 'decrease' | 'none'
  note: string
}

export function morningEveningSummary(pairs: MorningEveningPair[]): MorningEveningSummary {
  const deltas = pairs.map((p) => p.delta)
  const morning = pairs.map((p) => p.morning)
  const evening = pairs.map((p) => p.evening)
  const md = deltas.length ? mean(deltas) : NaN
  const d = cohensDPaired(evening, morning)
  const boot = movingBlockBootstrapCI(deltas.length, (idx) => meanDifference(idx.map((i) => evening[i]), idx.map((i) => morning[i])))
  const ci = boot.available ? { lo: boot.lo, hi: boot.hi } : null
  return {
    n: deltas.length,
    meanDelta: md,
    standardizedEffect: d,
    ci,
    direction: !Number.isFinite(md) || Math.abs(md) < 0.05 ? 'none' : md > 0 ? 'increase' : 'decrease',
    note: ASSOCIATION_NOTE,
  }
}

/* ---------------------------------------------------------------------
   D. Event response / within-day (가장 가까운 전/후 상태 비교)
   ⚠️ 이후에 발생했다는 이유만으로 원인이라 부르지 않는다.
   --------------------------------------------------------------------- */
export interface EventResponseResult {
  supportCount: number // 전/후 상태를 모두 찾은 사건 수
  windowMinutes: number
  meanBefore: number
  meanAfter: number
  meanDelta: number // after - before
  ci: { lo: number; hi: number } | null
  note: string
}

/**
 * 각 event 시각에 대해 window 내 가장 가까운 전 상태와 후 상태를 찾아 비교한다.
 * @param eventTimes event 발생 ISO datetime 목록
 * @param stateSeries {at, value} — outcome metric 관찰(숫자만)
 */
export function eventResponseWithinDay(
  eventTimes: string[],
  stateSeries: { at: string; value: number }[],
  windowMinutes = 240,
): EventResponseResult {
  const states = [...stateSeries]
    .map((s) => ({ t: Date.parse(s.at), value: s.value }))
    .filter((s) => Number.isFinite(s.t))
    .sort((a, b) => a.t - b.t)
  const win = windowMinutes * 60000
  const befores: number[] = []
  const afters: number[] = []
  for (const et of eventTimes) {
    const te = Date.parse(et)
    if (!Number.isFinite(te)) continue
    let before: number | undefined
    let after: number | undefined
    for (const s of states) {
      if (s.t <= te && te - s.t <= win) before = s.value // 가장 가까운 전(오름차순이라 갱신)
      if (s.t > te && s.t - te <= win && after === undefined) after = s.value // 첫 후
    }
    if (before !== undefined && after !== undefined) {
      befores.push(before)
      afters.push(after)
    }
  }
  const support = befores.length
  const boot = movingBlockBootstrapCI(support, (idx) => meanDifference(idx.map((i) => afters[i]), idx.map((i) => befores[i])))
  return {
    supportCount: support,
    windowMinutes,
    meanBefore: support ? mean(befores) : NaN,
    meanAfter: support ? mean(afters) : NaN,
    meanDelta: support ? meanDifference(afters, befores) : NaN,
    ci: boot.available ? { lo: boot.lo, hi: boot.hi } : null,
    note: `event 전후 window(${windowMinutes}분) 비교 — ${ASSOCIATION_NOTE}`,
  }
}

/* ---------------------------------------------------------------------
   E/F/G/H/J/K/L. Lagged adjusted association
   --------------------------------------------------------------------- */
export interface AssociationResult {
  label: string
  lag: number
  n: number
  status: 'ok' | 'insufficient' | 'singular' | 'constant-or-collinear'
  /** adjusted 노출 계수(단위당). */
  effectEstimate: number
  /** 표준화 효과(비교용). */
  standardizedEffect: number
  /** unadjusted 단순 계수(비교용). */
  unadjustedEstimate: number
  direction: 'positive' | 'negative' | 'none'
  ci: { lo: number; hi: number } | null // bootstrap 불확실성(불가면 null)
  ciExcludesZero: boolean
  rawP: number
  adjustedQ: number | null // FDR (family 적용 후 채워짐)
  fdrPassed: boolean
  adjusted: boolean
  adjustedForPrevOutcome: boolean
  confounders: string[]
  directionConsistency: number
  droppedRows: number
  confidence: V2Confidence
  notes: string[]
}

export interface LaggedAnalysisInput {
  label: string
  outcome: DailyValueSeries
  exposure: DailyValueSeries
  lag: number
  /** 사전 정의된 작은 confounder 세트(자동 전량 투입 금지). */
  confounders?: PredictorSpec[]
  includePrevY?: boolean
  bootstrapSeed?: number
  coverageRate?: number
}

function exposureCoefFromFit(fit: RegressionOk): { est: number; std: number; t: number } {
  return { est: fit.coefficients[1], std: fit.standardizedCoefficients[0], t: fit.tStats[1] }
}

/**
 * y(t) ~ exposure(t-lag) + [confounders] + [y(t-1)] 회귀로 adjusted association 추정.
 * - 이전 outcome 보정(includePrevY): 전날부터 나빴던 영향을 일부 분리.
 * - confounder는 사전 정의된 작은 세트만.
 * - bootstrap(이동블록)으로 시계열 친화 CI. 불가면 CI null.
 * - FDR은 family 단위(analyzeLagFamily)에서 채운다.
 */
export function laggedAdjustedAssociation(input: LaggedAnalysisInput): AssociationResult {
  const confounders = input.confounders ?? []
  const includePrevY = input.includePrevY ?? false
  const predictors: PredictorSpec[] = [{ name: 'exposure', series: input.exposure, lag: input.lag }, ...confounders]
  const table = buildAlignedTable(input.outcome, predictors, { includePrevY })
  const n = table.y.length
  const confounderNames = confounders.map((c) => c.name)

  const base: AssociationResult = {
    label: input.label,
    lag: input.lag,
    n,
    status: 'ok',
    effectEstimate: NaN,
    standardizedEffect: NaN,
    unadjustedEstimate: NaN,
    direction: 'none',
    ci: null,
    ciExcludesZero: false,
    rawP: 1,
    adjustedQ: null,
    fdrPassed: false,
    adjusted: confounders.length > 0 || includePrevY,
    adjustedForPrevOutcome: includePrevY,
    confounders: confounderNames,
    directionConsistency: 0,
    droppedRows: 0,
    confidence: 'insufficient',
    notes: [ASSOCIATION_NOTE],
  }

  const fit = linearRegression(table.y, table.X)
  if (!fit.ok) {
    const status: AssociationResult['status'] =
      fit.reason === 'singular' ? 'singular' : fit.reason === 'constant-or-collinear' ? 'constant-or-collinear' : 'insufficient'
    return { ...base, status, n: fit.n ?? n }
  }

  const { est, std, t } = exposureCoefFromFit(fit)
  const df = fit.n - (fit.k + 1)
  const rawP = tPValueTwoSided(t, df)

  // unadjusted 비교(단순 y~exposure)
  const simpleTable = buildAlignedTable(input.outcome, [{ name: 'exposure', series: input.exposure, lag: input.lag }])
  const simpleFit = linearRegression(simpleTable.y, simpleTable.X)
  const unadjusted = simpleFit.ok ? simpleFit.coefficients[1] : NaN

  // bootstrap CI on adjusted exposure coefficient (이동블록)
  const boot: BootstrapCI = movingBlockBootstrapCI(
    fit.n,
    (idx) => {
      const yr = idx.map((i) => table.y[i])
      const Xr = idx.map((i) => table.X[i])
      const f = linearRegression(yr, Xr)
      return f.ok ? f.coefficients[1] : NaN
    },
    { seed: input.bootstrapSeed },
  )
  const ci = boot.available ? { lo: boot.lo, hi: boot.hi } : null
  const ciExcludesZero = ci !== null && Math.sign(ci.lo) === Math.sign(ci.hi) && ci.lo !== 0

  // 반복성: exposure 열 vs y (시간 블록 방향 일치)
  const expCol = table.X.map((r) => r[0])
  const dirConsistency = directionConsistency(expCol, table.y)

  const direction: AssociationResult['direction'] =
    !Number.isFinite(est) || Math.abs(std) < 0.02 ? 'none' : est > 0 ? 'positive' : 'negative'

  const confidence = scoreV2Confidence({
    n: fit.n,
    coverageRate: input.coverageRate,
    effectMagnitude: std,
    directionConsistency: dirConsistency,
    uncertaintyAvailable: boot.available,
    ciExcludesZero,
    fdrPassed: false, // family에서 갱신
    adjustedAvailable: base.adjusted,
  }).level

  return {
    ...base,
    status: 'ok',
    n: fit.n,
    droppedRows: fit.droppedRows,
    effectEstimate: est,
    standardizedEffect: std,
    unadjustedEstimate: unadjusted,
    direction,
    ci,
    ciExcludesZero,
    rawP,
    directionConsistency: dirConsistency,
    confidence,
    notes: [
      ASSOCIATION_NOTE,
      includePrevY ? '전날 상태(y(t-1))를 보정했어.' : '전날 상태 보정 없음.',
      confounderNames.length ? `보정 변수: ${confounderNames.join(', ')}` : '추가 보정 변수 없음.',
    ],
  }
}

/**
 * 같은 노출→결과에 대해 사전 정의된 lag 집합(예: 0,1,2,3)을 모두 분석하고
 * family에 FDR을 적용한다. 가장 큰 것만 남기는 cherry-picking을 하지 않고
 * 모든 lag 결과를 반환하되 adjustedQ/fdrPassed로 표시한다.
 */
export function analyzeLagFamily(
  base: Omit<LaggedAnalysisInput, 'lag'>,
  lags: number[],
  alpha = 0.1,
): AssociationResult[] {
  const results = lags.map((lag) => laggedAdjustedAssociation({ ...base, lag }))
  const okResults = results.filter((r) => r.status === 'ok')
  if (okResults.length === 0) return results
  const fdr = benjaminiHochberg(okResults.map((r) => r.rawP), alpha)
  let k = 0
  return results.map((r) => {
    if (r.status !== 'ok') return r
    const q = fdr.q[k]
    const passed = fdr.rejected[k]
    k++
    const confidence = scoreV2Confidence({
      n: r.n,
      coverageRate: base.coverageRate,
      effectMagnitude: r.standardizedEffect,
      directionConsistency: r.directionConsistency,
      uncertaintyAvailable: r.ci !== null,
      ciExcludesZero: r.ciExcludesZero,
      fdrPassed: passed,
      adjustedAvailable: r.adjusted,
    }).level
    return { ...r, adjustedQ: q, fdrPassed: passed, confidence }
  })
}

/** 결과에서 '보고할 만한'(insufficient 아님) 것만, 신뢰도/효과 순으로. */
export function rankAssociations(results: AssociationResult[]): AssociationResult[] {
  const order: Record<V2Confidence, number> = { insufficient: 0, exploratory: 1, tentative: 2, moderate: 3, strong: 4 }
  return [...results]
    .filter((r) => r.status === 'ok' && r.confidence !== 'insufficient')
    .sort((a, b) => order[b.confidence] - order[a.confidence] || Math.abs(b.standardizedEffect) - Math.abs(a.standardizedEffect))
}
