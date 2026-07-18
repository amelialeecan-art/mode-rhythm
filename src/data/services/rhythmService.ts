/* =====================================================================
   MODE · 리듬 화면 서비스 (Phase 8 — 예측 아님, 실제 기록 기반 흐름)
   최근 N일 dailyScores를 시계열로 모으고, 날짜 기반 주기 구간을 오버레이로
   계산한다. service가 repository에서 모아 engine(순수 함수)로 주기를 계산한다.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { addDaysISO, buildCycleContext } from '../../engine'
import { getTodayISODate, parseISODate, formatMonthDay } from '../../lib/date'
import type { DailyScore, ISODate } from '../models'

export type CyclePhase = 'period' | 'premenstrual' | 'ovulation'

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
  /** 날짜 기반으로 계산된 주기 구간(있으면). 사용자가 고른 원인이 아님. */
  cyclePhase: CyclePhase | null
}

export interface RhythmObservation {
  title: string
  body: string
}

export interface RhythmViewModel {
  startDate: ISODate
  endDate: ISODate
  days: RhythmDay[]
  /** today가 범위 안이면 그 인덱스, 아니면 -1. */
  todayIndex: number
  /** 점수가 있는 날 수. */
  dayCount: number
  hasData: boolean
  observations: RhythmObservation[]
}

export interface RhythmOptions {
  endDate?: ISODate
  days?: number
}

const DEFAULT_DAYS = 30
const CYCLE_HISTORY_FLOOR = '1900-01-01'

function phaseOf(date: ISODate, cycleLogs: Parameters<typeof buildCycleContext>[1], settings: Parameters<typeof buildCycleContext>[2]): CyclePhase | null {
  const ctx = buildCycleContext(date, cycleLogs, settings)
  if (ctx.isPeriod) return 'period'
  if (ctx.isPremenstrualWindow) return 'premenstrual'
  if (ctx.isOvulationWindow) return 'ovulation'
  return null
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
}

function buildObservations(scored: RhythmDay[], days: RhythmDay[]): RhythmObservation[] {
  const out: RhythmObservation[] = []
  if (scored.length === 0) return out

  // 1) 감정 흔들림 정점
  const peak = scored.reduce((a, b) => ((b.emotional ?? 0) > (a.emotional ?? 0) ? b : a))
  out.push({
    title: '감정 흔들림이 가장 컸던 날',
    body: `${formatMonthDay(parseISODate(peak.date))} (감정 ${peak.emotional ?? 0})로 기록됐어요.`,
  })

  // 2) 감정·식욕 동반 상승 (경향만)
  const coMove = scored.filter((d) => (d.emotional ?? 0) >= 55 && (d.appetite ?? 0) >= 55).length
  if (coMove >= 2) {
    out.push({
      title: '감정과 식욕이 함께 오른 편',
      body: `이 기간에 ${coMove}일은 감정 흔들림과 식욕 흔들림이 함께 높게 기록됐어요. 함께 나타나는 경향이에요.`,
    })
  }

  // 3) 최근 흐름 (최근 7일 vs 그 전 7일 rhythm)
  if (scored.length >= 10) {
    const recent = scored.slice(-7).map((d) => d.rhythm ?? 0)
    const prev = scored.slice(-14, -7).map((d) => d.rhythm ?? 0)
    if (prev.length >= 3) {
      const diff = mean(recent) - mean(prev)
      const word = diff <= -8 ? '낮게' : diff >= 8 ? '높게' : '비슷하게'
      out.push({
        title: '최근 일주일 흐름',
        body: `최근 일주일은 그 전보다 전반적인 버거움이 ${word} 기록된 편이에요.`,
      })
    }
  }

  // 4) 주기 구간 안내
  if (days.some((d) => d.cyclePhase !== null)) {
    out.push({
      title: '주기 구간 표시',
      body: '이 기간에는 날짜 기준으로 계산된 주기 구간이 색 띠로 함께 표시돼 있어요.',
    })
  }

  return out
}

/** 리듬 화면 ViewModel. 예측 없음 — 저장된 점수의 시계열 + 주기 오버레이. */
export async function getRhythmViewModel(opts: RhythmOptions = {}): Promise<RhythmViewModel> {
  const endDate = opts.endDate ?? getTodayISODate()
  const span = opts.days ?? DEFAULT_DAYS
  const startDate = addDaysISO(endDate, -(span - 1))
  const today = getTodayISODate()

  const [scores, cycleLogs, settings] = await Promise.all([
    dailyScoreRepository.listByDateRange(startDate, endDate),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
    userSettingsRepository.get(),
  ])
  const byDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))

  const days: RhythmDay[] = []
  for (let i = 0; i < span; i++) {
    const date = addDaysISO(startDate, i)
    const s = byDate.get(date)
    days.push({
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
    })
  }

  const scored = days.filter((d) => d.hasScore)
  const todayIndex = days.findIndex((d) => d.isToday)

  return {
    startDate,
    endDate,
    days,
    todayIndex,
    dayCount: scored.length,
    hasData: scored.length >= 2,
    observations: buildObservations(scored, days),
  }
}
