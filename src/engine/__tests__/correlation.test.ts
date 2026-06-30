import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  calcBaseline,
  factorEffect,
  confidenceTier,
  computeOverlapPenalty,
  type AnalysisDataset,
  type AnalysisMetric,
} from '../correlation'

type DaySpec = { date: string; factors?: string[]; m?: Partial<Record<AnalysisMetric, number>> }

function makeDs(days: DaySpec[]): AnalysisDataset {
  const scoreByDate = new Map<string, Record<AnalysisMetric, number>>()
  const factorByDate = new Map<string, Set<string>>()
  for (const d of days) {
    scoreByDate.set(d.date, { emotional: 0, appetite: 0, sleep: 0, body: 0, cycle: 0, event: 0, rhythm: 0, ...d.m })
    factorByDate.set(d.date, new Set(d.factors ?? []))
  }
  return { resultDates: days.map((d) => d.date), scoreByDate, factorByDate, endDate: days[days.length - 1].date }
}

function seq(start: string, n: number): string[] {
  const out: string[] = []
  let d = start
  for (let i = 0; i < n; i++) {
    out.push(d)
    d = addDaysISO(d, 1)
  }
  return out
}

describe('calcBaseline', () => {
  it('최근 30일 metric 평균을 계산한다', () => {
    const dates = seq('2026-06-01', 20)
    const ds = makeDs(dates.map((date, i) => ({ date, m: { emotional: i % 2 === 0 ? 70 : 30 } })))
    const b = calcBaseline(ds, 'emotional', 30)
    expect(b.mean).toBe(50)
    expect(b.count).toBe(20)
  })
})

describe('factorEffect', () => {
  it('요인 있음/없음 평균 차이를 계산한다', () => {
    const dates = seq('2026-06-01', 20)
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i % 2 === 0 ? ['F'] : [], m: { emotional: i % 2 === 0 ? 70 : 30 } })))
    const r = factorEffect(ds, 'F', 'F', 'emotional', 'same_day', 50)
    expect(r).not.toBeNull()
    expect(r!.withFactorMean).toBe(70)
    expect(r!.withoutFactorMean).toBe(30)
    expect(r!.effectSize).toBe(40)
    expect(r!.supportCount).toBe(10)
    expect(r!.comparisonCount).toBe(10)
  })

  it('same_day와 previous_day가 다른 결과를 낸다', () => {
    const dates = seq('2026-06-01', 16)
    // 요인은 짝수일, metric은 "전날 요인"이면 70
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i % 2 === 0 ? ['F'] : [], m: { emotional: i > 0 && (i - 1) % 2 === 0 ? 70 : 30 } })))
    const same = factorEffect(ds, 'F', 'F', 'emotional', 'same_day', 50)
    const prev = factorEffect(ds, 'F', 'F', 'emotional', 'previous_day', 50)
    expect(same!.effectSize).not.toBe(prev!.effectSize)
    expect(prev!.effectSize).toBeGreaterThan(0)
  })

  it('recent_3_days는 D-1~D-3만 보고 D 당일을 제외한다', () => {
    const dates = seq('2026-06-01', 16)
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i >= 4 && i <= 11 ? ['F'] : [], m: { emotional: 50 } })))
    const same = factorEffect(ds, 'F', 'F', 'emotional', 'same_day', 50)
    const r3 = factorEffect(ds, 'F', 'F', 'emotional', 'recent_3_days', 50)
    expect(same!.supportCount).toBe(8) // 4..11
    expect(r3!.supportCount).toBe(10) // 5..14 (당일 제외, 1~3일 전 참조)
  })

  it('표본이 부족하면 null', () => {
    const dates = seq('2026-06-01', 6)
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i < 2 ? ['F'] : [], m: { emotional: 50 } })))
    expect(factorEffect(ds, 'F', 'F', 'emotional', 'same_day', 50)).toBeNull()
  })

  it('consistency = 요인 있던 날 중 baseline 초과 비율', () => {
    const dates = seq('2026-06-01', 8)
    const vals = [70, 70, 30, 30]
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i < 4 ? ['F'] : [], m: { emotional: i < 4 ? vals[i] : 50 } })))
    const r = factorEffect(ds, 'F', 'F', 'emotional', 'same_day', 50)
    expect(r!.consistency).toBe(0.5)
  })
})

describe('confidenceTier', () => {
  it('점수에 맞게 매핑된다', () => {
    expect(confidenceTier(10)).toBe('reference')
    expect(confidenceTier(40)).toBe('possible')
    expect(confidenceTier(65)).toBe('likely')
    expect(confidenceTier(90)).toBe('strong_pattern')
  })
})

describe('computeOverlapPenalty', () => {
  it('항상 함께 나타나는 요인이면 패널티가 높다', () => {
    const dates = seq('2026-06-01', 8)
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i < 5 ? ['F', 'G'] : [] })))
    expect(computeOverlapPenalty(ds, 'F')).toBe(0.2)
  })

  it('겹침이 없으면 0', () => {
    const dates = seq('2026-06-01', 8)
    const ds = makeDs(dates.map((date, i) => ({ date, factors: i < 5 ? ['F'] : [] })))
    expect(computeOverlapPenalty(ds, 'F')).toBe(0)
  })
})
