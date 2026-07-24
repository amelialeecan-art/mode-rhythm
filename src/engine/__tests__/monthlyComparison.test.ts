import { describe, expect, it } from 'vitest'
import { buildMonthlyComparison, monthlyComparePeriods, addDaysISO } from '..'
import type { DailyLog } from '../../data/models'
import { makeLog } from './factories'

type Cfg = (i: number) => Partial<DailyLog>
function periodLogs(startISO: string, n: number, cfg: Cfg): DailyLog[] {
  const out: DailyLog[] = []
  for (let i = 0; i < n; i++) out.push(makeLog({ date: addDaysISO(startISO, i), ...cfg(i) }))
  return out
}
// 진행 중인 7월(1~24) vs 6월(1~24) 시나리오용 헬퍼
const JULY = '2026-07-24'
const build = (cur: DailyLog[], prev: DailyLog[]) => buildMonthlyComparison([...prev, ...cur], JULY)

describe('monthlyComparePeriods', () => {
  it('(1) 진행 중인 달은 지난달 같은 일자 범위와 비교한다', () => {
    const p = monthlyComparePeriods('2026-07-24')
    expect(p).toMatchObject({ currentStart: '2026-07-01', currentEnd: '2026-07-24', previousStart: '2026-06-01', previousEnd: '2026-06-24', partialMonth: true })
  })
  it('(2) 완료된 달(말일)은 이전 달 전체와 비교한다', () => {
    const p = monthlyComparePeriods('2026-07-31')
    expect(p).toMatchObject({ currentStart: '2026-07-01', currentEnd: '2026-07-31', previousStart: '2026-06-01', previousEnd: '2026-06-30', partialMonth: false })
  })
  it('(3) 월 길이가 달라도 이전 달 일자를 클램프한다(3/31 → 2/28)', () => {
    const p = monthlyComparePeriods('2026-03-31')
    // 3/31은 말일이라 완료 비교: 2월 전체
    expect(p).toMatchObject({ currentEnd: '2026-03-31', previousStart: '2026-02-01', previousEnd: '2026-02-28', partialMonth: false })
    // 진행 중 3/30이면 2/28로 클램프
    const q = monthlyComparePeriods('2026-03-30')
    expect(q).toMatchObject({ currentEnd: '2026-03-30', previousEnd: '2026-02-28', partialMonth: true })
  })
})

describe('buildMonthlyComparison · 게이트', () => {
  it('(5) 각 기간 10일·50% 미달이면 결과 없음(null)', () => {
    const cur = periodLogs('2026-07-01', 8, () => ({ bodyEnergyLevel: 'empty' }))
    const prev = periodLogs('2026-06-01', 16, () => ({ bodyEnergyLevel: 'charged' }))
    expect(build(cur, prev)).toBeNull() // current 8일 < 10
  })

  it('(4) 기록일 수가 달라도 같은 비율이면 변화로 보지 않는다', () => {
    // current 18일(50% bad), previous 14일(50% bad) → 비율 동일 → 인사이트 없음 → null
    const cur = periodLogs('2026-07-01', 18, (i) => ({ bodyEnergyLevel: i % 2 === 0 ? 'empty' : 'charged' }))
    const prev = periodLogs('2026-06-01', 14, (i) => ({ bodyEnergyLevel: i % 2 === 0 ? 'empty' : 'charged' }))
    expect(build(cur, prev)).toBeNull()
  })
})

describe('buildMonthlyComparison · 상태 비교', () => {
  it('(8) 몸 에너지가 떨어진 날이 줄면 better/down', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ bodyEnergyLevel: i < 3 ? 'empty' : 'charged' }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ bodyEnergyLevel: i < 11 ? 'empty' : 'charged' }))
    const mc = build(cur, prev)!
    const e = mc.insights.find((x) => x.domain === 'bodyEnergy')!
    expect(e).toMatchObject({ direction: 'better', trend: 'down', kind: 'state' })
  })

  it('(9) 생활기능이 버거운 날이 줄면 better/down', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ functionLevel: i < 3 ? 4 : 1 }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ functionLevel: i < 11 ? 4 : 1 }))
    const mc = build(cur, prev)!
    expect(mc.insights.find((x) => x.domain === 'functionLevel')).toMatchObject({ direction: 'better', trend: 'down' })
  })

  it('(10) 단것 당김이 강한 날이 늘면 worse/up (appetite)', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ appetiteRatings: { sweetCraving: i < 12 ? 9 : 0 } }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ appetiteRatings: { sweetCraving: i < 2 ? 9 : 0 } }))
    const mc = build(cur, prev)!
    expect(mc.insights.find((x) => x.domain === 'sweetCraving')).toMatchObject({ direction: 'worse', trend: 'up', kind: 'appetite' })
  })

  it('(11) 수면 문제 날 변화가 잡힌다', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ lastNightSleep: { hours: i < 3 ? 4 : 8, quality: i < 3 ? 2 : 8, issues: [] } }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ lastNightSleep: { hours: i < 12 ? 4 : 8, quality: i < 12 ? 2 : 8, issues: [] } }))
    const mc = build(cur, prev)!
    expect(mc.insights.find((x) => x.kind === 'sleep')).toMatchObject({ direction: 'better' })
  })

  it('(6) 예외일은 일반 상태 비교에서 제외된다', () => {
    // current: 정상 14일(charged) + 예외 6일(empty). 예외를 세면 worse가 되지만 제외되어야 함.
    const cur = [
      ...periodLogs('2026-07-01', 14, () => ({ bodyEnergyLevel: 'charged' })),
      ...periodLogs('2026-07-15', 6, () => ({ bodyEnergyLevel: 'empty', rhythmExceptionCodes: ['illness'] })),
    ]
    const prev = periodLogs('2026-06-01', 16, () => ({ bodyEnergyLevel: 'charged' }))
    const mc = build(cur, prev)
    // 양쪽 모두 나쁜 날 0 → 인사이트 없음(예외 empty가 worse를 만들지 않음)
    expect(mc).toBeNull()
  })

  it('(7) 직접 입력과 옛 stateCodes fallback이 함께 동작한다', () => {
    // current 직접값(bodyEnergyLevel), previous 옛 상태칩(drained → legacy bodyEnergy)
    const cur = periodLogs('2026-07-01', 16, () => ({ bodyEnergyLevel: 'charged' }))
    const prev = periodLogs('2026-06-01', 16, () => ({ stateCodes: ['drained'] }))
    const mc = build(cur, prev)!
    // prev는 전부 drained(낮음)=나쁜 날, current는 charged=좋은 날 → 몸 에너지 떨어진 날 줄어듦
    expect(mc.insights.find((x) => x.domain === 'bodyEnergy')).toMatchObject({ direction: 'better' })
  })
})

describe('buildMonthlyComparison · 생활 맥락·선택', () => {
  it('(13) 출근 구성 변화는 좋고 나쁨 없이 changed로 표현', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ dayContext: i < 13 ? 'office' : 'remote', bodyEnergyLevel: 'okay' }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ dayContext: i < 3 ? 'office' : 'remote', bodyEnergyLevel: 'okay' }))
    const mc = build(cur, prev)!
    const ctx = mc.insights.find((x) => x.kind === 'context')!
    expect(ctx.direction).toBe('changed')
    expect(ctx.domain).toBe('context:office')
    expect(ctx.trend).toBe('up')
  })

  it('(14) 약한 변화는 숨긴다', () => {
    // bodyEnergy 나쁜 날 비율 차이가 임계 미만(8/16 vs 7/16 = 0.06)
    const cur = periodLogs('2026-07-01', 16, (i) => ({ bodyEnergyLevel: i < 8 ? 'empty' : 'charged' }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ bodyEnergyLevel: i < 7 ? 'empty' : 'charged' }))
    expect(build(cur, prev)).toBeNull()
  })

  it('(15) 같은 계열(식욕/단것 당김) 중복은 대표 하나만', () => {
    const cur = periodLogs('2026-07-01', 16, (i) => ({ appetiteRatings: { appetite: i < 13 ? 9 : 0, sweetCraving: i < 13 ? 9 : 0 } }))
    const prev = periodLogs('2026-06-01', 16, (i) => ({ appetiteRatings: { appetite: i < 2 ? 9 : 0, sweetCraving: i < 2 ? 9 : 0 } }))
    const mc = build(cur, prev)!
    expect(mc.insights.filter((x) => x.kind === 'appetite')).toHaveLength(1)
  })

  it('(16) 최대 3개만 반환한다', () => {
    const cur = periodLogs('2026-07-01', 16, () => ({ bodyEnergyLevel: 'charged', functionLevel: 1, mentalSpaceLevel: 'spacious', focusLevel: 'well', socialCapacityLevel: 'enough' }))
    const prev = periodLogs('2026-06-01', 16, () => ({ bodyEnergyLevel: 'empty', functionLevel: 4, mentalSpaceLevel: 'overloaded', focusLevel: 'rarely', socialCapacityLevel: 'rarely' }))
    const mc = build(cur, prev)!
    expect(mc.insights.length).toBeLessThanOrEqual(3)
    expect(mc.insights.length).toBe(3)
  })

  it('(12) 회복 속도는 완결 사례가 부족하면 후보에서 제외된다', () => {
    const cur = periodLogs('2026-07-01', 16, () => ({ bodyEnergyLevel: 'charged' }))
    const prev = periodLogs('2026-06-01', 16, () => ({ bodyEnergyLevel: 'empty' }))
    const mc = build(cur, prev)!
    expect(mc.insights.some((x) => x.kind === 'recovery')).toBe(false)
  })
})
