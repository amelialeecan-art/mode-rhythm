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
import { DAY_TYPE_SHORT_LABEL, resolveDailyStateDomains, type DailyStateDomains, type DomainReading } from '../../engine'
import type { EmotionCode } from '../models'
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
  /** 사용자가 직접 상태를 입력한 날인지(몸 신호·수면·메모만 있는 날은 false). */
  hasStateInput: boolean
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

  const [scores, logs] = await Promise.all([
    dailyScoreRepository.listByDateRange(rangeStart, rangeEnd),
    dailyLogRepository.listByDateRange(rangeStart, rangeEnd),
  ])
  const byDate = new Map<ISODate, DailyScore>(scores.map((s) => [s.date, s]))
  const logByDate = new Map<ISODate, DailyLog>(logs.map((l) => [l.date, l]))

  const days: CalendarMonthDay[] = grid.map((cell) => {
    const score = byDate.get(cell.date)
    if (!score) {
      return { ...cell, hasEntry: false }
    }
    // 상태를 직접 입력하지 않은 날을 '안정'으로 오인 표시하지 않는다(라벨만 비우고 기록·점수는 유지).
    if (score.dayType === 'stable' && !hasDirectStateInput(logByDate.get(cell.date))) {
      return { ...cell, hasEntry: true, scores: toLensScores(score) }
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

  return { date, hasEntry, dailyScore, dailyLog, eventLogs, cycleLogs, recoveryLogs, stateLabels: stateLabelsFor(dailyLog), hasStateInput: hasDirectStateInput(dailyLog) }
}

/* 캘린더용 사람말 라벨. 개발자식 필드명(몸 에너지·생활기능·감정 부담…)은 노출하지 않는다.
   resolveDailyStateDomains를 쓰므로 새 직접 입력·옛 stateCodes/숫자값이 모두 인정된다.
   입력하지 않은 항목은 아예 넣지 않는다(정상·보통으로 채우지 않음). */
const CAP_LOW = 35 // capacity: 이하이면 낮음(어려운 상태)
const CAP_HIGH = 68 // capacity: 이상이면 좋음
const STRAIN_HIGH = 60 // strain: 이상이면 힘든 상태
const STRAIN_LOW = 30 // strain: 이하이면 편안

/** 두드러진 감정 코드 → 사람말 명사. */
const EMOTION_WORD: Record<EmotionCode, string> = {
  sensitive: '예민함',
  irritated: '짜증',
  angry: '화',
  anxious: '불안',
  down: '가라앉은 기분',
  tearful: '울컥함',
  lethargic: '무기력함',
  other: '힘든 감정',
}
/** 옛 stateCodes 감정 → 사람말 명사(숫자만 남은 옛 기록 대비). */
const LEGACY_EMOTION_WORD: Record<string, string> = {
  irritable: '예민함', annoyed: '짜증', angry: '화', anxious: '불안', sad: '가라앉은 기분', tearful: '울컥함', lethargic: '무기력함',
}

function capLabel(r: DomainReading | undefined, low: string, high: string, mid?: string): string | undefined {
  if (!r) return undefined
  if (r.value <= CAP_LOW) return low
  if (r.value >= CAP_HIGH) return high
  return mid
}
function strainLabel(r: DomainReading | undefined, high: string, low?: string, mid?: string): string | undefined {
  if (!r) return undefined
  if (r.value >= STRAIN_HIGH) return high
  if (r.value <= STRAIN_LOW) return low
  return mid
}

/**
 * 사용자가 "직접 상태(마음·감정·에너지·집중·사람 여유·생활기능)"를 실제로 입력했는가.
 * ⚠️ 몸 신호·수면·메모는 상태 입력으로 치지 않는다(그것만 있는 날을 '안정'으로 오인하지 않기 위함).
 *    scoring/판정은 건드리지 않고, 달력 표시 조건에만 쓴다.
 */
function hasDirectStateInput(log: DailyLog | undefined): boolean {
  if (!log) return false
  if (
    log.emotionalStabilityLevel != null ||
    log.bodyEnergyLevel != null ||
    log.mentalSpaceLevel != null ||
    log.focusLevel != null ||
    log.socialCapacityLevel != null ||
    log.functionLevel != null
  )
    return true
  if ((log.emotionCodes?.length ?? 0) > 0 || (log.mindSignalCodes?.length ?? 0) > 0 || (log.stateCodes?.length ?? 0) > 0) return true
  if (log.appetiteRatings && Object.values(log.appetiteRatings).some((v) => typeof v === 'number')) return true
  // 옛 숫자 상태(감정·에너지·집중·식욕) — 몸/수면 숫자는 제외.
  const stateNumeric =
    log.moodLow + log.anxiety + log.irritability + log.sadness + log.heaviness + log.calm + log.energy + log.focus + log.selfCriticism + log.impulsivity + log.appetite + log.sweetCraving + log.saltyCraving + log.bingeUrge
  return stateNumeric > 0
}

/** dailyLog → "오늘 상태" 사람말 라벨 목록. 입력된 항목만, 미입력은 표시하지 않음. */
function stateLabelsFor(dailyLog?: DailyLog): string[] {
  if (!dailyLog) return []
  const d: DailyStateDomains = resolveDailyStateDomains(dailyLog)
  const out: string[] = []

  // 감정 안정감(수용력) — 높으면 안정, 낮으면 흔들림.
  const stab = capLabel(d.emotionalStability, '감정이 쉽게 흔들렸어요', '감정이 대체로 안정적이었어요', '감정이 조금 흔들렸어요')
  if (stab) out.push(stab)

  // 두드러진 감정(감정 부담 대체) — 실제 고른 감정만.
  const codes: string[] = (dailyLog.emotionCodes as EmotionCode[] | undefined)?.length
    ? (dailyLog.emotionCodes as EmotionCode[]).map((c) => EMOTION_WORD[c])
    : (dailyLog.stateCodes ?? []).map((c) => LEGACY_EMOTION_WORD[c]).filter(Boolean)
  if (codes.length > 0) out.push(`${codes.slice(0, 3).join('·')} 같은 감정이 영향을 줬어요`)

  const bodyEnergy = capLabel(d.bodyEnergy, '몸이 쉽게 지쳤어요', '몸 상태는 괜찮았어요', '몸이 조금 무거웠어요')
  if (bodyEnergy) out.push(bodyEnergy)
  const mental = capLabel(d.mentalSpace, '머리가 복잡했어요', '머릿속이 여유로웠어요', '머리가 조금 복잡했어요')
  if (mental) out.push(mental)
  const focus = capLabel(d.focus, '집중하기 어려웠어요', '집중이 잘 됐어요', '집중이 조금 흐트러졌어요')
  if (focus) out.push(focus)
  const social = capLabel(d.socialCapacity, '사람을 대하기 버거웠어요', '사람을 대할 여유가 있었어요', '사람 대하기가 조금 버거웠어요')
  if (social) out.push(social)
  const sleep = strainLabel(d.sleep, '잠이 부족했어요', '잠은 잘 잤어요', '잠이 조금 부족했어요')
  if (sleep) out.push(sleep)
  const appetite = strainLabel(d.appetite, '식욕이 흔들렸어요', '식욕은 안정적이었어요', '식욕이 조금 흔들렸어요')
  if (appetite) out.push(appetite)
  const fn = strainLabel(d.functionLevel, '평소 하던 일이 버거웠어요', '평소처럼 지냈어요', '평소 하던 일이 조금 버거웠어요')
  if (fn) out.push(fn)

  return out
}

/** 월 이동 helper (UI 편의). */
export function shiftMonthISO(monthDate: ISODate, amount: number): ISODate {
  return startOfMonthISO(addMonths(parseISODate(monthDate), amount))
}
