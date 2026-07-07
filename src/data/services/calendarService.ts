/* =====================================================================
   MODE · Calendar 조회 서비스 (Phase 5)
   service가 repository에서 모아 UI가 쓰기 좋은 ViewModel로 변환한다.
   Calendar는 점수를 새로 "계산"하지 않고 저장된 dailyScores를 "조회"한다.
   상관/공범/회복효과/예보는 여기 없다.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { dailyLogRepository } from '../repositories/dailyLogRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { recoveryLogRepository } from '../repositories/recoveryLogRepository'
import { DAY_TYPE_SHORT_LABEL } from '../../engine'
import { inferStateCodes, STATE_PRESETS } from '../catalog/statePresets'
import {
  addMonths,
  endOfMonthISO,
  formatMonthLabel,
  getMonthGrid,
  parseISODate,
  startOfMonthISO,
} from '../../lib/date'
import type {
  CycleLog,
  DailyLog,
  DailyScore,
  DayTypeCode,
  EventLog,
  ISODate,
  RecoveryLog,
} from '../models'

/** 캘린더 렌즈. 각 렌즈는 dailyScore의 한 항목에 매핑된다. */
export type CalendarLens =
  | 'overall'
  | 'emotion'
  | 'appetite'
  | 'sleep'
  | 'body'
  | 'cycle'
  | 'event'
  | 'recovery'

/** 렌즈별 점수(0~100) 묶음. */
export interface LensScores {
  overall: number
  emotion: number
  appetite: number
  sleep: number
  body: number
  cycle: number
  event: number
  recovery: number
}

export interface CalendarMonthDay {
  date: ISODate
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  hasEntry: boolean
  dayType?: DayTypeCode
  shortLabel?: string
  scores?: LensScores
}

export interface CalendarMonthViewModel {
  monthLabel: string
  /** 이 달 1일 / 마지막 날 (현재 달 기준). */
  startDate: ISODate
  endDate: ISODate
  /** 일요일 시작 7열 grid (패딩 포함). */
  days: CalendarMonthDay[]
}

export interface CalendarDayDetail {
  date: ISODate
  hasEntry: boolean
  dailyScore?: DailyScore
  dailyLog?: DailyLog
  eventLogs: EventLog[]
  cycleLogs: CycleLog[]
  recoveryLogs: RecoveryLog[]
  /** "오늘 상태" 라벨 (저장 메타데이터 우선, 없으면 숫자값에서 추론). 원인 아님 — 상태 기록. */
  stateLabels: string[]
}

function toLensScores(s: DailyScore): LensScores {
  return {
    overall: s.rhythmLoad,
    emotion: s.emotionalLoad,
    appetite: s.appetiteLoad,
    sleep: s.sleepLoad,
    body: s.bodyLoad,
    cycle: s.cycleLoad,
    event: s.eventLoad,
    recovery: s.recoveryScore ?? 0,
  }
}

/** monthDate(그 달의 아무 날) 기준 월 ViewModel. */
export async function getCalendarMonth(monthDate: ISODate): Promise<CalendarMonthViewModel> {
  const anchor = parseISODate(monthDate)
  const grid = getMonthGrid(anchor)
  const rangeStart = grid[0].date
  const rangeEnd = grid[grid.length - 1].date

  const scores = await dailyScoreRepository.listByDateRange(rangeStart, rangeEnd)
  const byDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))

  const days: CalendarMonthDay[] = grid.map((cell) => {
    const score = byDate.get(cell.date)
    if (!score) {
      return { ...cell, hasEntry: false }
    }
    return {
      ...cell,
      hasEntry: true,
      dayType: score.dayType,
      shortLabel: DAY_TYPE_SHORT_LABEL[score.dayType],
      scores: toLensScores(score),
    }
  })

  return {
    monthLabel: formatMonthLabel(anchor),
    startDate: startOfMonthISO(anchor),
    endDate: endOfMonthISO(anchor),
    days,
  }
}

/** 특정 날짜의 상세(저장 기록 모음). 기록이 전혀 없으면 hasEntry=false로 반환. */
export async function getCalendarDayDetail(date: ISODate): Promise<CalendarDayDetail> {
  const [dailyScore, dailyLog, eventLogs, cycleLogs, recoveryLogs] = await Promise.all([
    dailyScoreRepository.getByDate(date),
    dailyLogRepository.getByDate(date),
    eventLogRepository.listByDate(date),
    cycleLogRepository.listByDate(date),
    recoveryLogRepository.listByDate(date),
  ])

  const hasEntry =
    dailyLog != null || eventLogs.length > 0 || cycleLogs.length > 0 || recoveryLogs.length > 0

  return { date, hasEntry, dailyScore, dailyLog, eventLogs, cycleLogs, recoveryLogs, stateLabels: stateLabelsFor(dailyLog) }
}

/** dailyLog → "오늘 상태" 라벨 목록 (메타데이터 우선, 없으면 숫자값 추론). */
function stateLabelsFor(dailyLog?: DailyLog): string[] {
  if (!dailyLog) return []
  const codes = dailyLog.stateCodes ?? inferStateCodes(dailyLog)
  // STATE_PRESETS 기준 — UI 칩에서 빠진 legacy 코드('식욕 변동')도 라벨 복원 가능
  return codes.map((c) => STATE_PRESETS.find((s) => s.code === c)?.label).filter((l): l is string => !!l)
}

/** 월 이동 helper (UI 편의). */
export function shiftMonthISO(monthDate: ISODate, amount: number): ISODate {
  return startOfMonthISO(addMonths(parseISODate(monthDate), amount))
}
