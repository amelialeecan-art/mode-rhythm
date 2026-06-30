import { describe, expect, it } from 'vitest'
import {
  addMonths,
  startOfMonthISO,
  endOfMonthISO,
  getMonthGrid,
  isSameISODate,
  toISODate,
  getTodayISODate,
  parseISODate,
} from './date'

describe('month helpers', () => {
  it('startOfMonthISO / endOfMonthISO', () => {
    const d = new Date(2026, 5, 15) // 6월 15일
    expect(startOfMonthISO(d)).toBe('2026-06-01')
    expect(endOfMonthISO(d)).toBe('2026-06-30')
  })

  it('addMonths는 연도 경계를 넘는다', () => {
    const dec = new Date(2026, 11, 10) // 12월
    expect(toISODate(addMonths(dec, 1))).toBe('2027-01-01')
    expect(toISODate(addMonths(dec, -1))).toBe('2026-11-01')
  })

  it('getTodayISODate는 로컬 ISO 형식', () => {
    expect(getTodayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(getTodayISODate()).toBe(toISODate(new Date()))
  })

  it('isSameISODate', () => {
    expect(isSameISODate('2026-06-21', '2026-06-21')).toBe(true)
    expect(isSameISODate('2026-06-21', '2026-06-22')).toBe(false)
  })

  it('getMonthGrid는 7의 배수 칸, 일요일 시작, 현재월 일수 포함', () => {
    const grid = getMonthGrid(new Date(2026, 5, 1), '2026-06-15') // 2026-06: 1일=월요일
    expect(grid.length % 7).toBe(0)
    expect(parseISODate(grid[0].date).getDay()).toBe(0) // 첫 칸은 일요일
    const current = grid.filter((c) => c.isCurrentMonth)
    expect(current).toHaveLength(30) // 6월은 30일
    expect(grid.find((c) => c.isToday)?.date).toBe('2026-06-15')
  })
})
