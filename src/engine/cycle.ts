/* =====================================================================
   MODE · 생리 주기 계산 (순수 함수) — V2 정책
   사용자는 cycleLogs에 사실만 기록한다(시작/종료/출혈량/생리통/spotting/LH/점액).
   주기 "단계"를 사용자가 고르지 않는다. 여기서 사실 기반으로 계산한다.

   V2 핵심 원칙:
   - "평균 28일이니까 오늘 PMS" 같은 hard fallback을 primary inference로 쓰지 않는다.
     실제 관찰된 periodStart 간격이 없으면 예측/PMS 구간을 확정 표시하지 않는다.
   - settings.averageCycleLength(레거시)는 V2 primary cycle inference에 사용하지 않는다.
   - prospective(오늘 판단)는 미래 데이터를 절대 보지 않는다.
     retrospective(사후 정렬)는 이미 발생한 다음 생리를 사용할 수 있다 — 함수를 분리한다.
   - 의료적 확정 문구 금지. 배란/PMS는 estimate로 분리하고 confidence를 낮게 둔다.
   ===================================================================== */
import type { CycleLog, ISODate, UserSettings } from '../data/models'
import { parseISODate, toISODate } from '../lib/date'
import { clamp, roundScore } from './guards'

export type CycleConfidence = 'none' | 'low' | 'medium' | 'high'

/** 다음 생리 예상 범위(예측). 미래 데이터를 쓰지 않는다. */
export interface ProspectivePeriodWindow {
  available: boolean
  estimatedNextDate?: ISODate
  earliest?: ISODate
  latest?: ISODate
  daysUntil?: number
  medianLength?: number
  spreadDays?: number
  confidence: CycleConfidence
}

/** 실제 관찰 간격 통계. 극단값은 삭제하지 않고 flag만 둔다. */
export interface CycleHistoryStats {
  count: number
  median: number | null
  mean: number | null
  min: number | null
  max: number | null
  spread: number | null // max-min (robust하게 보고 싶으면 호출부에서 outlier 제외)
  outlierFlags: boolean[] // intervals와 같은 순서, |x-median|>7 이면 true
}

/** 배란 estimate(분리·저confidence). 의료 확정이 아니다. */
export interface OvulationEstimate {
  date?: ISODate
  source: 'lh' | 'mucus' | 'estimated'
  confidence: CycleConfidence
  inWindow: boolean
}

export interface CycleContext {
  isPeriod: boolean
  periodDay?: number
  /** 생리 구간 판정이 실제 종료/flow가 아니라 추정(기본 길이)에 근거하는가. */
  periodDayIsEstimated?: boolean
  daysUntilNextPeriod?: number
  estimatedCycleLength?: number
  nextPeriodDate?: ISODate
  isPremenstrualWindow: boolean
  isOvulationWindow: boolean
  confidence: CycleConfidence
  /** V2 추가(선택): 예측 범위/이력 통계/배란 estimate. */
  prospective?: ProspectivePeriodWindow
  historyStats?: CycleHistoryStats
  ovulationEstimate?: OvulationEstimate
}

/* ---------------------------------------------------------------------
   기본 유틸
   --------------------------------------------------------------------- */
function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}
function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
function mean(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

/* ---------------------------------------------------------------------
   H. 재사용 helper — cycle 겹치기/분석 준비
   --------------------------------------------------------------------- */

/** periodStart 날짜들(오름차순). upTo가 주어지면 그 날짜 이하만(prospective 안전). */
export function cycleStartDates(cycleLogs: CycleLog[], upTo?: ISODate): ISODate[] {
  return cycleLogs
    .filter((c) => c.periodStart && (upTo === undefined || c.date <= upTo))
    .map((c) => c.date)
    .sort()
}

/** 연속 시작일 간격(일). 양수만. */
export function cycleLengths(starts: ISODate[]): number[] {
  const out: number[] = []
  for (let i = 1; i < starts.length; i++) {
    const d = daysBetween(starts[i - 1], starts[i])
    if (d > 0) out.push(d)
  }
  return out
}

/**
 * 현재 cycle day (사실 기반). 마지막 실제 periodStart(≤target)가 있으면
 * cycleDay = target - lastStart + 1. 없으면 undefined.
 * ⚠️ 예측이 아니라 사실이다. 미래 데이터를 보지 않는다.
 */
export function currentCycleDay(targetDate: ISODate, cycleLogs: CycleLog[]): number | undefined {
  const starts = cycleStartDates(cycleLogs, targetDate)
  if (starts.length === 0) return undefined
  const lastStart = starts[starts.length - 1]
  if (targetDate < lastStart) return undefined
  return daysBetween(lastStart, targetDate) + 1
}

/** 시작 횟수 기반 confidence. (간격이 없으면 예측은 못 하지만 cycleDay는 앎.) */
export function dataConfidence(startCount: number): CycleConfidence {
  if (startCount === 0) return 'none'
  if (startCount >= 4) return 'high'
  if (startCount >= 2) return 'medium'
  return 'low'
}

/** 관찰 간격 통계. 극단값은 제거하지 않고 flag만. */
export function cycleHistoryStats(intervals: number[]): CycleHistoryStats {
  if (intervals.length === 0) {
    return { count: 0, median: null, mean: null, min: null, max: null, spread: null, outlierFlags: [] }
  }
  const med = median(intervals)
  return {
    count: intervals.length,
    median: med,
    mean: Math.round(mean(intervals) * 10) / 10,
    min: Math.min(...intervals),
    max: Math.max(...intervals),
    spread: Math.max(...intervals) - Math.min(...intervals),
    outlierFlags: intervals.map((x) => Math.abs(x - med) > 7),
  }
}

/**
 * D. prospective 예상 범위. 미래 데이터를 쓰지 않는다(starts ≤ targetDate).
 * 관찰 간격이 0개면 available=false — 28일 등 근거 없는 값으로 예측하지 않는다.
 */
export function prospectivePeriodWindow(targetDate: ISODate, cycleLogs: CycleLog[]): ProspectivePeriodWindow {
  const starts = cycleStartDates(cycleLogs, targetDate)
  const confidence = dataConfidence(starts.length)
  const intervals = cycleLengths(starts).slice(-6)
  if (intervals.length === 0) {
    return { available: false, confidence }
  }
  const lastStart = starts[starts.length - 1]
  const med = Math.round(median(intervals))
  // 변동폭: 관찰이 2개 이상이면 (max-min)/2, 1개뿐이면 넓은 기본값(±4)로 불확실성 표시.
  const spread = intervals.length >= 2 ? Math.max(1, Math.round((Math.max(...intervals) - Math.min(...intervals)) / 2)) : 4
  const estimatedNextDate = addDays(lastStart, med)
  return {
    available: true,
    estimatedNextDate,
    earliest: addDays(lastStart, med - spread),
    latest: addDays(lastStart, med + spread),
    daysUntil: daysBetween(targetDate, estimatedNextDate),
    medianLength: med,
    spreadDays: spread,
    confidence,
  }
}

/**
 * E. retrospective 정렬 — 이미 발생한 다음 periodStart 기준으로 상대일 계산.
 * ⚠️ 미래(=아직 안 온) 데이터가 아니라, 사후 분석에서 "실제로 발생한" 다음 생리를 쓴다.
 * 결과 day:
 *   - date가 시작일이면 0 (D0)
 *   - date 이후 첫 시작일이 있으면 음수 (D-1, D-2, …) = date - nextStart
 *   - 이후 시작일이 없으면 null (정렬 불가)
 */
export function getRelativeDayToNextPeriod(
  date: ISODate,
  cycleStarts: ISODate[],
): { day: number | null; anchorStart: ISODate | null } {
  const starts = [...cycleStarts].sort()
  if (starts.includes(date)) return { day: 0, anchorStart: date }
  const next = starts.find((s) => s > date)
  if (next) return { day: daysBetween(next, date), anchorStart: next } // date - next → 음수
  return { day: null, anchorStart: null }
}

/** cycleLogs에서 시작일을 뽑아 retrospective 상대일 계산(편의). */
export function retrospectiveRelativeDay(date: ISODate, cycleLogs: CycleLog[]): { day: number | null; anchorStart: ISODate | null } {
  return getRelativeDayToNextPeriod(date, cycleStartDates(cycleLogs))
}

/**
 * F. 생리 기간 해석. 실제 종료/flow를 우선하고, 없으면 기본 6일 추정으로 표시하되
 *    estimated=true로 구분한다. 미래 데이터를 보지 않으려면 upTo로 제한한다.
 */
export function periodDuration(
  startDate: ISODate,
  cycleLogs: CycleLog[],
  upTo?: ISODate,
): { endDate: ISODate; days: number; estimated: boolean } {
  const within = (d: ISODate) => d >= startDate && (upTo === undefined || d <= upTo)
  const ends = cycleLogs.filter((c) => c.periodEnd && within(c.date)).map((c) => c.date).sort()
  const flowDays = cycleLogs
    .filter((c) => c.flowLevel && c.flowLevel !== 'none' && within(c.date))
    .map((c) => c.date)
    .sort()

  let endDate: ISODate
  let estimated: boolean
  if (ends.length > 0 || flowDays.length > 0) {
    // 사실 기반: 명시적 종료와 마지막 flow 중 더 늦은 날.
    const factualEnd = [ends[ends.length - 1], flowDays[flowDays.length - 1]].filter(Boolean).sort()
    endDate = factualEnd[factualEnd.length - 1]
    estimated = false
  } else {
    endDate = addDays(startDate, 5) // 기본 6일차까지 추정
    estimated = true
  }
  return { endDate, days: daysBetween(startDate, endDate) + 1, estimated }
}

/* ---------------------------------------------------------------------
   G. 배란 estimate (분리·저confidence)
   --------------------------------------------------------------------- */
function computeOvulationEstimate(
  targetDate: ISODate,
  lastStart: ISODate,
  nextPeriodDate: ISODate | undefined,
  cycleLogs: CycleLog[],
  baseConfidence: CycleConfidence,
): OvulationEstimate | undefined {
  // LH 양성 기록(현재 주기 내, ≤target)이 있으면 그 날을 배란 근사로.
  const lhPositive = cycleLogs
    .filter((c) => c.lhTest === 'positive' && c.date >= lastStart && c.date <= targetDate)
    .map((c) => c.date)
    .sort()
  if (lhPositive.length > 0) {
    const date = lhPositive[lhPositive.length - 1]
    return { date, source: 'lh', confidence: 'medium', inWindow: Math.abs(daysBetween(targetDate, date)) <= 2 }
  }
  // 계란흰자형 점액도 배란 근처 신호.
  const eggwhite = cycleLogs
    .filter((c) => c.cervicalMucus === 'eggwhite' && c.date >= lastStart && c.date <= targetDate)
    .map((c) => c.date)
    .sort()
  if (eggwhite.length > 0) {
    const date = eggwhite[eggwhite.length - 1]
    return { date, source: 'mucus', confidence: 'low', inWindow: Math.abs(daysBetween(targetDate, date)) <= 2 }
  }
  // 근거 없으면 next-14 추정. 예측이 있을 때만, 낮은 confidence로.
  if (!nextPeriodDate) return undefined
  const date = addDays(nextPeriodDate, -14)
  // "next-14"를 실제 배란처럼 다루지 않는다 — confidence는 예측 confidence에서 한 단계 낮춘다.
  const conf: CycleConfidence = baseConfidence === 'high' ? 'medium' : 'low'
  return { date, source: 'estimated', confidence: conf, inWindow: Math.abs(daysBetween(targetDate, date)) <= 2 }
}

/* ---------------------------------------------------------------------
   buildCycleContext (prospective) — 미래 데이터 사용 금지
   --------------------------------------------------------------------- */
const EMPTY_CONTEXT: CycleContext = {
  isPeriod: false,
  isPremenstrualWindow: false,
  isOvulationWindow: false,
  confidence: 'none',
}

/**
 * targetDate 시점의 주기 context. cycleLogs 중 date ≤ targetDate만 사용한다.
 * ⚠️ 미래(아직 오지 않은) periodStart를 사용하지 않는다(look-ahead 금지).
 * settings는 레거시 호환용으로만 받는다 — averageCycleLength를 예측 근거로 쓰지 않는다.
 */
export function buildCycleContext(
  targetDate: ISODate,
  cycleLogs: CycleLog[],
  settings?: UserSettings,
): CycleContext {
  // settings(averageCycleLength 등)는 레거시 호환용으로만 받는다 — V2 예측 근거로 쓰지 않는다.
  void settings
  const starts = cycleStartDates(cycleLogs, targetDate)
  if (starts.length === 0) return { ...EMPTY_CONTEXT }

  const lastStart = starts[starts.length - 1]
  const intervals = cycleLengths(starts)
  const recentIntervals = intervals.slice(-6)
  const confidence = dataConfidence(starts.length)
  const historyStats = cycleHistoryStats(intervals)

  // 예측은 실제 관찰 간격이 있을 때만. 없으면 undefined(28일 fallback 금지).
  const hasEstimate = recentIntervals.length >= 1
  const estimatedCycleLength = hasEstimate ? Math.round(median(recentIntervals)) : undefined
  const nextPeriodDate = hasEstimate ? addDays(lastStart, estimatedCycleLength!) : undefined
  const daysUntilNextPeriod = nextPeriodDate ? daysBetween(targetDate, nextPeriodDate) : undefined
  const prospective = prospectivePeriodWindow(targetDate, cycleLogs)

  // 생리 구간(사실 우선, 없으면 추정 표시)
  const span = periodDuration(lastStart, cycleLogs, targetDate)
  const isPeriod = targetDate >= lastStart && targetDate <= span.endDate
  const periodDay = isPeriod ? daysBetween(lastStart, targetDate) + 1 : undefined
  const periodDayIsEstimated = isPeriod ? span.estimated : undefined

  // PMS 구간: 예측이 있을 때만 표시(근거 없는 확정 금지).
  const isPremenstrualWindow =
    !isPeriod && daysUntilNextPeriod !== undefined && daysUntilNextPeriod >= 1 && daysUntilNextPeriod <= 7

  // 배란 estimate + window (저confidence는 window 확정에서 제외)
  const ovulationEstimate = computeOvulationEstimate(targetDate, lastStart, nextPeriodDate, cycleLogs, confidence)
  const isOvulationWindow = !isPeriod && !!ovulationEstimate?.inWindow && confidence !== 'low' && confidence !== 'none'

  return {
    isPeriod,
    periodDay,
    periodDayIsEstimated,
    daysUntilNextPeriod,
    estimatedCycleLength,
    nextPeriodDate,
    isPremenstrualWindow,
    isOvulationWindow,
    confidence,
    prospective,
    historyStats,
    ovulationEstimate,
  }
}

/* ---------------------------------------------------------------------
   I. 주기 부하 — 신뢰도 정책 반영
   데이터가 부족한데 "PMS 추정"만으로 큰 부하가 들어가지 않게 한다.
   명시적 실제 period/flow/pain은 그대로 활용한다.
   --------------------------------------------------------------------- */
export function calcCycleLoad(ctx: CycleContext, todayCycleLog?: CycleLog): number {
  let base: number
  if (ctx.isPeriod && ctx.periodDay !== undefined && ctx.periodDay <= 2) {
    base = 75 // 실제 기록된 생리 시작 기반 — 사실
  } else if (ctx.isPeriod) {
    base = 55
  } else if (ctx.isPremenstrualWindow) {
    // PMS는 추정 구간 — confidence에 따라 base를 낮춘다.
    base = ctx.confidence === 'high' ? 60 : ctx.confidence === 'medium' ? 45 : 20
  } else if (ctx.isOvulationWindow) {
    base = ctx.confidence === 'high' ? 35 : 20
  } else {
    base = 10
  }

  let load = base
  // 실제 기록된 통증/출혈은 confidence와 무관하게 사실로 가산.
  load += (todayCycleLog?.periodPain ?? 0) * 3
  if (todayCycleLog?.flowLevel === 'heavy') load += 10

  if (ctx.confidence === 'none') load = Math.min(load, 10)

  return roundScore(clamp(load, 0, 100))
}
