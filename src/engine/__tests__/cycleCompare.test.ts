import { describe, expect, it } from 'vitest'
import { buildCycleCompare } from '../cycleCompare'
import { addDaysISO } from '../correlation'
import type { ISODate } from '../../data/models'

const at = (arr: { rel: number; mean?: number; n: number }[], rel: number) => arr.find((p) => p.rel === rel)!

// 가변 주기(26/28/28일 간격) — 고정 28일 아님
const STARTS = ['2026-04-01', '2026-04-27', '2026-05-25', '2026-06-22']

function seed(setter: (start: ISODate, rel: number) => number | undefined): Map<ISODate, number> {
  const m = new Map<ISODate, number>()
  for (const s of STARTS) {
    for (let rel = -14; rel <= 7; rel++) {
      const v = setter(s, rel)
      if (v !== undefined) m.set(addDaysISO(s, rel), v)
    }
  }
  return m
}

describe('buildCycleCompare — 생리 시작 0일 정렬', () => {
  it('최근 주기(단일) vs 이전 3주기 평균, 실제 날짜차 사용(28일 강제 아님)', () => {
    const recent = '2026-06-22'
    const map = seed((s, rel) => (s === recent ? (rel >= -3 && rel <= 0 ? 80 : 50) : 50))
    const c = buildCycleCompare([...STARTS], map)
    expect(c.compareCycles).toBe(3)
    // 최근: 실제 시작(06-22) 기준 rel -1 = 06-21 값
    expect(at(c.recent, -1).mean).toBe(80)
    expect(at(c.recent, -1).n).toBe(1)
    expect(at(c.recent, -14).mean).toBe(50) // 06-08 (28일 가정과 무관)
    // 이전 평균: 3주기 × 50
    expect(at(c.previous, -1).mean).toBe(50)
    expect(at(c.previous, -1).n).toBe(3)
  })

  it('결측일은 0으로 세지 않음(이전 평균 표본만 줄어듦)', () => {
    const map = seed(() => 50)
    map.delete(addDaysISO('2026-04-27', 2)) // 한 이전 주기의 +2일 삭제
    const c = buildCycleCompare([...STARTS], map)
    expect(at(c.previous, 2).n).toBe(2) // 3 → 2
    expect(at(c.previous, 2).mean).toBe(50) // 0으로 희석 안 됨
  })

  it('미래 날짜를 만들지 않음(최근 +5..+7 기록 없으면 undefined)', () => {
    const recent = '2026-06-22'
    const map = seed((s, rel) => {
      if (s === recent && rel >= 5) return undefined // 최근 주기 +5 이후 기록 없음
      return 50
    })
    const c = buildCycleCompare([...STARTS], map)
    expect(at(c.recent, 6).mean).toBeUndefined()
    expect(at(c.recent, 6).n).toBe(0)
    expect(at(c.recent, 4).mean).toBe(50)
  })

  it('시작 기록 없으면 빈 곡선', () => {
    const c = buildCycleCompare([], new Map())
    expect(c.recent).toEqual([])
    expect(c.compareCycles).toBe(0)
  })
})
