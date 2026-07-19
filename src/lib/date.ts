/* =====================================================================
   MODE · 날짜 유틸 (가벼운 헬퍼만)
   타임존/자정 경계는 로컬 기준 ISODate('YYYY-MM-DD')로 통일한다.
   ===================================================================== */
import type { ISODate } from '../data/types'

/** 로컬 자정 기준 'YYYY-MM-DD'. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 오늘(로컬) ISODate. UTC slice 대신 로컬 자정 기준을 보장. */
export function getTodayISODate(): ISODate {
  return toISODate(new Date())
}

/** 'YYYY-MM-DD' → 로컬 Date (자정). */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** '6월 21일' 형태. */
export function formatMonthDay(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** '일요일' 형태. */
export function formatWeekday(d: Date): string {
  return `${WEEKDAY[d.getDay()]}요일`
}

/* ---------------------------------------------------------------------
   월 단위 helper (캘린더용). 모두 로컬 날짜 기준 — UTC 자정 문제 회피.
   --------------------------------------------------------------------- */

/** date의 month에 amount를 더한 "그 달 1일" Date. */
export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

/** 그 달 1일 Date. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** 그 달 마지막 날 Date. */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

/** 그 달 1일 ISODate. */
export function startOfMonthISO(date: Date): ISODate {
  return toISODate(startOfMonth(date))
}

/** 그 달 마지막 날 ISODate. */
export function endOfMonthISO(date: Date): ISODate {
  return toISODate(endOfMonth(date))
}

/** 'YYYY년 M월' 형태. */
export function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

/** ISODate 동일 여부(문자열 비교 — 같은 형식 전제). */
export function isSameISODate(a: ISODate, b: ISODate): boolean {
  return a === b
}

export interface MonthGridCell {
  date: ISODate
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
}

/**
 * 일요일 시작 7열 월 grid. 앞뒤 패딩은 인접 달 날짜로 채우되 isCurrentMonth=false.
 * 필요한 주 수만 생성한다(트레일링 빈 주 없음).
 */
export function getMonthGrid(anchor: Date, today: ISODate = getTodayISODate()): MonthGridCell[] {
  const first = startOfMonth(anchor)
  const startWeekday = first.getDay() // 0=일
  const daysInMonth = endOfMonth(anchor).getDate()
  const weeks = Math.ceil((startWeekday + daysInMonth) / 7)
  const cells: MonthGridCell[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(first.getFullYear(), first.getMonth(), 1 - startWeekday + i)
    const iso = toISODate(d)
    cells.push({
      date: iso,
      dayNumber: d.getDate(),
      isCurrentMonth: d.getMonth() === first.getMonth(),
      isToday: iso === today,
    })
  }
  return cells
}

