/* =====================================================================
   MODE · 리듬 화면 서비스 (Phase 9B-1 — 장기 흐름)
   저장된 dailyScores를 시계열로 모으고, 범위(30일/3·6개월/1년)에 맞춰
   일별 또는 7일 평균으로 집계한다. 결측일은 0으로 세지 않는다(실제 기록만
   평균, 기록 없는 구간은 선을 잇지 않음). 주기 구간은 날짜 기반 오버레이.
   scoring/점수 공식은 건드리지 않는다 — 표시용 집계만.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { addDaysISO, buildCycleContext } from '../../engine'
import { getTodayISODate } from '../../lib/date'
import type { DailyScore, ISODate } from '../models'

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
