/* =====================================================================
   MODE · V2 temporal 분석 서비스 (DB → engine 경계)
   getV2AnalysisBundle(원자료)를 실제로 소비해 "시간 순서가 확인된" V2 패턴을
   4개 카테고리로 만든다:
     1) 아침 → 저녁 변화 (morningEveningSummary)
     2) 사건 이후 상태 변화 (eventResponseWithinDay — 실제 timestamp 순서)
     3) lagged association (analyzeLagFamily — lag family + FDR, cherry-pick 금지)
     4) baseline level 변화 후보 (detectBaselineShift)

   ⚠️ engine 결과가 존재한다 ≠ 노출해도 된다.
      canAnalyzePair / hasEnoughRepeatedExposure / detectQualityFlags 로 gate 한다.
   ⚠️ 관찰 데이터 — 인과 단정 금지(표현은 voice 계층 + assertGuard가 담당).
   ⚠️ 미래를 당겨 쓰지 않는다: lag 정렬은 과거만 사용하고, future timestamp 품질
      플래그가 있으면 섹션 전체를 숨긴다.
   ===================================================================== */
import type { ISODate } from '../models'
import type { CoreMetric, StateMeasurement } from '../modelsV2'
import { CORE_STATE_META } from '../catalog/coreState'
import { STRESS_CATEGORY_META, type StressCategoryCode } from '../catalog/stressEvents'
import { sleepDuration } from '../../engine'
import { canAnalyzePair, detectQualityFlags, hasEnoughRepeatedExposure } from '../../engine'
import {
  analyzeLagFamily,
  dailyMetricSeries,
  eventResponseWithinDay,
  exposureIntensityByDate,
  exposureSeriesForDates,
  morningEveningPairs,
  morningEveningSummary,
  detectBaselineShift,
  timeTrendSeries,
  weekendSeries,
  pickLagFamilyRepresentative,
  gateLaggedAssociation,
  gateMorningEvening,
  gateEventResponse,
  gateBaselineShift,
  selectTopAssociations,
  TEMPORAL_GATES,
  type AssociationResult,
  type MorningEveningSummary,
  type EventResponseResult,
  type ShiftCandidate,
  type DailyValueSeries,
  type PredictorSpec,
} from '../../engine/v2'
import { getV2AnalysisBundle, type V2AnalysisBundle } from './analysisDatasetService'

/** bootstrap CI 재현성을 위한 고정 seed(분석 표시는 결정적이어야 한다). */
const BOOTSTRAP_SEED = 20260821

/* ---------------------------------------------------------------------
   View model
   --------------------------------------------------------------------- */
export interface MorningEveningInsight {
  metric: CoreMetric
  label: string
  summary: MorningEveningSummary
  /** 표시용 실측 평균(아침/저녁) — 엔진 pairs에서 그대로 집계. 없으면 NaN. */
  morningMean: number
  eveningMean: number
}

export interface EventResponseInsight {
  category: StressCategoryCode
  categoryLabel: string
  metric: CoreMetric
  metricLabel: string
  eventCount: number
  result: EventResponseResult
}

export interface LaggedInsight {
  key: string
  exposureLabel: string
  outcomeLabel: string
  outcomeMetric: CoreMetric
  /** family 대표 결과(lag/adjusted/ci/confidence 포함). */
  result: AssociationResult
  /** family에서 분석 가능(ok)했던 lag 수 — "여러 lag를 함께 봤다"는 근거. */
  familyOkCount: number
}

export interface BaselineShiftInsight {
  metric: CoreMetric
  label: string
  candidate: ShiftCandidate
  /** 변화 후보가 놓인 대략적 날짜(index → 정렬된 관찰 날짜). */
  shiftDate: ISODate | null
}

export interface V2TemporalInsights {
  available: boolean
  rangeDays: number
  /** 품질 error 플래그로 섹션 전체가 숨겨졌는가. */
  suppressedByQuality: boolean
  qualityFlagCodes: string[]
  morningEvening: MorningEveningInsight[]
  eventResponses: EventResponseInsight[]
  lagged: LaggedInsight[]
  baselineShifts: BaselineShiftInsight[]
}

/* ---------------------------------------------------------------------
   분석 대상(작고 사전 정의된 세트 — 자동 전량 탐색 금지)
   --------------------------------------------------------------------- */
const ME_METRICS: CoreMetric[] = ['moodLow', 'anxiety', 'irritability', 'energy', 'fatigueHeaviness']
/** 사건 이후 상태 변화의 canonical outcome(스트레스 반응 대표 지표). */
const EVENT_OUTCOME: CoreMetric = 'anxiety'
const STRESS_OUTCOMES: CoreMetric[] = ['moodLow', 'anxiety', 'irritability']
const SLEEP_OUTCOMES: CoreMetric[] = ['energy', 'fatigueHeaviness']
const SHIFT_METRICS: CoreMetric[] = ['moodLow', 'energy', 'anxiety']

const label = (m: CoreMetric) => CORE_STATE_META[m].label

/* ---------------------------------------------------------------------
   metric의 timestamp 보유 관찰(사건 전후 비교용)
   --------------------------------------------------------------------- */
function metricSeriesWithTime(measurements: StateMeasurement[], metric: CoreMetric): { at: string; value: number }[] {
  const out: { at: string; value: number }[] = []
  for (const m of measurements) {
    const v = m.metrics[metric]
    if (typeof v === 'number') out.push({ at: m.recordedAt, value: v })
  }
  return out
}

/** 날짜별 수면시간(분) 시계열. 같은 날 여러 episode면 최장 수면을 쓴다. */
function sleepDurationSeries(sleeps: V2AnalysisBundle['sleeps']): DailyValueSeries {
  const byDate = new Map<ISODate, number>()
  for (const ep of sleeps) {
    const d = sleepDuration(ep)
    if (d === null) continue
    byDate.set(ep.localDate, Math.max(byDate.get(ep.localDate) ?? -Infinity, d))
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/* ---------------------------------------------------------------------
   메인
   --------------------------------------------------------------------- */
export async function getV2TemporalInsights(rangeDays = 120): Promise<V2TemporalInsights> {
  const bundle = await getV2AnalysisBundle(rangeDays)
  return buildV2TemporalInsights(bundle)
}

/** 순수 조립부(테스트에서 bundle을 직접 넣어 검증). */
export function buildV2TemporalInsights(bundle: V2AnalysisBundle): V2TemporalInsights {
  const { measurements, sleeps, stressEvents, rangeDays } = bundle

  const empty: V2TemporalInsights = {
    available: false,
    rangeDays,
    suppressedByQuality: false,
    qualityFlagCodes: [],
    morningEvening: [],
    eventResponses: [],
    lagged: [],
    baselineShifts: [],
  }

  // ── 품질 gate: error severity(미래 timestamp/불가능 값/시간 역전)가 있으면 섹션 전체 숨김 ──
  const flags = detectQualityFlags(measurements)
  const errorFlags = flags.filter((f) => f.severity === 'error')
  if (errorFlags.length > 0) {
    return { ...empty, suppressedByQuality: true, qualityFlagCodes: [...new Set(errorFlags.map((f) => f.code))] }
  }

  // ── 1. 아침 → 저녁 변화 ──
  const morningEvening: MorningEveningInsight[] = []
  for (const metric of ME_METRICS) {
    const pairs = morningEveningPairs(measurements, metric)
    const summary = morningEveningSummary(pairs)
    if (gateMorningEvening(summary)) {
      // 표시용 실측 평균(엔진이 이미 만든 pairs에서 그대로 집계 — 새 추정 아님).
      const morningMean = pairs.reduce((s, p) => s + p.morning, 0) / pairs.length
      const eveningMean = pairs.reduce((s, p) => s + p.evening, 0) / pairs.length
      morningEvening.push({ metric, label: label(metric), summary, morningMean, eveningMean })
    }
  }
  morningEvening.sort((a, b) => Math.abs(b.summary.meanDelta) - Math.abs(a.summary.meanDelta))
  const morningEveningTop = morningEvening.slice(0, TEMPORAL_GATES.maxPerCategory)

  // ── 2. 사건 이후 상태 변화 (실제 timestamp 순서) ──
  const eventOutcomeSeries = metricSeriesWithTime(measurements, EVENT_OUTCOME)
  const byCategory = new Map<StressCategoryCode, string[]>()
  for (const e of stressEvents) {
    const arr = byCategory.get(e.category) ?? []
    arr.push(e.occurredAt)
    byCategory.set(e.category, arr)
  }
  const eventResponses: EventResponseInsight[] = []
  for (const [category, times] of byCategory) {
    // P2-A: 반복 노출 gate — 같은 사건이 충분히 반복돼야 비교 가능.
    if (!hasEnoughRepeatedExposure(times.length, TEMPORAL_GATES.minEventRepeats).ready) continue
    const result = eventResponseWithinDay(times, eventOutcomeSeries)
    if (!gateEventResponse(result, times.length)) continue
    eventResponses.push({
      category,
      categoryLabel: STRESS_CATEGORY_META[category].label,
      metric: EVENT_OUTCOME,
      metricLabel: label(EVENT_OUTCOME),
      eventCount: times.length,
      result,
    })
  }
  eventResponses.sort((a, b) => Math.abs(b.result.meanDelta) - Math.abs(a.result.meanDelta))
  const eventResponsesTop = eventResponses.slice(0, TEMPORAL_GATES.maxPerCategory)

  // ── 3. lagged association ──
  const laggedRaw: LaggedInsight[] = []

  // 3a. 스트레스 강도 → 기분 지표 (lag 0,1,2)
  const stressIntensityByDate = exposureIntensityByDate(
    stressEvents.map((e) => ({ localDate: e.localDate, intensity: e.intensity })),
  )
  const stressDays = stressIntensityByDate.size
  if (hasEnoughRepeatedExposure(stressDays, TEMPORAL_GATES.minExposureRepeats).ready) {
    for (const metric of STRESS_OUTCOMES) {
      const outcome = dailyMetricSeries(measurements, metric, { prefer: 'mean' })
      if (outcome.length < TEMPORAL_GATES.minAlignedN) continue
      const anchorDates = outcome.map((p) => p.date)
      const exposure = exposureSeriesForDates(anchorDates, stressIntensityByDate)
      const confounders: PredictorSpec[] = [
        { name: 'weekend', series: weekendSeries(anchorDates) },
        { name: 'trend', series: timeTrendSeries(anchorDates) },
      ]
      const family = analyzeLagFamily(
        { label: `stress→${metric}`, outcome, exposure, confounders, includePrevY: true, bootstrapSeed: BOOTSTRAP_SEED },
        [0, 1, 2],
      )
      const pick = pickLagFamilyRepresentative(family)
      if (gateLaggedAssociation(pick.representative, stressDays)) {
        laggedRaw.push({
          key: `stress-${metric}`,
          exposureLabel: '스트레스 사건',
          outcomeLabel: label(metric),
          outcomeMetric: metric,
          result: pick.representative!,
          familyOkCount: pick.okCount,
        })
      }
    }
  }

  // 3b. 수면시간 → 다음날 에너지/피로 (lag 0,1)
  const sleepSeries = sleepDurationSeries(sleeps)
  const sleepDays = sleepSeries.length
  if (hasEnoughRepeatedExposure(sleepDays, TEMPORAL_GATES.minExposureRepeats).ready) {
    for (const metric of SLEEP_OUTCOMES) {
      const outcome = dailyMetricSeries(measurements, metric, { prefer: 'mean' })
      if (outcome.length < TEMPORAL_GATES.minAlignedN) continue
      const anchorDates = outcome.map((p) => p.date)
      const confounders: PredictorSpec[] = [
        { name: 'weekend', series: weekendSeries(anchorDates) },
        { name: 'trend', series: timeTrendSeries(anchorDates) },
      ]
      const family = analyzeLagFamily(
        { label: `sleep→${metric}`, outcome, exposure: sleepSeries, confounders, includePrevY: true, bootstrapSeed: BOOTSTRAP_SEED },
        [0, 1],
      )
      const pick = pickLagFamilyRepresentative(family)
      if (gateLaggedAssociation(pick.representative, sleepDays)) {
        laggedRaw.push({
          key: `sleep-${metric}`,
          exposureLabel: '수면시간',
          outcomeLabel: label(metric),
          outcomeMetric: metric,
          result: pick.representative!,
          familyOkCount: pick.okCount,
        })
      }
    }
  }

  // 3c. 갈망 → 폭식 충동 (metric↔metric, canAnalyzePair gate)
  const pairReady = canAnalyzePair(measurements, 'craving', 'bingeUrge')
  if (pairReady.ready) {
    const outcome = dailyMetricSeries(measurements, 'bingeUrge', { prefer: 'mean' })
    const exposure = dailyMetricSeries(measurements, 'craving', { prefer: 'mean' })
    if (outcome.length >= TEMPORAL_GATES.minAlignedN) {
      const anchorDates = outcome.map((p) => p.date)
      const family = analyzeLagFamily(
        {
          label: 'craving→bingeUrge',
          outcome,
          exposure,
          confounders: [{ name: 'trend', series: timeTrendSeries(anchorDates) }],
          includePrevY: true,
          bootstrapSeed: BOOTSTRAP_SEED,
        },
        [0, 1],
      )
      const pick = pickLagFamilyRepresentative(family)
      if (gateLaggedAssociation(pick.representative, pairReady.pairedObservations)) {
        laggedRaw.push({
          key: 'craving-bingeUrge',
          exposureLabel: label('craving'),
          outcomeLabel: label('bingeUrge'),
          outcomeMetric: 'bingeUrge',
          result: pick.representative!,
          familyOkCount: pick.okCount,
        })
      }
    }
  }

  // 카테고리 간 정렬 + 상한(confidence → |effect|).
  const laggedTop = selectTopAssociations(
    laggedRaw.map((l) => l.result),
    4,
  )
  const laggedTopKeys = new Set(laggedTop.map((r) => r.label))
  const lagged = laggedRaw.filter((l) => laggedTopKeys.has(l.result.label))

  // ── 4. baseline level 변화 후보 ──
  const baselineShifts: BaselineShiftInsight[] = []
  for (const metric of SHIFT_METRICS) {
    const series = dailyMetricSeries(measurements, metric, { prefer: 'mean' })
    const values = series.map((p) => p.value)
    const candidate = detectBaselineShift(values)
    if (gateBaselineShift(candidate, values.length)) {
      const idx = candidate.index
      const shiftDate = idx !== null && series[idx] ? series[idx].date : null
      baselineShifts.push({ metric, label: label(metric), candidate, shiftDate })
    }
  }
  baselineShifts.sort((a, b) => b.candidate.standardizedShift - a.candidate.standardizedShift)
  const baselineShiftsTop = baselineShifts.slice(0, 2)

  const available =
    morningEveningTop.length > 0 ||
    eventResponsesTop.length > 0 ||
    lagged.length > 0 ||
    baselineShiftsTop.length > 0

  return {
    available,
    rangeDays,
    suppressedByQuality: false,
    qualityFlagCodes: [...new Set(flags.map((f) => f.code))],
    morningEvening: morningEveningTop,
    eventResponses: eventResponsesTop,
    lagged,
    baselineShifts: baselineShiftsTop,
  }
}
