/* =====================================================================
   MODE · 패턴 분석 서비스 (Phase 6)
   service가 repository에서 모아 engine(순수 함수)로 상관/공범/미제를 계산하고,
   patternInsights에 캐시처럼 저장한다. engine은 DB를 모른다.

   주의: 회복 "효과" 분석은 여기 없다(7단계). 회복은 빈도 표시용으로만 읽는다.
   현재는 전체 clearAll 후 재생성한다. 데이터가 커지면 기간별/증분 계산으로
   개선할 수 있다(향후 과제).
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { recoveryLogRepository } from '../repositories/recoveryLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { patternInsightRepository } from '../repositories/patternInsightRepository'
import {
  addDaysISO,
  calcBaseline,
  factorEffect,
  accompliceEffect,
  detectUnexplained,
  buildCycleContext,
  analyzeRecoveryActions,
  type AnalysisDataset,
  type AnalysisMetric,
  type EffectWindow,
  type FactorEffectResult,
  type AccompliceEffectResult,
  type UnexplainedDayResult,
  type RecoveryDataset,
  type RecoveryActionInsight,
} from '../../engine'
import { assertGuard } from '../../copy/tone'
import { getTodayISODate } from '../../lib/date'
import type { DailyScore, ISODate, PatternInsight, PatternInsightInput, TargetMetric } from '../models'

const ANALYSIS_DAYS = 60
const BASELINE_DAYS = 30
const FACTOR_LOOKBACK = 7 // 시간창 분석용 사전 7일 사건 데이터
const MIN_DAYS_FOR_PATTERNS = 8

const FACTOR_METRICS: AnalysisMetric[] = ['emotional', 'appetite', 'sleep', 'body', 'rhythm']
const COMBO_METRICS: AnalysisMetric[] = ['appetite', 'emotional', 'rhythm', 'body']
const WINDOWS: EffectWindow[] = ['same_day', 'previous_day', 'recent_3_days', 'recent_7_days']

const CYCLE_FACTOR_LABEL: Record<string, string> = {
  cycle_period: '생리 구간',
  cycle_premenstrual_window: '월경 전 구간',
  cycle_ovulation_window: '배란 추정 구간',
}

export interface AnalysisOptions {
  endDate?: ISODate
  analysisDays?: number
  baselineDays?: number
}

export interface RecoveryFrequencyItem {
  label: string
  count: number
}

export interface AnalysisViewModel {
  endDate: ISODate
  dayCount: number
  hasEnoughData: boolean
  factorPatterns: FactorEffectResult[]
  timeWindowHighlight: { message: string } | null
  combos: AccompliceEffectResult[]
  unexplained: UnexplainedDayResult[]
  /** 효과 기반 회복 행동 후보 ("나를 살린 것들"). */
  recoveryEffects: RecoveryActionInsight[]
  /** 회복 행동 단순 빈도 (효과 데이터 부족 시 보조). */
  recoveryFrequency: RecoveryFrequencyItem[]
  /** 도움 된 것과 안 맞았던 것이 같은 날 함께 기록된 "혼합일" 수 (해석 주의 표시용). */
  mixedRecoveryDayCount: number
}

function scoreVector(s: DailyScore): Record<AnalysisMetric, number> {
  return {
    emotional: s.emotionalLoad,
    appetite: s.appetiteLoad,
    sleep: s.sleepLoad,
    body: s.bodyLoad,
    cycle: s.cycleLoad,
    event: s.eventLoad,
    rhythm: s.rhythmLoad,
  }
}

/** 분석 핵심 계산 (저장 전). VM + 저장할 insight 입력을 함께 만든다. */
async function computeAnalysis(opts: AnalysisOptions): Promise<{ vm: AnalysisViewModel; insights: PatternInsightInput[] }> {
  const endDate = opts.endDate ?? getTodayISODate()
  const analysisDays = opts.analysisDays ?? ANALYSIS_DAYS
  const baselineDays = opts.baselineDays ?? BASELINE_DAYS
  const startDate = addDaysISO(endDate, -(analysisDays - 1))
  const factorStart = addDaysISO(startDate, -FACTOR_LOOKBACK)

  const [scores, events, cycleLogs, recoveryLogs, settings] = await Promise.all([
    dailyScoreRepository.listByDateRange(startDate, endDate),
    eventLogRepository.listByDateRange(factorStart, endDate),
    cycleLogRepository.listByDateRange('1900-01-01', endDate),
    recoveryLogRepository.listByDateRange(startDate, endDate),
    userSettingsRepository.get(),
  ])

  // 결과 날짜 + 점수 맵
  const resultDates = scores.map((s) => s.date).filter((d) => d <= endDate)
  const scoreByDate = new Map<ISODate, Record<AnalysisMetric, number>>()
  for (const s of scores) scoreByDate.set(s.date, scoreVector(s))

  // 요인 맵 (사건 + 주기 자동) — 결과 없는 날짜도 포함
  const factorByDate = new Map<ISODate, Set<string>>()
  const factorLabels = new Map<string, string>()
  const labelVotes = new Map<string, Map<string, number>>()

  const addFactor = (date: ISODate, group: string) => {
    let set = factorByDate.get(date)
    if (!set) {
      set = new Set()
      factorByDate.set(date, set)
    }
    set.add(group)
  }

  for (const e of events) {
    addFactor(e.date, e.mappedFactorGroup)
    const votes = labelVotes.get(e.mappedFactorGroup) ?? new Map<string, number>()
    votes.set(e.eventLabel, (votes.get(e.eventLabel) ?? 0) + 1)
    labelVotes.set(e.mappedFactorGroup, votes)
  }
  // 그룹별 대표 라벨 = 가장 자주 쓰인 eventLabel
  for (const [group, votes] of labelVotes) {
    let best = group
    let bestN = -1
    for (const [label, n] of votes) {
      if (n > bestN) {
        best = label
        bestN = n
      }
    }
    factorLabels.set(group, best)
  }

  // 주기 자동 요인 (날짜 기반 계산 — 사용자가 고른 원인이 아님)
  for (let d = factorStart; d <= endDate; d = addDaysISO(d, 1)) {
    const ctx = buildCycleContext(d, cycleLogs, settings)
    if (ctx.isPeriod) addFactor(d, 'cycle_period')
    if (ctx.isPremenstrualWindow) addFactor(d, 'cycle_premenstrual_window')
    if (ctx.isOvulationWindow) addFactor(d, 'cycle_ovulation_window')
  }
  for (const [g, label] of Object.entries(CYCLE_FACTOR_LABEL)) factorLabels.set(g, label)

  const ds: AnalysisDataset = { resultDates, scoreByDate, factorByDate, endDate }
  const dayCount = resultDates.length
  const hasEnoughData = dayCount >= MIN_DAYS_FOR_PATTERNS

  // 기준선
  const baselineMean = new Map<AnalysisMetric, number>()
  for (const m of FACTOR_METRICS) baselineMean.set(m, calcBaseline(ds, m, baselineDays).mean)
  for (const m of COMBO_METRICS) if (!baselineMean.has(m)) baselineMean.set(m, calcBaseline(ds, m, baselineDays).mean)

  const allGroups = new Set<string>()
  for (const set of factorByDate.values()) for (const g of set) allGroups.add(g)

  // ---- 요인 패턴: 그룹별 가장 강한 (metric, window) 1개 ----
  const factorPatterns: FactorEffectResult[] = []
  if (hasEnoughData) {
    for (const group of allGroups) {
      const label = factorLabels.get(group) ?? group
      let best: FactorEffectResult | null = null
      for (const metric of FACTOR_METRICS) {
        for (const window of WINDOWS) {
          const r = factorEffect(ds, group, label, metric, window, baselineMean.get(metric) ?? 0)
          if (!r || r.effectSize <= 0) continue
          if (!best || r.confidence > best.confidence) best = r
        }
      }
      if (best) factorPatterns.push(best)
    }
    factorPatterns.sort((a, b) => b.confidence - a.confidence)
  }

  // ---- 공범 구조: 자주 나온 요인 쌍 ----
  const occCount = new Map<string, number>()
  for (const set of factorByDate.values()) for (const g of set) occCount.set(g, (occCount.get(g) ?? 0) + 1)
  const frequent = [...occCount.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([g]) => g)

  const combos: AccompliceEffectResult[] = []
  if (hasEnoughData) {
    for (let i = 0; i < frequent.length; i++) {
      for (let j = i + 1; j < frequent.length; j++) {
        const a = frequent[i]
        const b = frequent[j]
        let best: AccompliceEffectResult | null = null
        for (const metric of COMBO_METRICS) {
          const r = accompliceEffect(ds, a, b, factorLabels.get(a) ?? a, factorLabels.get(b) ?? b, metric, baselineMean.get(metric) ?? 0)
          if (r && (!best || r.comboEffect > best.comboEffect)) best = r
        }
        if (best) combos.push(best)
      }
    }
    combos.sort((a, b) => b.confidence - a.confidence)
  }
  const topCombos = combos.slice(0, 3)

  // ---- 미제 사건 ----
  const unexplained = detectUnexplained(
    scores.map((s) => ({
      date: s.date,
      rhythmLoad: s.rhythmLoad,
      eventLoad: s.eventLoad,
      cycleLoad: s.cycleLoad,
      sleepLoad: s.sleepLoad,
      bodyLoad: s.bodyLoad,
      dayType: s.dayType,
    })),
  )
    .sort((a, b) => b.rhythmLoad - a.rhythmLoad)
    .slice(0, 6)

  // ---- 회복 행동 빈도 (효과 분석 아님) ----
  const recCount = new Map<string, number>()
  for (const r of recoveryLogs) recCount.set(r.actionLabel, (recCount.get(r.actionLabel) ?? 0) + 1)
  const recoveryFrequency: RecoveryFrequencyItem[] = [...recCount.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // ---- 혼합일: 도움/안 맞음이 같은 날 함께 기록된 날 (direction 없는 옛 기록 = positive) ----
  const dirByDate = new Map<ISODate, { pos: boolean; neg: boolean }>()
  for (const r of recoveryLogs) {
    const e = dirByDate.get(r.date) ?? { pos: false, neg: false }
    if (r.direction === 'negative') e.neg = true
    else e.pos = true
    dirByDate.set(r.date, e)
  }
  const mixedRecoveryDayCount = [...dirByDate.values()].filter((e) => e.pos && e.neg).length

  // ---- 회복 행동 효과 후보 (전후 + 다음날) ----
  const rhythmByDate = new Map<ISODate, number>()
  for (const [d, v] of scoreByDate) rhythmByDate.set(d, v.rhythm)
  const actionsByDate = new Map<ISODate, Set<string>>()
  for (const r of recoveryLogs) {
    let set = actionsByDate.get(r.date)
    if (!set) {
      set = new Set()
      actionsByDate.set(r.date, set)
    }
    set.add(r.actionCode)
  }
  const rhythmValues = resultDates.map((d) => rhythmByDate.get(d) ?? 0)
  const baselineRhythm = rhythmValues.length > 0 ? rhythmValues.reduce((a, b) => a + b, 0) / rhythmValues.length : 0
  const recoveryDataset: RecoveryDataset = { dates: resultDates, rhythmByDate, actionsByDate, baselineRhythm, endDate }
  const recoveryEffects = analyzeRecoveryActions(recoveryDataset, recoveryLogs).slice(0, 6)

  // ---- 시간창 하이라이트 (지연 효과 후보) ----
  const delayed = factorPatterns.find((f) => f.window !== 'same_day')
  const timeWindowHighlight = delayed ? { message: delayed.message } : null

  const topFactors = factorPatterns.slice(0, 8)

  // ---- 저장할 insight 입력 ----
  const insights: PatternInsightInput[] = []
  for (const f of topFactors) {
    insights.push({
      insightType: 'factor',
      targetMetric: f.metric as TargetMetric,
      factorCodes: [f.factorGroup],
      effectSize: f.effectSize,
      confidence: f.confidence,
      supportCount: f.supportCount,
      message: assertGuard(f.message),
    })
  }
  for (const c of topCombos) {
    insights.push({
      insightType: 'combo',
      targetMetric: c.metric as TargetMetric,
      factorCodes: [c.factorA, c.factorB],
      effectSize: c.comboEffect,
      confidence: c.confidence,
      supportCount: c.supportCount,
      message: assertGuard(c.message),
    })
  }
  if (unexplained.length > 0) {
    insights.push({
      insightType: 'unknown',
      targetMetric: 'rhythm',
      factorCodes: unexplained.map((u) => u.date),
      supportCount: unexplained.length,
      message: assertGuard('일부 고부하 날짜는 현재 기록만으로 충분히 설명되지 않았어요. 이유가 없는 날도 데이터로 보관해요.'),
    })
  }
  for (const r of recoveryEffects) {
    insights.push({
      insightType: 'recovery',
      targetMetric: 'recovery',
      factorCodes: [r.actionCode],
      effectSize: r.combinedScore,
      confidence: r.confidence,
      supportCount: r.supportCount,
      message: assertGuard(r.message),
    })
  }

  const vm: AnalysisViewModel = {
    endDate,
    dayCount,
    hasEnoughData,
    factorPatterns: topFactors,
    timeWindowHighlight,
    combos: topCombos,
    unexplained,
    recoveryEffects,
    recoveryFrequency,
    mixedRecoveryDayCount,
  }

  return { vm, insights }
}

async function persist(insights: PatternInsightInput[]): Promise<void> {
  await patternInsightRepository.clearAll()
  for (const i of insights) await patternInsightRepository.add(i)
}

/** 패턴을 다시 계산해 patternInsights를 clear 후 재생성한다. 저장된 insight 반환. */
export async function recalculatePatternInsights(opts: AnalysisOptions = {}): Promise<PatternInsight[]> {
  const { insights } = await computeAnalysis(opts)
  await persist(insights)
  return patternInsightRepository.listRecent(100)
}

/** Analysis 화면용 ViewModel. 진입 시 계산 + 저장 후 반환. */
export async function getAnalysisViewModel(opts: AnalysisOptions = {}): Promise<AnalysisViewModel> {
  const { vm, insights } = await computeAnalysis(opts)
  await persist(insights)
  return vm
}

/**
 * Today 화면용: 효과 신뢰도 높은 회복 행동 후보 top N (기본 3).
 * 부수효과 없음(저장 안 함). 비슷한 날 매칭 강화는 8단계 예보와 함께.
 */
export async function getRecoveryRecommendations(opts: AnalysisOptions = {}, limit = 3): Promise<RecoveryActionInsight[]> {
  const { vm } = await computeAnalysis(opts)
  return vm.recoveryEffects.slice(0, limit)
}
