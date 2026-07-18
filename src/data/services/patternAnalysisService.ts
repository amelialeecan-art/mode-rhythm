/* =====================================================================
   MODE · 패턴 분석 서비스 (Phase 6 · 3단계 신뢰성 보강)
   service가 repository에서 모아 engine(순수 함수)로 상관/공범/회복을 계산하고,
   patternInsights에 캐시처럼 저장한다. engine은 DB를 모른다.

   3단계 안전장치:
   - 유효 결과일(validOutcomeDate) = 실제 상태 입력이 있는 날만 비교/baseline에 사용
     (빈 저장일 제외). dailyScore가 있다는 이유만으로 유효 처리하지 않는다.
   - 분석 단계(analysisStage)를 유효 결과일 수로 나눈다:
       0~13 수집 / 14~29 초기 흐름 / 30~44 요인 비교 / 45~59 조합 비교 / 60+ 충분
   - factor 카드는 유효 30일↑, combo 카드는 유효 45일↑에서만 노출.
   - 사건 timing: today=당일, yesterday=전날만 정확 반영. recent3days/recent7days는
     정확한 날짜가 없어 정밀 factor/combo 분석에서 제외(원본 기록은 보존).
   - 회복성 사건 그룹(exercise/walk/self_care)은 위험 요인 후보에서 제외(역인과 방지).
   - 표시 등급은 통계적 신뢰도가 아니라 "앱 내부 자료 충분도" 지표(evidenceLevel).

   ⚠️ 여기서 회복 "효과"는 recoveryLogs 기반으로만 평가한다(events와 분리).
   현재는 전체 clearAll 후 재생성한다.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { dailyLogRepository } from '../repositories/dailyLogRepository'
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
  evidenceLevel,
  windowPhrase,
  detectEpisodes,
  assembleEpisodeSignals,
  EVIDENCE_LEVEL_LABEL,
  ANALYSIS_METRIC_LABEL,
  type AnalysisDataset,
  type AnalysisMetric,
  type EffectWindow,
  type EvidenceLevel,
  type UnexplainedDayResult,
  type RecoveryDataset,
  type RecoveryActionInsight,
  type EpisodeDayInput,
  type EpisodeEvent,
  type Episode,
  type EpisodeSignal,
  type EpisodeSignals,
  type EpisodeStatus,
  type EpisodeConfidence,
} from '../../engine'
import { FACTOR_GROUP_DISPLAY, RECOVERY_LIKE_FACTOR_GROUPS } from '../catalog/events'
import { LAST_NIGHT_SLEEP_CODES, getSleepExposureForDate } from '../catalog/lastNightSleep'
import { assertGuard } from '../../copy/tone'
import { getTodayISODate } from '../../lib/date'
import type { DailyLog, DailyScore, EventLog, ISODate, PatternInsight, PatternInsightInput, TargetMetric } from '../models'

const ANALYSIS_DAYS = 60
const BASELINE_DAYS = 30
const FACTOR_LOOKBACK = 7 // 시간창 분석용 사전 7일 사건 데이터

// 분석 단계 임계 (유효 결과일 수 기준)
const FACTOR_MIN_DAYS = 30 // factor 카드 노출 시작
const COMBO_MIN_DAYS = 45 // combo 카드 노출 시작
const MIN_FACTOR_EFFECT = 8 // 요인 후보 최소 평균 차이(점)

const MAX_EPISODES_SHOWN = 6 // 최근 K개만 표시(성능 상한, §17)
const MAX_SIGNALS_PER_BUCKET = 4

const FACTOR_METRICS: AnalysisMetric[] = ['emotional', 'appetite', 'sleep', 'body', 'rhythm']
const COMBO_METRICS: AnalysisMetric[] = ['appetite', 'emotional', 'rhythm', 'body']
const WINDOWS: EffectWindow[] = ['same_day', 'previous_day', 'recent_3_days', 'recent_7_days']

/**
 * 자명/순환 제외표: 입력이 그 지표 점수를 "직접 만드는" (factorGroup → metric)은
 * 새 발견이 아니라 입력 공식의 반복이므로 핵심 패턴 후보에서 제외한다.
 * ⚠️ 같은 도메인(자기 자신)만 제외하고, 교차영역은 유지한다.
 *   유지 예: 수면 문제 → 감정 흔들림/식욕 흔들림, 단 음식 섭취 → 다음날 식욕/감정.
 */
const EXCLUDED_SELF_DOMAIN: Record<string, ReadonlySet<AnalysisMetric>> = {
  // 수면 사건/지난밤 수면 → 수면 문제 정도 (calcSleepLoad가 그대로 반영)
  sleep_deficit: new Set(['sleep']),
  sleep_schedule: new Set(['sleep']),
  sleep_quality: new Set(['sleep']),
  // 식사 사건 → 식욕 흔들림 (calcAppetiteLoad가 당일 가산)
  overeat: new Set(['appetite']),
  meal_skip: new Set(['appetite']),
  late_night_eating: new Set(['appetite']),
  // 생리 구간 → 몸 불편/주기 (생리통·주기 점수로 자명)
  cycle_period: new Set(['body', 'cycle']),
}
function isSelfDomain(group: string, metric: AnalysisMetric): boolean {
  return EXCLUDED_SELF_DOMAIN[group]?.has(metric) ?? false
}

export type AnalysisStage = 'collecting' | 'early_flow' | 'factor_ready' | 'combo_ready' | 'sufficient'

export const ANALYSIS_STAGE_LABEL: Record<AnalysisStage, string> = {
  collecting: '기록 수집 중',
  early_flow: '초기 흐름 확인',
  factor_ready: '요인 평균 비교 가능',
  combo_ready: '반복 비교 + 조합 비교 가능',
  sufficient: '자료가 충분한 반복 후보 가능',
}

export function analysisStageFor(validDays: number): AnalysisStage {
  if (validDays <= 13) return 'collecting'
  if (validDays <= 29) return 'early_flow'
  if (validDays <= 44) return 'factor_ready'
  if (validDays <= 59) return 'combo_ready'
  return 'sufficient'
}

/**
 * 사건의 "정확한 발생 추정일". timing을 보수적으로 처리한다.
 * - today: 저장 날짜
 * - yesterday: 저장 날짜 - 1일
 * - recent3days/recent7days: 정확한 날짜가 없어 정밀 factor/combo 분석에서 제외(null).
 *   (여러 날짜로 복제하지 않는다 — 원본 기록과 eventLoad/일일 표시에서는 그대로 사용)
 */
export function eventOccurrenceDate(timing: string, date: ISODate): ISODate | null {
  if (timing === 'today') return date
  if (timing === 'yesterday') return addDaysISO(date, -1)
  return null
}

export interface AnalysisOptions {
  endDate?: ISODate
  analysisDays?: number
  baselineDays?: number
}

export interface FrequencyItem {
  label: string
  count: number
}

/** 분석 화면 factor 카드 (숫자 근거를 정직하게 표시). */
export interface FactorPatternCard {
  factorGroup: string
  title: string
  subtitle?: string
  metric: AnalysisMetric
  metricLabel: string
  window: EffectWindow
  windowPhrase: string
  withFactorMean: number
  withoutFactorMean: number
  effectSize: number
  supportCount: number // 요인 있는 결과일 N
  comparisonCount: number // 요인 없는 결과일 M
  evidence: EvidenceLevel
  evidenceLabel: string
  message: string
}

/** 분석 화면 combo(같이 겹친 기록) 카드. */
export interface ComboCard {
  factorA: string
  factorB: string
  titleA: string
  titleB: string
  metric: AnalysisMetric
  metricLabel: string
  comboMean: number
  comboEffect: number
  supportCount: number
  factorAOnlyCount: number
  factorBOnlyCount: number
  comparisonCount: number
  evidence: EvidenceLevel
  evidenceLabel: string
  message: string
}

/* ---------------------------------------------------------------------
   무너짐 에피소드 카드 (4단계 엔진 → 화면 표시용)
   reported/mixed/estimated 를 명확히 구분하고, level 3 기능 저하와
   level 4 무너짐을 구분해 표시한다. 같은 날 관계는 원인처럼 표현하지 않는다.
   --------------------------------------------------------------------- */
export interface EpisodeSignalText {
  factorGroup: string
  label: string
  /** "같은 날 / 하루 전 / N일 전 / 최근 N일 반복 / 무너진 뒤" 등. */
  timing: string
}

export interface EpisodeCyclePosition {
  phaseLabel: string
  detail?: string
}

export interface EpisodeCard {
  startDate: ISODate
  endDate: ISODate
  peakDate: ISODate
  lengthDays: number
  status: EpisodeStatus
  statusLabel: string
  confidence: EpisodeConfidence
  confidenceLabel: string
  /** level 4 '무너짐' vs level 3 '기능 저하' vs 추정 구분. */
  severityLabel: string
  peakFunctionLevel?: number
  daysToRecovery?: number
  recoveryStartDate?: ISODate
  earlyLeadUp: EpisodeSignalText[]
  dayBeforeWarning: EpisodeSignalText[]
  sameDayCompanion: EpisodeSignalText[]
  backgroundConditions: EpisodeSignalText[]
  afterShift: EpisodeSignalText[]
  cyclePosition?: EpisodeCyclePosition
}

const EPISODE_STATUS_LABEL: Record<EpisodeStatus, string> = {
  ongoing: '진행 중',
  recovering: '회복 흐름',
  recovered: '회복함',
}
const EPISODE_CONFIDENCE_LABEL: Record<EpisodeConfidence, string> = {
  reported: '기록 기반',
  mixed: '기록+추정 혼합',
  estimated: '추정 (기능 기록 없음)',
}
const CYCLE_PHASE_LABEL: Record<string, string> = {
  period: '생리 중',
  premenstrual: '월경 전 구간',
  ovulation: '배란 추정 구간',
  other: '그 외 구간',
  unknown: '주기 데이터 없음',
}

/** level 3(기능 저하)과 level 4(무너짐)를 구분. 자기보고 없으면 추정. */
function severityLabelFor(peakFunctionLevel?: number): string {
  if (peakFunctionLevel === 4) return '무너짐'
  if (peakFunctionLevel === 3) return '기능 저하'
  return '추정 구간'
}

function signalTiming(s: EpisodeSignal, afterShift = false): string {
  if (afterShift) return '무너진 뒤'
  if (s.occurrences !== undefined) return `최근 ${s.occurrences}일 반복`
  if (s.lagDays === 0) return '같은 날'
  if (s.lagDays === 1) return '하루 전'
  return `${s.lagDays}일 전`
}

function toSignalText(list: EpisodeSignal[], afterShift = false): EpisodeSignalText[] {
  return list
    .slice(0, MAX_SIGNALS_PER_BUCKET)
    .map((s) => ({ factorGroup: s.factorGroup, label: s.label, timing: signalTiming(s, afterShift) }))
}

function buildEpisodeCard(ep: Episode, sig: EpisodeSignals): EpisodeCard {
  let cyclePosition: EpisodeCyclePosition | undefined
  if (sig.cyclePosition && sig.cyclePosition.phase !== 'unknown') {
    const cp = sig.cyclePosition
    let detail: string | undefined
    if (cp.periodDay !== undefined) detail = `생리 ${cp.periodDay}일차`
    else if (cp.phase === 'premenstrual' && cp.daysUntilNextPeriod !== undefined)
      detail = `예정일까지 약 ${cp.daysUntilNextPeriod}일`
    cyclePosition = { phaseLabel: CYCLE_PHASE_LABEL[cp.phase] ?? cp.phase, detail }
  }
  return {
    startDate: ep.startDate,
    endDate: ep.endDate,
    peakDate: ep.peakDate,
    lengthDays: ep.lengthDays,
    status: ep.status,
    statusLabel: EPISODE_STATUS_LABEL[ep.status],
    confidence: ep.confidence,
    confidenceLabel: EPISODE_CONFIDENCE_LABEL[ep.confidence],
    severityLabel: severityLabelFor(ep.peakFunctionLevel),
    peakFunctionLevel: ep.peakFunctionLevel,
    daysToRecovery: ep.daysToRecovery,
    recoveryStartDate: ep.recoveryStartDate,
    earlyLeadUp: toSignalText(sig.earlyLeadUp),
    dayBeforeWarning: toSignalText(sig.dayBeforeWarning),
    sameDayCompanion: toSignalText(sig.sameDayCompanion),
    backgroundConditions: toSignalText(sig.backgroundConditions),
    afterShift: toSignalText(sig.afterShift, true),
    cyclePosition,
  }
}

export interface AnalysisViewModel {
  endDate: ISODate
  /** 이 창에서 저장된 날 수(dailyScore 존재). */
  savedDayCount: number
  /** 실제 상태 입력이 있어 비교에 쓸 수 있는 결과일 수. */
  validOutcomeDayCount: number
  analysisStage: AnalysisStage
  analysisStageLabel: string
  /** 무너짐 에피소드(최근 K개, 최신순). 없으면 빈 배열. */
  episodes: EpisodeCard[]
  /** 요인 평균 비교(30일)까지 남은 유효일 수. */
  daysUntilComparison: number
  /** 초기 단계용 자주 기록한 사건 단순 빈도. */
  eventFrequency: FrequencyItem[]
  /** 유효 30일↑에서만 채워짐. */
  factorPatterns: FactorPatternCard[]
  timeWindowHighlight: { message: string } | null
  /** 유효 45일↑에서만 채워짐. */
  combos: ComboCard[]
  unexplained: UnexplainedDayResult[]
  recoveryEffects: RecoveryActionInsight[]
  recoveryFrequency: FrequencyItem[]
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

// 유효 결과일 판정용 상태 숫자 필드 (하나라도 0보다 크면 실제 입력이 있는 것).
const OUTCOME_NUMERIC_FIELDS: (keyof DailyLog)[] = [
  'moodLow', 'anxiety', 'irritability', 'sadness', 'heaviness', 'calm', 'energy', 'focus',
  'selfCriticism', 'impulsivity', 'appetite', 'sweetCraving', 'saltyCraving', 'bingeUrge',
  'bodyDiscomfort', 'pain', 'bloating', 'fatigue', 'headache', 'digestion',
]

function hasUserAppetiteRatings(log: DailyLog): boolean {
  const ar = log.appetiteRatings
  return !!ar && Object.values(ar).some((v) => typeof v === 'number')
}

/**
 * "비교 가능한 상태 기록"이 있는 날인지. 빈 저장(모든 값 0 + stateCodes=[])은 제외한다.
 * 기본 overallIntensity 값만으로는 유효 처리하지 않는다(숫자 필드는 stateCodes가 있어야 채워짐).
 * memo만 있는 날도 숫자 비교 결과일에서는 제외한다(memo는 여기서 보지 않음).
 */
export function isValidOutcomeLog(log: DailyLog): boolean {
  if ((log.stateCodes?.length ?? 0) >= 1) return true
  if (OUTCOME_NUMERIC_FIELDS.some((k) => (typeof log[k] === 'number' ? (log[k] as number) : 0) > 0)) return true
  if (log.sleepHours !== undefined || log.sleepQuality !== undefined) return true
  if (hasUserAppetiteRatings(log)) return true
  return false
}

/** 분석 핵심 계산 (저장 전). VM + 저장할 insight 입력을 함께 만든다. */
async function computeAnalysis(opts: AnalysisOptions): Promise<{ vm: AnalysisViewModel; insights: PatternInsightInput[] }> {
  const endDate = opts.endDate ?? getTodayISODate()
  const analysisDays = opts.analysisDays ?? ANALYSIS_DAYS
  const baselineDays = opts.baselineDays ?? BASELINE_DAYS
  const startDate = addDaysISO(endDate, -(analysisDays - 1))
  const factorStart = addDaysISO(startDate, -FACTOR_LOOKBACK)

  const [scores, dailyLogs, events, cycleLogs, recoveryLogs, settings] = await Promise.all([
    dailyScoreRepository.listByDateRange(startDate, endDate),
    dailyLogRepository.listByDateRange(startDate, endDate),
    eventLogRepository.listByDateRange(factorStart, endDate),
    cycleLogRepository.listByDateRange('1900-01-01', endDate),
    recoveryLogRepository.listByDateRange(startDate, endDate),
    userSettingsRepository.get(),
  ])

  // 저장된 날(dailyScore) vs 실제 상태 입력이 있는 유효 결과일 구분
  const logByDate = new Map<ISODate, DailyLog>()
  for (const l of dailyLogs) logByDate.set(l.date, l)
  const savedDayCount = scores.filter((s) => s.date <= endDate).length

  // 유효 결과일: dailyScore가 있고 그날 dailyLog가 실제 상태 입력을 가진 날만
  const resultDates: ISODate[] = []
  const scoreByDate = new Map<ISODate, Record<AnalysisMetric, number>>()
  for (const s of scores) {
    if (s.date > endDate) continue
    const log = logByDate.get(s.date)
    if (!log || !isValidOutcomeLog(log)) continue
    resultDates.push(s.date)
    scoreByDate.set(s.date, scoreVector(s))
  }
  const validOutcomeDayCount = resultDates.length
  const analysisStage = analysisStageFor(validOutcomeDayCount)
  const daysUntilComparison = Math.max(0, FACTOR_MIN_DAYS - validOutcomeDayCount)

  // 요인 맵 (사건 + 주기 자동). 결과 없는 날짜도 노출일로 포함될 수 있다.
  const factorByDate = new Map<ISODate, Set<string>>()
  const factorLabels = new Map<string, string>()
  const labelVotes = new Map<string, Map<string, number>>()
  const eventGroupDates = new Map<string, Set<ISODate>>() // 초기 단계 빈도 표시용

  const addFactor = (date: ISODate, group: string) => {
    let set = factorByDate.get(date)
    if (!set) {
      set = new Set()
      factorByDate.set(date, set)
    }
    set.add(group)
  }

  // 날짜별 사건 (수면 노출 adapter의 legacy 조회용)
  const eventsByDate = new Map<ISODate, EventLog[]>()
  for (const e of events) {
    const arr = eventsByDate.get(e.date) ?? []
    arr.push(e)
    eventsByDate.set(e.date, arr)
  }

  for (const e of events) {
    // 회복성 사건은 위험 요인 후보에서 제외(회복 분석에서만 평가)
    if (RECOVERY_LIKE_FACTOR_GROUPS.has(e.mappedFactorGroup)) continue
    // 지난밤 수면 코드는 아래 canonical 수면 노출(adapter)에서 단일 출처로 처리 → 여기선 건너뜀
    if (LAST_NIGHT_SLEEP_CODES.has(e.eventCode)) continue

    // timing 보수 처리: today=당일, yesterday=전날, recent3/7days=정밀 분석 제외
    const occDate = eventOccurrenceDate(e.timing, e.date)
    if (occDate === null) continue

    addFactor(occDate, e.mappedFactorGroup)
    const votes = labelVotes.get(e.mappedFactorGroup) ?? new Map<string, number>()
    votes.set(e.eventLabel, (votes.get(e.eventLabel) ?? 0) + 1)
    labelVotes.set(e.mappedFactorGroup, votes)

    const ds = eventGroupDates.get(e.mappedFactorGroup) ?? new Set<ISODate>()
    ds.add(occDate)
    eventGroupDates.set(e.mappedFactorGroup, ds)
  }
  // 그룹별 fallback 대표 라벨 = 가장 자주 쓰인 eventLabel (표준 표시가 없을 때만 사용)
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

  // 수면 노출 (날짜당 단일 출처: lastNightSleep 우선, 없으면 legacy sleep 사건).
  // 수면은 "깨어난 날"에 귀속 → 해당 날짜에 factorGroup을 더한다. factorByDate는 Set이라
  // 다른 경로와 겹쳐도 이중 반영되지 않는다. 신규 수면이 사라지지 않도록 이 경로로 통합한다.
  const sleepDates = new Set<ISODate>([...logByDate.keys(), ...eventsByDate.keys()])
  for (const date of sleepDates) {
    if (date < factorStart || date > endDate) continue
    const exposure = getSleepExposureForDate(logByDate.get(date), eventsByDate.get(date) ?? [])
    for (const g of exposure.factorGroups) {
      addFactor(date, g)
      const gd = eventGroupDates.get(g) ?? new Set<ISODate>()
      gd.add(date)
      eventGroupDates.set(g, gd)
    }
  }

  const ds: AnalysisDataset = { resultDates, scoreByDate, factorByDate, endDate }

  // 그룹 표시 정보 (표준 라벨 우선, 없으면 대표 eventLabel fallback)
  const groupTitle = (g: string) => FACTOR_GROUP_DISPLAY[g]?.title ?? factorLabels.get(g) ?? g
  const groupSubtitle = (g: string) => FACTOR_GROUP_DISPLAY[g]?.subtitle

  // 기준선
  const baselineMean = new Map<AnalysisMetric, number>()
  for (const m of [...FACTOR_METRICS, ...COMBO_METRICS]) {
    if (!baselineMean.has(m)) baselineMean.set(m, calcBaseline(ds, m, baselineDays).mean)
  }

  const allGroups = new Set<string>()
  for (const set of factorByDate.values()) for (const g of set) allGroups.add(g)

  // ---- 초기 단계용 사건 빈도 (그룹별 기록된 날 수) ----
  const eventFrequency: FrequencyItem[] = [...eventGroupDates.entries()]
    .map(([g, dates]) => ({ label: groupTitle(g), count: dates.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // ---- 요인 패턴: 유효 30일↑에서만 ----
  const factorPatterns: FactorPatternCard[] = []
  if (validOutcomeDayCount >= FACTOR_MIN_DAYS) {
    const raw: { group: string; r: ReturnType<typeof factorEffect> }[] = []
    for (const group of allGroups) {
      const label = groupTitle(group)
      let best: NonNullable<ReturnType<typeof factorEffect>> | null = null
      for (const metric of FACTOR_METRICS) {
        // 자명/순환 제외: 같은 도메인 점수를 직접 만드는 요인은 후보에서 제외(교차영역은 유지)
        if (isSelfDomain(group, metric)) continue
        for (const window of WINDOWS) {
          // 평균 차이 8점 미만은 engine에서 null. 여기선 양의 효과(요인이 지표를 높인 쪽)만 후보로.
          const r = factorEffect(ds, group, label, metric, window, baselineMean.get(metric) ?? 0, MIN_FACTOR_EFFECT)
          if (!r || r.effectSize <= 0) continue
          if (!best || r.confidence > best.confidence) best = r
        }
      }
      if (best) raw.push({ group, r: best })
    }
    raw.sort((a, b) => (b.r?.confidence ?? 0) - (a.r?.confidence ?? 0))
    for (const { group, r } of raw) {
      if (!r) continue
      const evidence = evidenceLevel({
        confidence: r.confidence,
        validOutcomeDayCount,
        supportCount: r.supportCount,
        comparisonCount: r.comparisonCount,
      })
      factorPatterns.push({
        factorGroup: group,
        title: groupTitle(group),
        subtitle: groupSubtitle(group),
        metric: r.metric,
        metricLabel: ANALYSIS_METRIC_LABEL[r.metric],
        window: r.window,
        windowPhrase: windowPhrase(r.window),
        withFactorMean: r.withFactorMean,
        withoutFactorMean: r.withoutFactorMean,
        effectSize: r.effectSize,
        supportCount: r.supportCount,
        comparisonCount: r.comparisonCount,
        evidence,
        evidenceLabel: EVIDENCE_LEVEL_LABEL[evidence],
        message: r.message,
      })
    }
  }
  const topFactors = factorPatterns.slice(0, 8)

  // ---- 같이 겹친 기록(combo): 유효 45일↑에서만 ----
  const combos: ComboCard[] = []
  if (validOutcomeDayCount >= COMBO_MIN_DAYS) {
    const occCount = new Map<string, number>()
    for (const set of factorByDate.values()) for (const g of set) occCount.set(g, (occCount.get(g) ?? 0) + 1)
    const frequent = [...occCount.entries()]
      .filter(([, n]) => n >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g]) => g)

    const rawCombos: NonNullable<ReturnType<typeof accompliceEffect>>[] = []
    for (let i = 0; i < frequent.length; i++) {
      for (let j = i + 1; j < frequent.length; j++) {
        const a = frequent[i]
        const b = frequent[j]
        let best: NonNullable<ReturnType<typeof accompliceEffect>> | null = null
        for (const metric of COMBO_METRICS) {
          // 한쪽이라도 그 지표를 직접 만드는 자명 관계면 제외 (예: 수면 그룹 → 수면 지표)
          if (isSelfDomain(a, metric) || isSelfDomain(b, metric)) continue
          const r = accompliceEffect(ds, a, b, groupTitle(a), groupTitle(b), metric, baselineMean.get(metric) ?? 0)
          if (r && (!best || r.comboEffect > best.comboEffect)) best = r
        }
        if (best) rawCombos.push(best)
      }
    }
    rawCombos.sort((a, b) => b.confidence - a.confidence)
    for (const c of rawCombos.slice(0, 3)) {
      const evidence = evidenceLevel({
        confidence: c.confidence,
        validOutcomeDayCount,
        supportCount: c.supportCount,
        comparisonCount: c.comparisonCount,
      })
      combos.push({
        factorA: c.factorA,
        factorB: c.factorB,
        titleA: groupTitle(c.factorA),
        titleB: groupTitle(c.factorB),
        metric: c.metric,
        metricLabel: ANALYSIS_METRIC_LABEL[c.metric],
        comboMean: c.comboMean,
        comboEffect: c.comboEffect,
        supportCount: c.supportCount,
        factorAOnlyCount: c.factorAOnlyCount,
        factorBOnlyCount: c.factorBOnlyCount,
        comparisonCount: c.comparisonCount,
        evidence,
        evidenceLabel: EVIDENCE_LEVEL_LABEL[evidence],
        message: c.message,
      })
    }
  }

  // ---- 미제 사건 (유효 결과일만 대상으로) ----
  const validScores = scores.filter((s) => scoreByDate.has(s.date))
  const unexplained = detectUnexplained(
    validScores.map((s) => ({
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
  const recoveryFrequency: FrequencyItem[] = [...recCount.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  // ---- 혼합일: 도움/안 맞음이 같은 날 함께 기록된 날 ----
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
  const delayed = topFactors.find((f) => f.window !== 'same_day')
  const timeWindowHighlight = delayed ? { message: delayed.message } : null

  // ---- 저장할 insight 입력 ----
  const insights: PatternInsightInput[] = []
  for (const f of topFactors) {
    insights.push({
      insightType: 'factor',
      targetMetric: f.metric as TargetMetric,
      factorCodes: [f.factorGroup],
      effectSize: f.effectSize,
      confidence: 0, // 표시 등급은 evidenceLevel — 저장에는 원점수 미노출
      supportCount: f.supportCount,
      message: assertGuard(f.message),
    })
  }
  for (const c of combos) {
    insights.push({
      insightType: 'combo',
      targetMetric: c.metric as TargetMetric,
      factorCodes: [c.factorA, c.factorB],
      effectSize: c.comboEffect,
      confidence: 0,
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
      message: assertGuard('일부 버거움이 컸던 날짜는 현재 기록만으로 충분히 설명되지 않았어요. 이유가 없는 날도 데이터로 보관해요.'),
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

  // ---- 무너짐 에피소드 (4단계 순수 엔진 연결) ----
  // 입력: 그날 자기보고 functionLevel(우선) + rhythmLoad(보조 추정). 달력 연속은 엔진이 채운다.
  const episodeInputs: EpisodeDayInput[] = []
  const episodeDates = new Set<ISODate>([...logByDate.keys(), ...scoreByDate.keys()])
  for (const date of episodeDates) {
    if (date < startDate || date > endDate) continue
    episodeInputs.push({
      date,
      functionLevel: logByDate.get(date)?.functionLevel,
      rhythmLoad: scoreByDate.get(date)?.rhythm,
    })
  }
  // 사건: 발생 추정일 + relationToShift 보존. 회복성/지난밤수면 코드는 선행신호에서 제외
  // (수면은 아래 canonical 노출 경로로 단일 반영).
  const episodeEvents: EpisodeEvent[] = []
  for (const e of events) {
    if (RECOVERY_LIKE_FACTOR_GROUPS.has(e.mappedFactorGroup)) continue
    if (LAST_NIGHT_SLEEP_CODES.has(e.eventCode)) continue
    const occ = eventOccurrenceDate(e.timing, e.date)
    if (occ === null) continue
    episodeEvents.push({
      date: occ,
      factorGroup: e.mappedFactorGroup,
      label: groupTitle(e.mappedFactorGroup),
      relationToShift: e.relationToShift,
    })
  }
  for (const date of sleepDates) {
    if (date < factorStart || date > endDate) continue
    const exposure = getSleepExposureForDate(logByDate.get(date), eventsByDate.get(date) ?? [])
    for (const g of exposure.factorGroups) episodeEvents.push({ date, factorGroup: g, label: groupTitle(g) })
  }

  const episodes: EpisodeCard[] = detectEpisodes(episodeInputs)
    .slice(-MAX_EPISODES_SHOWN)
    .reverse() // 최신순
    .map((ep) => buildEpisodeCard(ep, assembleEpisodeSignals(ep, episodeEvents, buildCycleContext(ep.startDate, cycleLogs, settings))))

  const vm: AnalysisViewModel = {
    endDate,
    savedDayCount,
    validOutcomeDayCount,
    analysisStage,
    analysisStageLabel: ANALYSIS_STAGE_LABEL[analysisStage],
    episodes,
    daysUntilComparison,
    eventFrequency,
    factorPatterns: topFactors,
    timeWindowHighlight,
    combos,
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
 * 부수효과 없음(저장 안 함).
 */
export async function getRecoveryRecommendations(opts: AnalysisOptions = {}, limit = 3): Promise<RecoveryActionInsight[]> {
  const { vm } = await computeAnalysis(opts)
  return vm.recoveryEffects.slice(0, limit)
}
