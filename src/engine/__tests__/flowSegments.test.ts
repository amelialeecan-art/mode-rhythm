import { describe, expect, it } from 'vitest'
import { buildFlowSegments } from '../flowSegments'
import { buildRecentFlow, type RecentFlowDay } from '../recentFlow'
import { addDaysISO } from '../correlation'

/** start부터 n일 연속 기록을 만든다. */
function seq(start: string, n: number, fn: (i: number) => Partial<RecentFlowDay>): RecentFlowDay[] {
  const out: RecentFlowDay[] = []
  for (let i = 0; i < n; i++) out.push({ date: addDaysISO(start, i), ...fn(i) })
  return out
}
const flat = (v: number) => ({ emotional: v, appetite: v, sleep: v, body: v, functionLevel: 1 as const })

describe('buildFlowSegments', () => {
  it('달을 넘는 하나의 흐름 → 끊지 않고 한 구간', () => {
    // 1/25~2/14, 수면·몸·생활기능이 꾸준히 악화(감정·식욕은 유지)
    const days = seq('2026-01-25', 21, (i) => ({
      emotional: 34,
      appetite: 30,
      sleep: 30 + i * 3,
      body: 30 + i * 3,
      functionLevel: (i < 7 ? 1 : i < 14 ? 2 : 3) as 1 | 2 | 3,
    }))
    const segs = buildFlowSegments(days)
    expect(segs.length).toBe(1)
    expect(segs[0].status).toBe('depleting')
    // 앞쪽 판정 불가일은 제외 → 실제 판정 가능한 첫날부터 시작
    expect(segs[0].startDate).toBe('2026-01-29')
    expect(segs[0].endDate).toBe('2026-02-14')
    // 달을 넘어도 하나의 구간(달력 17일)
    expect(segs[0].lengthDays).toBe(17)
    expect(segs[0].leading.length).toBeLessThanOrEqual(2)
    expect(segs[0].leading).toEqual(expect.arrayContaining(['sleep']))
    expect(segs[0].changing).toEqual(expect.arrayContaining(['function']))
    expect(segs[0].holding).toEqual(expect.arrayContaining(['appetite']))
  })

  it('소모→회복 전환이 두 구간으로 나뉜다', () => {
    const peak = 13
    const days = seq('2026-03-20', 28, (i) => {
      const s = i <= peak ? 30 + i * 3 : 69 - (i - peak) * 4
      return { emotional: 34, appetite: 30, sleep: s, body: s, functionLevel: 1 }
    })
    const segs = buildFlowSegments(days)
    const statuses = segs.map((s) => s.status)
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(statuses[0]).toBe('depleting')
    expect(statuses[statuses.length - 1]).toBe('recovering')
    expect(statuses.indexOf('depleting')).toBeLessThan(statuses.lastIndexOf('recovering'))
  })

  it('하루짜리 이상치는 새 구간을 만들지 않는다', () => {
    const days = seq('2026-05-01', 20, (i) => {
      if (i === 10) return { emotional: 92, appetite: 92, sleep: 92, body: 92, functionLevel: 4 }
      return flat(35)
    })
    const segs = buildFlowSegments(days)
    expect(segs.length).toBe(1)
    expect(segs[0].status).toBe('stable')
  })

  it('영역별 방향이 엇갈리는 mixed 구간', () => {
    const days = seq('2026-06-01', 18, (i) => ({
      emotional: 30 + i * 3,
      appetite: 30,
      sleep: 64 - i * 3,
      body: 40,
      functionLevel: 1,
    }))
    const segs = buildFlowSegments(days)
    expect(segs.length).toBe(1)
    expect(segs[0].status).toBe('mixed')
    expect(segs[0].changing).toEqual(expect.arrayContaining(['emotional', 'sleep']))
    expect(segs[0].holding).toEqual(expect.arrayContaining(['appetite']))
  })

  it('긴 기록 공백은 이전 구간과 분리한다', () => {
    const a = seq('2026-03-01', 12, () => flat(35))
    const b = seq('2026-03-25', 12, () => flat(50)) // 12일 공백
    const segs = buildFlowSegments([...a, ...b])
    expect(segs.length).toBe(2)
    expect(segs[0].endDate).toBe('2026-03-12')
    expect(segs[1].startDate).toBe('2026-03-29')
    expect(segs.every((s) => s.status === 'stable')).toBe(true)
  })

  it('3~6일 공백이면 흐름을 분리하고, 2일 공백은 이어붙인다', () => {
    // 4일 공백(09-11~09-14) → 분리
    const a = seq('2026-09-01', 10, () => flat(35))
    const b = seq('2026-09-15', 10, () => flat(35))
    expect(buildFlowSegments([...a, ...b]).length).toBe(2)

    // 2일 공백(11-09~11-10) → 하나로 이어짐. 달력 일수와 유효 기록일 수는 다르다.
    const c = seq('2026-11-01', 8, () => flat(35))
    const d = seq('2026-11-11', 8, () => flat(35))
    const one = buildFlowSegments([...c, ...d])
    expect(one.length).toBe(1)
    expect(one[0].validDays).toBe(12) // 실제 기록일
    expect(one[0].lengthDays).toBe(14) // 달력 지속 일수(빠진 2일 포함)
  })

  it('예외일은 짧은 공백이어도 흐름 구간을 강제로 분리한다', () => {
    const a = seq('2026-12-01', 12, () => flat(35))
    const exception: RecentFlowDay = { date: '2026-12-13', ...flat(95), excluded: true }
    const b = seq('2026-12-14', 12, () => flat(35))
    const segs = buildFlowSegments([...a, exception, ...b])
    expect(segs).toHaveLength(2)
    expect(segs[0].endDate).toBe('2026-12-12')
    expect(segs[1].startDate).toBe('2026-12-18')
  })

  it('안정 구간은 억지로 소모·회복으로 나누지 않는다', () => {
    const segs = buildFlowSegments(seq('2026-07-01', 20, () => flat(40)))
    expect(segs.length).toBe(1)
    expect(segs[0].status).toBe('stable')
    // 앞쪽 판정 불가일 제외 → 판정 가능한 첫날부터 한 안정 구간
    expect(segs[0].startDate).toBe('2026-07-05')
    expect(segs[0].validDays).toBe(16)
    expect(segs[0].lengthDays).toBe(16)
    expect(segs[0].changing.length).toBe(0)
  })

  it('초반 데이터가 부족하면 구간을 만들지 않고, 판정 가능해지면 그 첫날부터 시작', () => {
    // 방향을 판단할 이력이 없는 짧은 블록 → 빈 배열
    expect(buildFlowSegments(seq('2026-10-01', 5, () => flat(40)))).toEqual([])
    // 충분히 쌓이면 첫날(판정 불가)이 아니라 판정 가능한 첫날부터
    const enough = buildFlowSegments(seq('2026-10-01', 12, () => flat(40)))
    expect(enough.length).toBe(1)
    expect(enough[0].startDate).toBe('2026-10-05')
  })

  it('데이터가 부족하면 빈 배열', () => {
    expect(buildFlowSegments(seq('2026-08-01', 3, () => flat(40)))).toEqual([])
    expect(buildFlowSegments([])).toEqual([])
  })

  it('recentFlow 판정은 그대로 동작한다(회귀 없음)', () => {
    const days = seq('2026-06-05', 16, (i) => {
      if (i < 10) return flat(30)
      const up = 30 + (i - 9) * 12
      return { emotional: 34, appetite: 30, sleep: up, body: up, functionLevel: (i >= 12 ? 3 : 2) as 2 | 3 }
    })
    const f = buildRecentFlow(days)
    expect(f.displayable).toBe(true)
    expect(f.status).toBe('depleting')
  })
})
