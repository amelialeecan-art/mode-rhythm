/* =====================================================================
   MODE · 공범 구조 / 미제 사건 분석 (순수 함수)
   인과 단정 금지. "겹침 구간에서 더 강하게 나타난 패턴 후보" 수준.
   ===================================================================== */
import type { DayTypeCode, ISODate } from '../data/models'
import {
  ANALYSIS_METRIC_LABEL,
  calcConfidence,
  confidenceTier,
  type AnalysisDataset,
  type AnalysisMetric,
  type ConfidenceTier,
} from './correlation'

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
const round = (n: number) => Math.round(n)

export interface AccompliceEffectResult {
  factorA: string
  factorB: string
  factorALabel: string
  factorBLabel: string
  metric: AnalysisMetric
  comboMean: number
  factorAOnlyMean: number
  factorBOnlyMean: number
  baselineMean: number
  comboEffect: number
  supportCount: number
  confidence: number
  confidenceTier: ConfidenceTier
  message: string
}

const MIN_COMBO_SUPPORT = 3
const MIN_COMBO_EFFECT = 8

/**
 * 공범 구조: A와 B가 함께 있던 날의 metric 평균이
 * max(A만, B만, baseline)보다 충분히 높은지.
 * 같은 날(same_day) 동시 발생 기준. 표본/효과가 작으면 null.
 */
export function accompliceEffect(
  ds: AnalysisDataset,
  factorA: string,
  factorB: string,
  factorALabel: string,
  factorBLabel: string,
  metric: AnalysisMetric,
  baselineMean: number,
): AccompliceEffectResult | null {
  const comboVals: number[] = []
  const aOnly: number[] = []
  const bOnly: number[] = []

  for (const d of ds.resultDates) {
    const val = ds.scoreByDate.get(d)?.[metric]
    if (val === undefined) continue
    const set = ds.factorByDate.get(d)
    const a = set?.has(factorA) ?? false
    const b = set?.has(factorB) ?? false
    if (a && b) comboVals.push(val)
    else if (a) aOnly.push(val)
    else if (b) bOnly.push(val)
  }

  const supportCount = comboVals.length
  if (supportCount < MIN_COMBO_SUPPORT) return null

  const comboMean = mean(comboVals)
  const aOnlyMean = aOnly.length > 0 ? mean(aOnly) : baselineMean
  const bOnlyMean = bOnly.length > 0 ? mean(bOnly) : baselineMean
  const base = Math.max(aOnlyMean, bOnlyMean, baselineMean)
  const comboEffect = comboMean - base
  if (comboEffect < MIN_COMBO_EFFECT) return null

  const consistency = comboVals.filter((v) => v > base).length / supportCount
  const confidence = calcConfidence({
    supportCount,
    effectSize: comboEffect,
    consistency,
    recencyScore: 1,
    overlapPenalty: 0,
  })

  const message = `${factorALabel}과(와) ${factorBLabel}이(가) 함께 있었던 날에는 ${ANALYSIS_METRIC_LABEL[metric]} 점수가 더 높게 기록된 편이에요. 단일 요인보다 겹침 구간에서 더 강하게 나타난 패턴 후보예요.`

  return {
    factorA,
    factorB,
    factorALabel,
    factorBLabel,
    metric,
    comboMean: round(comboMean),
    factorAOnlyMean: round(aOnlyMean),
    factorBOnlyMean: round(bOnlyMean),
    baselineMean: round(baselineMean),
    comboEffect: round(comboEffect),
    supportCount,
    confidence,
    confidenceTier: confidenceTier(confidence),
    message,
  }
}

export interface UnexplainedDayInput {
  date: ISODate
  rhythmLoad: number
  eventLoad: number
  cycleLoad: number
  sleepLoad: number
  bodyLoad: number
  dayType: DayTypeCode
}

export interface UnexplainedDayResult {
  date: ISODate
  rhythmLoad: number
  dayType: DayTypeCode
  note: string
}

const UNEXPLAINED_NOTE =
  '이 날은 저장된 사건과 계산 점수만으로는 충분히 설명되지 않았어요. 이유가 없는 날도 데이터로 보관해요.'

/**
 * 미제 사건: 고부하인데 사건/주기/수면/몸 설명력이 낮은 날.
 * 억지로 모든 날에 이유를 붙이지 않는다.
 */
export function detectUnexplained(rows: UnexplainedDayInput[]): UnexplainedDayResult[] {
  return rows
    .filter(
      (r) =>
        r.rhythmLoad >= 60 &&
        r.eventLoad < 25 &&
        r.cycleLoad < 25 &&
        r.sleepLoad < 40 &&
        r.bodyLoad < 40,
    )
    .map((r) => ({ date: r.date, rhythmLoad: r.rhythmLoad, dayType: r.dayType, note: UNEXPLAINED_NOTE }))
}
