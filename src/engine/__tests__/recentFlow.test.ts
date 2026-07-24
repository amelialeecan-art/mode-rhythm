import { describe, expect, it } from 'vitest'
import { buildRecentFlow, type RecentFlowDay } from '../recentFlow'
import { addDaysISO } from '../correlation'

const END = '2026-06-20'
// 최근 n일 + 그 이전 baseline 기간을 함께 만든다.
function build(n: number, fn: (i: number, date: string) => Partial<RecentFlowDay>): RecentFlowDay[] {
  const out: RecentFlowDay[] = []
  for (let i = n - 1; i >= 0; i--) {
    const date = addDaysISO(END, -i)
    out.push({ date, ...fn(n - 1 - i, date) })
  }
  return out
}
const base = (v: number) => ({ emotional: v, appetite: v, sleep: v, body: v, functionLevel: 1 })

describe('buildRecentFlow', () => {
  it('여러 영역이 함께 악화 → depleting, 유지 영역 분리', () => {
    // 이전 10일 안정(30) + 최근 6일 수면·몸·생활기능 상승, 식욕은 유지
    const days = build(16, (i) => {
      if (i < 10) return base(30)
      const up = 30 + (i - 9) * 12
      return { emotional: 34, appetite: 30, sleep: up, body: up, functionLevel: i >= 12 ? 3 : 2 }
    })
    const f = buildRecentFlow(days)
    expect(f.displayable).toBe(true)
    expect(f.status).toBe('depleting')
    expect(f.holding).toContain('appetite')
    expect(f.leading.length).toBeLessThanOrEqual(2)
    expect(f.leading).toEqual(expect.arrayContaining(['sleep']))
    expect(f.lengthDays).toBeGreaterThanOrEqual(2)
  })

  it('여러 영역이 함께 호전 → recovering', () => {
    const days = build(16, (i) => {
      if (i < 10) return base(75)
      const down = 75 - (i - 9) * 12
      return { emotional: down, appetite: 72, sleep: down, body: down, functionLevel: 1 }
    })
    expect(buildRecentFlow(days).status).toBe('recovering')
  })

  it('영역별 방향이 다르면 mixed', () => {
    const days = build(16, (i) => {
      if (i < 10) return base(45)
      const t = i - 9
      return { emotional: 45 + t * 12, appetite: 45, sleep: 45 - t * 12, body: 45, functionLevel: 1 }
    })
    expect(buildRecentFlow(days).status).toBe('mixed')
  })

  it('모두 평소 범위면 stable', () => {
    expect(buildRecentFlow(build(16, () => base(40))).status).toBe('stable')
  })

  it('기록이 약하면 숨김(displayable=false)', () => {
    const days = build(2, () => base(40))
    expect(buildRecentFlow(days).displayable).toBe(false)
  })

  it('하루 급변만으로는 흐름을 선언하지 않음(마지막 하루 스파이크 → stable)', () => {
    const days = build(16, (i) => (i === 15 ? base(90) : base(35)))
    const f = buildRecentFlow(days)
    expect(f.status).toBe('stable')
    expect(f.leading).toEqual([])
  })

  it('판단 가능한 영역이 3개 미만이면 숨김', () => {
    // 감정만 기록, 나머지 영역 없음
    const days = build(16, (i) => ({ emotional: i < 10 ? 30 : 30 + (i - 9) * 12 }))
    expect(buildRecentFlow(days).displayable).toBe(false)
  })

  it('예외일은 최근 흐름의 경계가 되어 전후 기록을 이어 붙이지 않는다', () => {
    const before = build(16, () => base(35))
    const exceptionDate = addDaysISO(END, 1)
    const after = Array.from({ length: 6 }, (_, i) => ({ date: addDaysISO(exceptionDate, i + 1), ...base(35) }))
    const flow = buildRecentFlow([
      ...before,
      { date: exceptionDate, emotional: 100, appetite: 100, sleep: 100, body: 100, functionLevel: 4, excluded: true },
      ...after,
    ])
    expect(flow.status).toBe('stable')
    expect(flow.displayable).toBe(true)
    expect(flow.startDate).toBe(after[0].date)
    expect(flow.lengthDays).toBe(6)
  })

  it('단일 영역 변화만으로는 depleting 선언 안 함(→ stable)', () => {
    const days = build(16, (i) => ({
      emotional: i < 10 ? 30 : 30 + (i - 9) * 12,
      appetite: 30,
      sleep: 30,
      body: 30,
      functionLevel: 1,
    }))
    expect(buildRecentFlow(days).status).toBe('stable')
  })
})
