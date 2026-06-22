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

/** toISODate 별칭 (로컬 날짜 기준임을 이름으로 명시). */
export const toISODateLocal = toISODate

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
