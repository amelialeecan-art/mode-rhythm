/* =====================================================================
   MODE · 생리 주기 자동 계산 (순수 함수)
   사용자는 cycleLogs에 사실(시작/종료/출혈량/생리통)만 기록한다.
   여기서 날짜 기반으로 "구간(가능성)"을 계산한다. 단정하지 않는다.
   ===================================================================== */
import type { CycleLog, ISODate, UserSettings } from '../data/models'
import { parseISODate, toISODate } from '../lib/date'
import { clamp, roundScore } from './guards'

export type CycleConfidence = 'none' | 'low' | 'medium' | 'high'

export interface CycleContext {
  isPeriod: boolean
  periodDay?: number
  daysUntilNextPeriod?: number
  estimatedCycleLength?: number
  nextPeriodDate?: ISODate
  isPremenstrualWindow: boolean
  isOvulationWindow: boolean
  confidence: CycleConfidence
}

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

const EMPTY_CONTEXT: CycleContext = {
  isPeriod: false,
  isPremenstrualWindow: false,
  isOvulationWindow: false,
  confidence: 'none',
}

/**
 * targetDate 시점의 주기 context(가능성)를 계산한다.
 * cycleLogs가 부족하면 confidence를 low/none으로 둔다.
 */
export function buildCycleContext(
  targetDate: ISODate,
  cycleLogs: CycleLog[],
  settings?: UserSettings,
): CycleContext {
  // 시작일들 (targetDate 이하만 — 미래는 보지 않음), 오름차순
  const starts = cycleLogs
    .filter((c) => c.periodStart && c.date <= targetDate)
    .map((c) => c.date)
    .sort()

  if (starts.length === 0) return { ...EMPTY_CONTEXT }

  const lastStart = starts[starts.length - 1]

  // 최근 6회 이내 간격의 중앙값
  const intervals: number[] = []
  for (let i = 1; i < starts.length; i++) {
    intervals.push(daysBetween(starts[i - 1], starts[i]))
  }
  const recentIntervals = intervals.slice(-6).filter((d) => d > 0)

  const fallbackLength = settings?.averageCycleLength ?? 28
  const estimatedCycleLength = recentIntervals.length > 0 ? Math.round(median(recentIntervals)) : fallbackLength

  // confidence: 시작일 수 기준
  let confidence: CycleConfidence
  if (starts.length >= 4) confidence = 'high'
  else if (starts.length >= 2) confidence = 'medium'
  else confidence = 'low'

  // 현재 생리 중 판정
  const ends = cycleLogs
    .filter((c) => c.periodEnd && c.date >= lastStart && c.date <= targetDate)
    .map((c) => c.date)
    .sort()
  const periodDayCandidate = daysBetween(lastStart, targetDate) + 1
  let isPeriod = false
  if (targetDate >= lastStart) {
    if (ends.length > 0) {
      // 명시적 종료가 있으면 시작~종료 사이
      isPeriod = targetDate <= ends[ends.length - 1]
    } else {
      // 종료 없으면 시작 후 1~6일 이내를 생리 중으로 추정
      isPeriod = periodDayCandidate >= 1 && periodDayCandidate <= 6
    }
  }
  const periodDay = isPeriod ? periodDayCandidate : undefined

  const nextPeriodDate = addDays(lastStart, estimatedCycleLength)
  const daysUntilNextPeriod = daysBetween(targetDate, nextPeriodDate)

  const isPremenstrualWindow = daysUntilNextPeriod >= 1 && daysUntilNextPeriod <= 7
  const ovulationDate = addDays(nextPeriodDate, -14)
  const isOvulationWindow = Math.abs(daysBetween(targetDate, ovulationDate)) <= 2

  return {
    isPeriod,
    periodDay,
    daysUntilNextPeriod,
    estimatedCycleLength,
    nextPeriodDate,
    isPremenstrualWindow,
    isOvulationWindow,
    confidence,
  }
}

/** 주기 부하. 구간 기반 base + 통증/출혈 보정 + confidence 보정. */
export function calcCycleLoad(ctx: CycleContext, todayCycleLog?: CycleLog): number {
  let base: number
  if (ctx.isPeriod && ctx.periodDay !== undefined && ctx.periodDay <= 2) base = 75
  else if (ctx.isPeriod) base = 55
  else if (ctx.isPremenstrualWindow) base = 60
  else if (ctx.isOvulationWindow) base = 35
  else base = 10

  let load = base
  load += (todayCycleLog?.periodPain ?? 0) * 3
  if (todayCycleLog?.flowLevel === 'heavy') load += 10

  if (ctx.confidence === 'low') load *= 0.75
  if (ctx.confidence === 'none') load = Math.min(load, 10)

  return roundScore(clamp(load, 0, 100))
}
