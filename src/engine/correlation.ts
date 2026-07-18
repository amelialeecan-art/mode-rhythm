/* =====================================================================
   MODE · 상관/패턴 분석 엔진 (순수 함수)
   "내 기록에서 반복적으로 함께 나타나는 경향"을 찾는다. 인과 단정 금지.
   engine은 React/Dexie/repository를 모른다. 입력(맵/배열) → 결과 객체.
   주의: 시간창 분석에서 결과 날짜 D 이후의 데이터를 요인으로 쓰지 않는다(누수 방지).
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate, toISODate } from '../lib/date'
import { clamp, roundScore } from './guards'

/** 분석 대상 metric (회복은 제외 — 회복 효과 분석은 7단계). */
export type AnalysisMetric = 'emotional' | 'appetite' | 'sleep' | 'body' | 'cycle' | 'event' | 'rhythm'

// 사용자 표시용 라벨 (내부 metric 키는 그대로). "부하" 대신 이해하기 쉬운 말.
export const ANALYSIS_METRIC_LABEL: Record<AnalysisMetric, string> = {
  emotional: '감정 흔들림',
  appetite: '식욕 흔들림',
  sleep: '수면 문제 정도',
  body: '몸 불편',
  cycle: '주기 영향',
  event: '사건 기록',
  rhythm: '오늘의 버거움',
}

export type EffectWindow = 'same_day' | 'previous_day' | 'recent_3_days' | 'recent_7_days'

/** 요인이 있었던 시점 → 결과를 보는 날(D)의 관계 표현. */
const WINDOW_PHRASE: Record<EffectWindow, string> = {
  same_day: '있었던 날',
  previous_day: '있었던 다음날',
  recent_3_days: '있었던 뒤 며칠 동안',
  recent_7_days: '있었던 그 주에',
}

/**
 * 자료 충분도 등급 (표시용). ⚠️ 통계적 유의확률/인과 신뢰도가 아니라
 * "이 앱이 얼마나 많은 기록으로 비교했는지"를 나타내는 내부 지표다.
 * 그래서 '가능성 있음/유력 후보/반복 패턴 강함' 같은 확신 표현을 쓰지 않는다.
 */
export type EvidenceLevel = 'reference' | 'early' | 'repeated' | 'sufficient'

export const EVIDENCE_LEVEL_LABEL: Record<EvidenceLevel, string> = {
  reference: '참고 수준',
  early: '초기 관찰',
  repeated: '반복 관찰',
  sufficient: '자료 충분',
}

const EVIDENCE_ORDER: EvidenceLevel[] = ['reference', 'early', 'repeated', 'sufficient']

/** level을 max 이하로 제한. */
function capEvidence(level: EvidenceLevel, max: EvidenceLevel): EvidenceLevel {
  return EVIDENCE_ORDER.indexOf(level) <= EVIDENCE_ORDER.indexOf(max) ? level : max
}

export interface EvidenceInput {
  /** 내부 자료 충분도 점수(0~100). */
  confidence: number
  /** 유효 결과 기록일 수. */
  validOutcomeDayCount: number
  supportCount: number
  comparisonCount: number
}

/**
 * 표시 등급 계산. 내부 confidence를 바탕으로 하되,
 * 유효 결과일 수와 표본 수로 상한을 둔다(적은 데이터에서 최상위 금지).
 */
export function evidenceLevel(i: EvidenceInput): EvidenceLevel {
  let level: EvidenceLevel =
    i.confidence <= 30 ? 'reference' : i.confidence <= 55 ? 'early' : i.confidence <= 75 ? 'repeated' : 'sufficient'

  // 유효 결과일 수 상한: 30~44일 → 최대 초기 관찰, 45~59일 → 최대 반복 관찰
  if (i.validOutcomeDayCount < 45) level = capEvidence(level, 'early')
  else if (i.validOutcomeDayCount < 60) level = capEvidence(level, 'repeated')

  // 60일 이상이어도 support/comparison이 각각 12일 미만이면 최상위(자료 충분) 금지
  if (level === 'sufficient' && (i.supportCount < 12 || i.comparisonCount < 12)) level = 'repeated'

  return level
}

export interface MetricBaseline {
  metric: AnalysisMetric
  mean: number
  count: number
}

export interface FactorEffectResult {
  factorGroup: string
  factorLabel: string
  metric: AnalysisMetric
  window: EffectWindow
  withFactorMean: number
  withoutFactorMean: number
  effectSize: number
  supportCount: number
  comparisonCount: number
  consistency: number
  /** 내부 자료 충분도 점수(0~100). 표시 등급은 service가 evidenceLevel로 계산. */
  confidence: number
  message: string
}

/** 이 window의 사람이 읽을 관계 문구(요인 시점 → 결과일). */
export function windowPhrase(window: EffectWindow): string {
  return WINDOW_PHRASE[window]
}

/** 분석 입력 묶음 (service가 repository에서 모아 만든다). */
export interface AnalysisDataset {
  /** dailyScore가 있는 결과 날짜들(분석창 내, endDate 이하), 오름차순. */
  resultDates: ISODate[]
  /** 날짜 → metric 점수. */
  scoreByDate: Map<ISODate, Record<AnalysisMetric, number>>
  /** 날짜 → 그날 존재한 요인 그룹들(사건 + 주기 자동). 결과 없는 날짜도 포함. */
  factorByDate: Map<ISODate, Set<string>>
  endDate: ISODate
}

// 보수화된 표본 기준: 요인 있는 결과일/없는 결과일 각각 최소 6일.
const MIN_SUPPORT = 6
const MIN_COMPARISON = 6

export function addDaysISO(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/** 최근 days일(endDate 기준) metric 평균. */
export function calcBaseline(ds: AnalysisDataset, metric: AnalysisMetric, days = 30): MetricBaseline {
  const cutoff = addDaysISO(ds.endDate, -(days - 1))
  const vals: number[] = []
  for (const d of ds.resultDates) {
    if (d >= cutoff && d <= ds.endDate) {
      const v = ds.scoreByDate.get(d)?.[metric]
      if (v !== undefined) vals.push(v)
    }
  }
  return { metric, mean: roundScore(mean(vals)), count: vals.length }
}

/** 결과 날짜 D에서 해당 window 기준 요인 존재 여부. D 이후 데이터는 보지 않는다. */
function factorPresentForWindow(
  ds: AnalysisDataset,
  factorGroup: string,
  date: ISODate,
  window: EffectWindow,
): boolean {
  const has = (d: ISODate) => ds.factorByDate.get(d)?.has(factorGroup) ?? false
  switch (window) {
    case 'same_day':
      return has(date)
    case 'previous_day':
      return has(addDaysISO(date, -1))
    case 'recent_3_days': // D-1..D-3 (당일 제외)
      return [1, 2, 3].some((k) => has(addDaysISO(date, -k)))
    case 'recent_7_days': // D-1..D-7 (당일 제외)
      return [1, 2, 3, 4, 5, 6, 7].some((k) => has(addDaysISO(date, -k)))
  }
}

/**
 * 겹침 패널티: 이 요인이 발생한 날들에서 다른 요인이 함께 발생한 최대 비율.
 * 분리하기 어려운 정도를 신뢰도에서 깎는다.
 */
export function computeOverlapPenalty(ds: AnalysisDataset, factorGroup: string): number {
  const occ: Set<string>[] = []
  for (const set of ds.factorByDate.values()) {
    if (set.has(factorGroup)) occ.push(set)
  }
  if (occ.length === 0) return 0
  const others = new Map<string, number>()
  for (const set of occ) {
    for (const g of set) {
      if (g === factorGroup) continue
      others.set(g, (others.get(g) ?? 0) + 1)
    }
  }
  let maxRatio = 0
  for (const count of others.values()) {
    maxRatio = Math.max(maxRatio, count / occ.length)
  }
  if (maxRatio >= 0.8) return 0.2
  if (maxRatio >= 0.6) return 0.12
  if (maxRatio >= 0.4) return 0.06
  return 0
}

export interface ConfidenceInput {
  supportCount: number
  effectSize: number
  consistency: number
  recencyScore: number
  overlapPenalty: number
}

/**
 * 내부 자료 충분도 점수 0~100 (통계적 유의확률이 아님).
 * 보수화: 표본 포화 분모 8→15, 효과 포화 분모 15→20 (적은 데이터에서 과신 방지).
 */
export function calcConfidence(input: ConfidenceInput): number {
  const supportScore = Math.min(input.supportCount / 15, 1)
  const effectScore = Math.min(Math.abs(input.effectSize) / 20, 1)
  const consistencyScore = clamp(input.consistency, 0, 1)
  const recencyScore = clamp(input.recencyScore, 0, 1)
  const raw =
    supportScore * 0.35 + effectScore * 0.35 + consistencyScore * 0.2 + recencyScore * 0.1 - input.overlapPenalty
  return roundScore(clamp(raw, 0, 1) * 100)
}

function buildFactorMessage(
  factorLabel: string,
  metric: AnalysisMetric,
  window: EffectWindow,
  effectSize: number,
): string {
  const dir = effectSize >= 0 ? '높게' : '낮게'
  return `최근 기록에서 ${factorLabel}이(가) ${WINDOW_PHRASE[window]} ${ANALYSIS_METRIC_LABEL[metric]} 점수가 평소보다 ${dir} 나타나는 경향이 있어요.`
}

/**
 * 시간창별 요인 효과. 표본이 부족하거나 평균 차이가 minEffect 미만이면 null.
 * effectSize = 요인 있던 결과날 metric 평균 - 없던 결과날 평균.
 * @param minEffect 최소 평균 차이(절대값). 기본 0(제한 없음). service는 8을 넘겨 보수화.
 */
export function factorEffect(
  ds: AnalysisDataset,
  factorGroup: string,
  factorLabel: string,
  metric: AnalysisMetric,
  window: EffectWindow,
  baselineMean: number,
  minEffect = 0,
): FactorEffectResult | null {
  const withVals: { date: ISODate; val: number }[] = []
  const withoutVals: number[] = []

  for (const d of ds.resultDates) {
    const val = ds.scoreByDate.get(d)?.[metric]
    if (val === undefined) continue
    if (factorPresentForWindow(ds, factorGroup, d, window)) withVals.push({ date: d, val })
    else withoutVals.push(val)
  }

  const supportCount = withVals.length
  const comparisonCount = withoutVals.length
  if (supportCount < MIN_SUPPORT || comparisonCount < MIN_COMPARISON) return null

  const withFactorMean = mean(withVals.map((x) => x.val))
  const withoutFactorMean = mean(withoutVals)
  const effectSize = withFactorMean - withoutFactorMean
  if (Math.abs(effectSize) < minEffect) return null

  const consistency = withVals.filter((x) => x.val > baselineMean).length / supportCount

  const recentCutoff = addDaysISO(ds.endDate, -29)
  const recentSupport = withVals.filter((x) => x.date >= recentCutoff).length
  const recencyScore = supportCount > 0 ? recentSupport / supportCount : 0

  const overlapPenalty = computeOverlapPenalty(ds, factorGroup)
  const confidence = calcConfidence({ supportCount, effectSize, consistency, recencyScore, overlapPenalty })

  return {
    factorGroup,
    factorLabel,
    metric,
    window,
    withFactorMean: roundScore(withFactorMean),
    withoutFactorMean: roundScore(withoutFactorMean),
    effectSize: roundScore(effectSize),
    supportCount,
    comparisonCount,
    consistency: Math.round(consistency * 100) / 100,
    confidence,
    message: buildFactorMessage(factorLabel, metric, window, effectSize),
  }
}
