/* =====================================================================
   MODE · 리듬 화면 서비스 (Phase 9B-1 — 장기 흐름)
   저장된 dailyScores를 시계열로 모으고, 범위(30일/3·6개월/1년)에 맞춰
   일별 또는 7일 평균으로 집계한다. 결측일은 0으로 세지 않는다(실제 기록만
   평균, 기록 없는 구간은 선을 잇지 않음). 주기 구간은 날짜 기반 오버레이.
   scoring/점수 공식은 건드리지 않는다 — 표시용 집계만.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { dailyLogRepository } from '../repositories/dailyLogRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import {
  addDaysISO,
  buildCycleContext,
  buildCycleCompare,
  buildRecentFlow,
  buildFlowSegments,
  buildFlowDrivers,
  buildPersonalRhythm,
  CYCLE_BEFORE,
  CYCLE_AFTER,
  MIN_PERIOD_STARTS,
  MIN_COMPARE_CYCLES,
  type CyclePoint,
  type RecentFlow,
  type RecentFlowDay,
  type PersonalRhythm,
} from '../../engine'
import { eventsToExposureRuns } from './patternAnalysisService'
import { getTodayISODate } from '../../lib/date'
import type { CycleLog, DailyScore, ISODate } from '../models'

export type CyclePhase = 'period' | 'premenstrual' | 'ovulation'
export type RhythmMetric = 'emotional' | 'appetite' | 'sleep' | 'body' | 'recovery'
export const RHYTHM_METRICS: RhythmMetric[] = ['emotional', 'appetite', 'sleep', 'body', 'recovery']

export interface RhythmDay {
  date: ISODate
  dayIndex: number
  isToday: boolean
  hasScore: boolean
  emotional?: number
  appetite?: number
  sleep?: number
  body?: number
  recovery?: number
  rhythm?: number
  cyclePhase: CyclePhase | null
}

/** 집계 단위(일별 또는 7일 평균). */
export interface RhythmBucket {
  startDate: ISODate
  endDate: ISODate
  isToday: boolean
  /** 각 metric = 구간 내 '실제 기록이 있는 날'만 평균. 없으면 undefined(선 끊김). */
  emotional?: number
  appetite?: number
  sleep?: number
  body?: number
  recovery?: number
  /** 구간 내 가장 흔한 주기 구간(없으면 null). */
  cyclePhase: CyclePhase | null
  hasData: boolean
}

/** metric별 최근 7일 vs 그 이전 28일 비교(숫자만 — 문장은 화면 helper). */
export interface WeekCompareStat {
  recentMean: number
  prevMean: number
  diff: number
  recentN: number
  prevN: number
  enough: boolean
}

export interface RhythmViewModel {
  startDate: ISODate
  endDate: ISODate
  bucketMode: 'day' | 'week'
  days: RhythmDay[]
  buckets: RhythmBucket[]
  /** buckets 기준 today 인덱스(-1이면 범위 밖). */
  todayBucketIndex: number
  /** days 기준 today 인덱스(-1이면 범위 밖). */
  todayIndex: number
  dayCount: number
  hasData: boolean
  weekCompare: Record<RhythmMetric, WeekCompareStat>
}

export interface RhythmOptions {
  endDate?: ISODate
  days?: number
  /** 'day'=일별, 'week'=7일 평균. 미지정 시 30일 이하는 day, 그 이상 week. */
  bucket?: 'day' | 'week'
}

const DEFAULT_DAYS = 90 // 기본 3개월
const CYCLE_HISTORY_FLOOR = '1900-01-01'
const COMPARE_RECENT = 7
const COMPARE_PREV = 28

function phaseOf(
  date: ISODate,
  cycleLogs: Parameters<typeof buildCycleContext>[1],
  settings: Parameters<typeof buildCycleContext>[2],
): CyclePhase | null {
  const ctx = buildCycleContext(date, cycleLogs, settings)
  if (ctx.confidence === 'none') return null // 주기 기록 부족 → 배경 억지로 만들지 않음
  if (ctx.isPeriod) return 'period'
  if (ctx.isPremenstrualWindow) return 'premenstrual'
  if (ctx.isOvulationWindow) return 'ovulation'
  return null
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

/** 존재하는 값만 평균(결측 제외). 값이 하나도 없으면 undefined. */
function meanDefined(vals: (number | undefined)[]): number | undefined {
  const nums = vals.filter((v): v is number => v !== undefined)
  return nums.length === 0 ? undefined : mean(nums)
}

function dominantPhase(days: RhythmDay[]): CyclePhase | null {
  const count: Record<string, number> = {}
  for (const d of days) if (d.cyclePhase) count[d.cyclePhase] = (count[d.cyclePhase] ?? 0) + 1
  let best: CyclePhase | null = null
  let bestN = 0
  for (const p of ['period', 'premenstrual', 'ovulation'] as CyclePhase[]) {
    if ((count[p] ?? 0) > bestN) {
      bestN = count[p]
      best = p
    }
  }
  return best
}

function buildBuckets(days: RhythmDay[], size: number, today: ISODate): RhythmBucket[] {
  const span = days.length
  if (span === 0) return []
  const nB = Math.ceil(span / size)
  const buckets: RhythmBucket[] = []
  for (let b = 0; b < nB; b++) {
    const endIdx = span - 1 - (nB - 1 - b) * size
    const startIdx = Math.max(0, endIdx - size + 1)
    const slice = days.slice(startIdx, endIdx + 1)
    buckets.push({
      startDate: slice[0].date,
      endDate: slice[slice.length - 1].date,
      isToday: slice.some((d) => d.date === today),
      emotional: meanDefined(slice.map((d) => d.emotional)),
      appetite: meanDefined(slice.map((d) => d.appetite)),
      sleep: meanDefined(slice.map((d) => d.sleep)),
      body: meanDefined(slice.map((d) => d.body)),
      recovery: meanDefined(slice.map((d) => d.recovery)),
      cyclePhase: dominantPhase(slice),
      hasData: slice.some((d) => d.hasScore),
    })
  }
  return buckets
}

function compareStat(recent: (number | undefined)[], prev: (number | undefined)[]): WeekCompareStat {
  const r = recent.filter((v): v is number => v !== undefined)
  const p = prev.filter((v): v is number => v !== undefined)
  const recentMean = mean(r)
  const prevMean = mean(p)
  return {
    recentMean,
    prevMean,
    diff: recentMean - prevMean,
    recentN: r.length,
    prevN: p.length,
    enough: r.length >= 2 && p.length >= 4,
  }
}

/** 리듬 화면 ViewModel. 예측 없음 — 저장 점수의 시계열 집계 + 주기 오버레이. */
export async function getRhythmViewModel(opts: RhythmOptions = {}): Promise<RhythmViewModel> {
  const endDate = opts.endDate ?? getTodayISODate()
  const span = opts.days ?? DEFAULT_DAYS
  const bucketMode: 'day' | 'week' = opts.bucket ?? (span <= 30 ? 'day' : 'week')
  const rangeStart = addDaysISO(endDate, -(span - 1))
  const today = getTodayISODate()

  // 최근/이전 비교는 최근 35일이 필요 — range와 별개로 넉넉히 조회
  const compareStart = addDaysISO(endDate, -(COMPARE_RECENT + COMPARE_PREV - 1))
  const fetchStart = rangeStart < compareStart ? rangeStart : compareStart

  const [scores, cycleLogs, settings] = await Promise.all([
    dailyScoreRepository.listByDateRange(fetchStart, endDate),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
    userSettingsRepository.get(),
  ])
  const byDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))

  const toDay = (date: ISODate, i: number): RhythmDay => {
    const s = byDate.get(date)
    return {
      date,
      dayIndex: i,
      isToday: date === today,
      hasScore: s != null,
      emotional: s?.emotionalLoad,
      appetite: s?.appetiteLoad,
      sleep: s?.sleepLoad,
      body: s?.bodyLoad,
      recovery: s?.recoveryScore ?? (s ? 0 : undefined),
      rhythm: s?.rhythmLoad,
      cyclePhase: phaseOf(date, cycleLogs, settings),
    }
  }

  // 표시 범위(days)
  const days: RhythmDay[] = []
  for (let i = 0; i < span; i++) days.push(toDay(addDaysISO(rangeStart, i), i))

  const size = bucketMode === 'week' ? 7 : 1
  const buckets = buildBuckets(days, size, today)
  const scored = days.filter((d) => d.hasScore)

  // 최근 7일 vs 이전 28일 (일별, range와 무관)
  const dayScore = (date: ISODate) => byDate.get(date)
  const recentDates: ISODate[] = []
  for (let k = 0; k < COMPARE_RECENT; k++) recentDates.push(addDaysISO(endDate, -k))
  const prevDates: ISODate[] = []
  for (let k = COMPARE_RECENT; k < COMPARE_RECENT + COMPARE_PREV; k++) prevDates.push(addDaysISO(endDate, -k))
  const metricVal = (s: DailyScore | undefined, m: RhythmMetric): number | undefined => {
    if (!s) return undefined
    if (m === 'emotional') return s.emotionalLoad
    if (m === 'appetite') return s.appetiteLoad
    if (m === 'sleep') return s.sleepLoad
    if (m === 'body') return s.bodyLoad
    return s.recoveryScore ?? 0
  }
  const weekCompare = {} as Record<RhythmMetric, WeekCompareStat>
  for (const m of RHYTHM_METRICS) {
    weekCompare[m] = compareStat(
      recentDates.map((d) => metricVal(dayScore(d), m)),
      prevDates.map((d) => metricVal(dayScore(d), m)),
    )
  }

  return {
    startDate: rangeStart,
    endDate,
    bucketMode,
    days,
    buckets,
    todayBucketIndex: buckets.findIndex((b) => b.isToday),
    todayIndex: days.findIndex((d) => d.isToday),
    dayCount: scored.length,
    hasData: scored.length >= 2,
    weekCompare,
  }
}

/* =====================================================================
   생리주기별 흐름 비교 (9B-2B)
   ===================================================================== */
export interface CycleMetricCurve {
  recent: CyclePoint[]
  previous: CyclePoint[]
  baseline: number
}
export interface CycleCompareViewModel {
  hasCycleData: boolean
  /** 생리 시작 기록 수. */
  cycleCount: number
  /** 이전 비교에 실제 기여한 주기 수. */
  compareCycles: number
  eligible: boolean
  /** 부족할 때 더 필요한 시작 기록 수. */
  neededMore: number
  /** 최근 주기 생리 구간 길이(배경 표시용). */
  periodLen: number
  relMin: number
  relMax: number
  byMetric: Record<RhythmMetric, CycleMetricCurve>
}

const CYCLE_FETCH_DAYS = 400 // 최근 ~4주기 + 여유

function metricOf(s: DailyScore, m: RhythmMetric): number {
  if (m === 'emotional') return s.emotionalLoad
  if (m === 'appetite') return s.appetiteLoad
  if (m === 'sleep') return s.sleepLoad
  if (m === 'body') return s.bodyLoad
  return s.recoveryScore ?? 0
}

/** 최근 주기의 생리 구간 길이(시작~종료). 종료 기록 없으면 기본 5일. */
function recentPeriodLen(cycleLogs: CycleLog[], recentStart: ISODate): number {
  const ends = cycleLogs
    .filter((c) => c.periodEnd && c.date >= recentStart)
    .map((c) => c.date)
    .sort()
  if (ends.length === 0) return 5
  const diff = Math.round((Date.parse(ends[0]) - Date.parse(recentStart)) / 86400000) + 1
  return Math.min(Math.max(diff, 1), 8)
}

/** Rhythm '주기 비교' ViewModel. 생리 시작일 0일 정렬 + 최근 vs 이전 3주기 평균. */
export async function getCycleCompareViewModel(opts: RhythmOptions = {}): Promise<CycleCompareViewModel> {
  const endDate = opts.endDate ?? getTodayISODate()
  const fetchStart = addDaysISO(endDate, -(CYCLE_FETCH_DAYS - 1))

  const [scores, cycleLogs] = await Promise.all([
    dailyScoreRepository.listByDateRange(fetchStart, endDate),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
  ])
  const periodStarts = cycleLogs
    .filter((c) => c.periodStart && c.date <= endDate)
    .map((c) => c.date)
    .sort()

  const scoreByDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))
  const metricMapOf = (m: RhythmMetric): Map<ISODate, number> => {
    const map = new Map<ISODate, number>()
    for (const [d, s] of scoreByDate) map.set(d, metricOf(s, m))
    return map
  }

  const byMetric = {} as Record<RhythmMetric, CycleMetricCurve>
  let compareCycles = 0
  for (const m of RHYTHM_METRICS) {
    const c = buildCycleCompare(periodStarts, metricMapOf(m))
    byMetric[m] = { recent: c.recent, previous: c.previous, baseline: c.baseline }
    compareCycles = Math.max(compareCycles, c.compareCycles)
  }

  const cycleCount = periodStarts.length
  const eligible = cycleCount >= MIN_PERIOD_STARTS && compareCycles >= MIN_COMPARE_CYCLES
  const neededMore = eligible ? 0 : Math.max(1, MIN_PERIOD_STARTS - cycleCount)
  const recentStart = periodStarts[periodStarts.length - 1]

  return {
    hasCycleData: cycleCount > 0,
    cycleCount,
    compareCycles,
    eligible,
    neededMore,
    periodLen: recentStart ? recentPeriodLen(cycleLogs, recentStart) : 5,
    relMin: -CYCLE_BEFORE,
    relMax: CYCLE_AFTER,
    byMetric,
  }
}

/* =====================================================================
   최근 흐름 (9D)
   최근 ~35일의 dailyScores(영역별 부하) + dailyLogs(생활기능)를 모아
   engine.buildRecentFlow에 넘긴다. 판정 규칙/기준선은 engine에만 있고,
   여기서는 데이터 조합만 한다. 표시 가능(displayable)일 때만 반환.
   ===================================================================== */
const RECENT_FLOW_FETCH_DAYS = 35 // 14일 창 + 개인 기준선용 여유

export async function getRecentFlow(opts: { endDate?: ISODate } = {}): Promise<RecentFlow | null> {
  const endDate = opts.endDate ?? getTodayISODate()
  const fetchStart = addDaysISO(endDate, -(RECENT_FLOW_FETCH_DAYS - 1))

  const [scores, logs] = await Promise.all([
    dailyScoreRepository.listByDateRange(fetchStart, endDate),
    dailyLogRepository.listByDateRange(fetchStart, endDate),
  ])
  const funcByDate = new Map<ISODate, number>()
  for (const l of logs) if (l.functionLevel != null) funcByDate.set(l.date, l.functionLevel)

  const dateSet = new Set<ISODate>()
  for (const s of scores) dateSet.add(s.date)
  for (const d of funcByDate.keys()) dateSet.add(d)
  const scoreByDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))

  const days: RecentFlowDay[] = [...dateSet].sort().map((date) => {
    const s = scoreByDate.get(date)
    return {
      date,
      emotional: s?.emotionalLoad,
      appetite: s?.appetiteLoad,
      sleep: s?.sleepLoad,
      body: s?.bodyLoad,
      functionLevel: funcByDate.get(date),
    }
  })

  const flow = buildRecentFlow(days)
  return flow.displayable ? flow : null
}

/* =====================================================================
   개인 반복 흐름 (9H)
   사용 가능한 기록 중 최대 365일로 FlowSegment를 만들어, 월/생리주기로
   자르지 않고 상태 순서가 반복되는지 engine.buildPersonalRhythm에 넘긴다.
   commonDrivers는 기존 flowDrivers를 재사용한다. 반복 구조 없으면 null.
   ===================================================================== */
const PERSONAL_RHYTHM_FETCH_DAYS = 365

export async function getPersonalRhythm(opts: { endDate?: ISODate } = {}): Promise<PersonalRhythm | null> {
  const endDate = opts.endDate ?? getTodayISODate()
  const fetchStart = addDaysISO(endDate, -(PERSONAL_RHYTHM_FETCH_DAYS - 1))

  const [scores, logs, events, cycleLogs] = await Promise.all([
    dailyScoreRepository.listByDateRange(fetchStart, endDate),
    dailyLogRepository.listByDateRange(fetchStart, endDate),
    eventLogRepository.listByDateRange(fetchStart, endDate),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
  ])

  const funcByDate = new Map<ISODate, number>()
  for (const l of logs) if (l.functionLevel != null) funcByDate.set(l.date, l.functionLevel)
  const flowDays: RecentFlowDay[] = scores
    .filter((s) => s.date <= endDate)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => ({ date: s.date, emotional: s.emotionalLoad, appetite: s.appetiteLoad, sleep: s.sleepLoad, body: s.bodyLoad, functionLevel: funcByDate.get(s.date) }))

  const segments = buildFlowSegments(flowDays)
  const { runs, labelByKey } = eventsToExposureRuns(events)
  const drivers = buildFlowDrivers(segments, runs, labelByKey)
  const periodStarts = cycleLogs.filter((c) => c.periodStart).map((c) => c.date)

  return buildPersonalRhythm(segments, { periodStarts, drivers })
}
