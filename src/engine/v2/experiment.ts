/* =====================================================================
   MODE · V2 분석 · N-of-1 실험 결과 (순수 함수)
   baseline 구간과 intervention 구간을 비교한다.
   ⚠️ "효과가 입증됨" 류 단정 문구를 만들지 않는다. 관찰 비교일 뿐이다.
   ===================================================================== */
import { mean, sd } from './descriptive'
import { scoreV2Confidence, type V2Confidence } from './confidence'

export interface ExperimentAnalysisInput {
  baselineValues: number[] // baseline 구간 targetMetric 관찰값(숫자만)
  interventionValues: number[] // intervention 구간 관찰값(숫자만)
  plannedBaselineDays: number
  plannedInterventionDays: number
}

export interface ExperimentAnalysis {
  status: 'ok' | 'insufficient'
  baselineN: number
  interventionN: number
  /** 분석에 실제 쓰인 표본 수(baseline+intervention의 숫자 관찰). 순응도가 아니다. */
  usableObservations: number
  baselineMean: number
  interventionMean: number
  /** intervention - baseline (targetMetric 단위). */
  effectDifference: number
  /** 표준화 효과(pooled sd 기준). */
  standardizedEffect: number
  /**
   * target metric 기록 커버리지 = 숫자 관찰 일수 / 계획 일수(두 구간 합).
   * ⚠️ 이것은 "개입을 실제로 지켰는가(behavioral adherence)"가 아니라 "기록이 얼마나 있었나"다.
   *    순응도로 표시하면 안 된다 — UI는 "기록률"로만 노출한다.
   */
  loggingCoverage: number
  /**
   * 실제 개입 행동 준수율(behavioral adherence). intervention code별 구조화된 준수 데이터가
   * 있어야 계산 가능하다. 현재는 그런 데이터가 없어 항상 null(unavailable)이다.
   * ⚠️ loggingCoverage(기록률)를 adherence로 대체하지 않는다.
   */
  adherence: number | null
  /** 두 그룹 평균차 CI(정규 근사). 불가하면 null. */
  ci: { lo: number; hi: number } | null
  ciExcludesZero: boolean
  confidence: V2Confidence
  note: string
}

const NOTE = '실험 구간 비교예요. 짧은 개인 실험은 다른 변화의 영향을 받을 수 있어 참고로만 봐요.'
const MIN_PER_GROUP = 5

/**
 * baseline vs intervention 평균 비교. Welch 근사 SE로 CI.
 * ⚠️ 인과 단정/효과 입증 표현을 만들지 않는다.
 */
export function analyzeExperiment(input: ExperimentAnalysisInput): ExperimentAnalysis {
  const b = input.baselineValues
  const i = input.interventionValues
  const baselineN = b.length
  const interventionN = i.length
  const usableObservations = baselineN + interventionN
  const plannedTotal = Math.max(1, input.plannedBaselineDays + input.plannedInterventionDays)
  // 기록 커버리지(logging coverage) — 계획 일수 대비 숫자 관찰이 얼마나 있었나. 순응도가 아니다.
  const loggingCoverage = Math.min(1, usableObservations / plannedTotal)
  // 실제 행동 준수(adherence)는 구조화된 준수 데이터가 없으므로 계산하지 않는다(unavailable).
  const adherence: number | null = null

  const base: ExperimentAnalysis = {
    status: 'insufficient',
    baselineN,
    interventionN,
    usableObservations,
    baselineMean: baselineN ? mean(b) : NaN,
    interventionMean: interventionN ? mean(i) : NaN,
    effectDifference: NaN,
    standardizedEffect: NaN,
    loggingCoverage,
    adherence,
    ci: null,
    ciExcludesZero: false,
    confidence: 'insufficient',
    note: NOTE,
  }

  if (baselineN < MIN_PER_GROUP || interventionN < MIN_PER_GROUP) return base

  const mb = mean(b)
  const mi = mean(i)
  const diff = mi - mb
  const sb = sd(b)
  const si = sd(i)
  const pooled = Math.sqrt((sb ** 2 + si ** 2) / 2)
  const standardizedEffect = Number.isFinite(pooled) && pooled > 0 ? diff / pooled : 0

  // Welch 근사 SE (두 독립 그룹). 관측 자기상관이 있으면 보수적으로 넓게 보는 게 안전하나
  // 여기선 근사 CI로 두고 confidence 규칙이 과신을 막는다.
  const seB = sb > 0 ? (sb ** 2) / baselineN : 0
  const seI = si > 0 ? (si ** 2) / interventionN : 0
  const se = Math.sqrt(seB + seI)
  let ci: { lo: number; hi: number } | null = null
  let ciExcludesZero = false
  if (se > 0) {
    ci = { lo: diff - 1.96 * se, hi: diff + 1.96 * se }
    ciExcludesZero = Math.sign(ci.lo) === Math.sign(ci.hi) && ci.lo !== 0
  }

  const confidence = scoreV2Confidence({
    n: usableObservations,
    coverageRate: loggingCoverage,
    effectMagnitude: standardizedEffect,
    directionConsistency: 0.5, // 단일 실험은 반복성 근거가 약함 → 보수적
    uncertaintyAvailable: ci !== null,
    ciExcludesZero,
    fdrPassed: undefined,
    adjustedAvailable: false,
  }).level

  return {
    ...base,
    status: 'ok',
    effectDifference: diff,
    standardizedEffect,
    ci,
    ciExcludesZero,
    confidence,
  }
}
