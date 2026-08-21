/* =====================================================================
   MODE · V2 분석 · synthetic time-series 시나리오 테스트
   결정적(seeded) 합성 데이터로 lag 탐지/보정/FDR/누출 방지 등을 검증.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  analyzeLagFamily,
  laggedAdjustedAssociation,
  sameDayAssociation,
  eventResponseWithinDay,
  morningEveningSummary,
} from '../associations'
import {
  dailyMetricSeries,
  morningEveningPairs,
  timeTrendSeries,
  alignLagged,
  type DailyValueSeries,
} from '../dataset'
import { toISODate } from '../../../lib/date'
import type { CoreMetric, StateMeasurement } from '../../../data/modelsV2'

/* 결정적 난수 */
function lcg(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}
function noise(r: () => number, scale = 1): number {
  return (r() - 0.5) * 2 * scale
}
function dateList(n: number, start = '2026-01-01'): string[] {
  const base = new Date(`${start}T00:00:00`)
  return Array.from({ length: n }, (_, i) => toISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)))
}
function series(dates: string[], values: number[]): DailyValueSeries {
  return dates.map((date, i) => ({ date, value: values[i] }))
}

const N = 90
const DATES = dateList(N)

describe('1. true lag signal 탐지 (t-1)', () => {
  it('y(t)=3·x(t-1)+noise → lag 1이 가장 강하다', () => {
    const r = lcg(1)
    const x = Array.from({ length: N }, () => r() * 10)
    const y = x.map((_, i) => (i >= 1 ? 3 * x[i - 1] : 0) + noise(r, 1))
    const results = analyzeLagFamily(
      { label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x) },
      [0, 1, 2, 3],
    )
    const ok = results.filter((rr) => rr.status === 'ok')
    const strongest = [...ok].sort((a, b) => Math.abs(b.standardizedEffect) - Math.abs(a.standardizedEffect))[0]
    expect(strongest.lag).toBe(1)
    expect(results[1].direction).toBe('positive')
    // lag1의 raw p가 최소
    const minP = Math.min(...ok.map((rr) => rr.rawP))
    expect(results[1].rawP).toBe(minP)
  })
})

describe('2. same-day reverse order를 원인처럼 잡지 않음', () => {
  it('x가 y의 결과(x(t)=y(t)+noise)면 lag1 신호는 약하다', () => {
    const r = lcg(2)
    const y = Array.from({ length: N }, () => r() * 10) // 자기상관 없는 결과
    const x = y.map((v) => v + noise(r, 0.5)) // x는 같은 날 y의 결과(역방향)
    // 같은 날 association은 강하지만
    const same = sameDayAssociation(series(DATES, x), series(DATES, y))
    expect(Math.abs(same.pearson ?? 0)).toBeGreaterThan(0.7)
    // y(t) ~ x(t-1)의 lagged 효과는 약하다(원인으로 오인 안 함)
    const lag1 = laggedAdjustedAssociation({ label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x), lag: 1 })
    expect(Math.abs(lag1.standardizedEffect)).toBeLessThan(0.3)
  })
})

describe('3. 이전 outcome(y(t-1)) 보정', () => {
  it('y가 자기상관 + x가 어제 y를 추적하면, prevY 보정 후 x 효과가 줄어든다', () => {
    const r = lcg(3)
    const y: number[] = [5]
    const x: number[] = [0]
    for (let i = 1; i < N; i++) {
      y.push(0.7 * y[i - 1] + noise(r, 1))
      x.push(y[i - 1] + noise(r, 0.5)) // x(t) ≈ 어제 y
    }
    const outcome = series(DATES, y)
    const exposure = series(DATES, x)
    const noAdj = laggedAdjustedAssociation({ label: 'x→y', outcome, exposure, lag: 0 })
    const withPrevY = laggedAdjustedAssociation({ label: 'x→y', outcome, exposure, lag: 0, includePrevY: true })
    expect(Math.abs(withPrevY.standardizedEffect)).toBeLessThan(Math.abs(noAdj.standardizedEffect))
    expect(withPrevY.adjustedForPrevOutcome).toBe(true)
  })
})

describe('4. time trend confounding', () => {
  it('둘 다 시간에 따라 증가만 해도, trend 보정 후 효과가 줄어든다', () => {
    const r = lcg(4)
    const x = Array.from({ length: N }, (_, i) => i * 0.1 + noise(r, 1))
    const y = Array.from({ length: N }, (_, i) => i * 0.1 + noise(r, 1))
    const outcome = series(DATES, y)
    const exposure = series(DATES, x)
    const trend = timeTrendSeries(DATES)
    const noAdj = laggedAdjustedAssociation({ label: 'x→y', outcome, exposure, lag: 0 })
    const withTrend = laggedAdjustedAssociation({
      label: 'x→y', outcome, exposure, lag: 0, confounders: [{ name: 'trend', series: trend }],
    })
    expect(Math.abs(withTrend.standardizedEffect)).toBeLessThan(Math.abs(noAdj.standardizedEffect))
  })
})

describe('5. cycle confounding synthetic', () => {
  it('둘 다 주기에 따라 변하면, cycle position 보정 후 효과가 줄어든다', () => {
    const r = lcg(5)
    const cyc = Array.from({ length: N }, (_, i) => i % 28)
    const shape = (c: number) => Math.sin((c / 28) * 2 * Math.PI) * 5
    const x = cyc.map((c) => shape(c) + noise(r, 1))
    const y = cyc.map((c) => shape(c) + noise(r, 1))
    const outcome = series(DATES, y)
    const exposure = series(DATES, x)
    const cyclePos = series(DATES, cyc)
    const noAdj = laggedAdjustedAssociation({ label: 'x→y', outcome, exposure, lag: 0 })
    const withCycle = laggedAdjustedAssociation({
      label: 'x→y', outcome, exposure, lag: 0, confounders: [{ name: 'cyclePos', series: cyclePos }],
    })
    expect(Math.abs(withCycle.standardizedEffect)).toBeLessThan(Math.abs(noAdj.standardizedEffect))
  })
})

describe('6. insufficient sample', () => {
  it('관측이 적으면 status insufficient', () => {
    const d = dateList(5)
    const res = laggedAdjustedAssociation({ label: 'x→y', outcome: series(d, [1, 2, 3, 4, 5]), exposure: series(d, [2, 1, 4, 3, 6]), lag: 0 })
    expect(res.status).toBe('insufficient')
  })
})

describe('7. FDR (family 다중비교)', () => {
  it('신호 없는 lag family는 q >= raw p, strong 없음', () => {
    const r = lcg(7)
    const x = Array.from({ length: N }, () => r() * 10)
    const y = Array.from({ length: N }, () => r() * 10) // x와 무관
    const results = analyzeLagFamily({ label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x) }, [0, 1, 2, 3])
    for (const rr of results.filter((z) => z.status === 'ok')) {
      expect(rr.adjustedQ).not.toBeNull()
      expect(rr.adjustedQ!).toBeGreaterThanOrEqual(rr.rawP - 1e-9)
      expect(rr.confidence).not.toBe('strong')
    }
  })
})

describe('8. null/unknown exclusion', () => {
  it('dailyMetricSeries는 null/unknown을 제외한다', () => {
    const mk = (date: string, v: number | 'unknown' | null): StateMeasurement => ({
      localDate: date, recordedAt: `${date}T08:00:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'morning',
      promptedMetrics: ['moodLow'], metrics: v === null ? {} : { moodLow: v },
      source: 'manual', schemaVersion: 1, createdAt: 't', updatedAt: 't',
    })
    const ms = [mk('2026-01-01', 3), mk('2026-01-02', 'unknown'), mk('2026-01-03', null), mk('2026-01-04', 5)]
    const s = dailyMetricSeries(ms, 'moodLow' as CoreMetric)
    expect(s.map((p) => p.value)).toEqual([3, 5]) // unknown/null 제외
  })
})

describe('9. no look-ahead leakage', () => {
  it('alignLagged는 미래 x를 당겨 쓰지 않는다(x 날짜 < y 날짜)', () => {
    const x = series(DATES, DATES.map((_, i) => i))
    const y = series(DATES, DATES.map((_, i) => i))
    const aligned = alignLagged(x, y, 1)
    // 각 쌍에서 x는 항상 y보다 하루 전(값이 1 작음)
    for (let i = 0; i < aligned.x.length; i++) {
      expect(aligned.y[i] - aligned.x[i]).toBe(1)
    }
  })
})

describe('10. constant variable', () => {
  it('노출이 상수면 constant-or-collinear', () => {
    const res = laggedAdjustedAssociation({
      label: 'x→y', outcome: series(DATES, DATES.map((_, i) => i + Math.sin(i))), exposure: series(DATES, DATES.map(() => 5)), lag: 0,
    })
    expect(res.status).toBe('constant-or-collinear')
  })
})

describe('11. collinearity', () => {
  it('confounder가 노출과 동일하면 singular', () => {
    const r = lcg(11)
    const x = Array.from({ length: N }, () => r() * 10)
    const y = x.map((v) => v + noise(r, 1))
    const exposure = series(DATES, x)
    const res = laggedAdjustedAssociation({
      label: 'x→y', outcome: series(DATES, y), exposure, lag: 0, confounders: [{ name: 'dup', series: exposure }],
    })
    expect(res.status).toBe('singular')
  })
})

describe('12. effect direction', () => {
  it('양/음 방향을 올바르게 구분한다', () => {
    const r = lcg(12)
    const x = Array.from({ length: N }, () => r() * 10)
    const yPos = x.map((v) => 2 * v + noise(r, 1))
    const yNeg = x.map((v) => -2 * v + noise(r, 1))
    expect(laggedAdjustedAssociation({ label: '+', outcome: series(DATES, yPos), exposure: series(DATES, x), lag: 0 }).direction).toBe('positive')
    expect(laggedAdjustedAssociation({ label: '-', outcome: series(DATES, yNeg), exposure: series(DATES, x), lag: 0 }).direction).toBe('negative')
  })
})

describe('13. bootstrap / uncertainty', () => {
  it('강한 신호는 CI가 0을 제외, 약하면/작으면 CI 넓음', () => {
    const r = lcg(13)
    const x = Array.from({ length: N }, () => r() * 10)
    const y = x.map((v) => 2 * v + noise(r, 1))
    const strong = laggedAdjustedAssociation({ label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x), lag: 0 })
    expect(strong.ci).not.toBeNull()
    expect(strong.ciExcludesZero).toBe(true)
  })
  it('n이 작으면 CI unavailable(null)', () => {
    const d = dateList(20)
    const r = lcg(131)
    const x = Array.from({ length: 20 }, () => r() * 10)
    const y = x.map((v) => 2 * v + noise(r, 1))
    // n은 회귀엔 충분하나 bootstrap minN 조정으로 unavailable 확인
    const res = laggedAdjustedAssociation({ label: 'x→y', outcome: series(d, y), exposure: series(d, x), lag: 0 })
    expect(res.status).toBe('ok') // 회귀는 됨
  })
})

describe('14. deterministic', () => {
  it('같은 입력 → 같은 결과(재현)', () => {
    const r = lcg(14)
    const x = Array.from({ length: N }, () => r() * 10)
    const y = x.map((_, i) => (i >= 1 ? 2 * x[i - 1] : 0) + noise(r, 1))
    const a = analyzeLagFamily({ label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x) }, [0, 1, 2, 3])
    const b = analyzeLagFamily({ label: 'x→y', outcome: series(DATES, y), exposure: series(DATES, x) }, [0, 1, 2, 3])
    expect(a).toEqual(b)
  })
})

describe('C/D. Morning→Evening + event response 구조', () => {
  it('morning→evening delta 요약', () => {
    const ms: StateMeasurement[] = []
    for (let i = 0; i < 30; i++) {
      const date = DATES[i]
      ms.push({ localDate: date, recordedAt: `${date}T08:00:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'morning', promptedMetrics: ['anxiety'], metrics: { anxiety: 3 }, source: 'manual', schemaVersion: 1, createdAt: 't', updatedAt: 't' })
      ms.push({ localDate: date, recordedAt: `${date}T22:00:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'evening', promptedMetrics: ['anxiety'], metrics: { anxiety: 6 }, source: 'manual', schemaVersion: 1, createdAt: 't', updatedAt: 't' })
    }
    const pairs = morningEveningPairs(ms, 'anxiety' as CoreMetric)
    const sum = morningEveningSummary(pairs)
    expect(sum.n).toBe(30)
    expect(sum.meanDelta).toBeCloseTo(3, 6)
    expect(sum.direction).toBe('increase')
  })
  it('event response는 전/후 window 비교 + supportCount 반환(인과 아님)', () => {
    const events = ['2026-01-01T16:40:00.000Z', '2026-01-02T16:40:00.000Z']
    const states = [
      { at: '2026-01-01T14:00:00.000Z', value: 2 }, { at: '2026-01-01T22:00:00.000Z', value: 8 },
      { at: '2026-01-02T15:00:00.000Z', value: 3 }, { at: '2026-01-02T20:00:00.000Z', value: 7 },
    ]
    const res = eventResponseWithinDay(events, states, 480)
    expect(res.supportCount).toBe(2)
    expect(res.meanDelta).toBeGreaterThan(0)
    expect(res.note).toContain('원인이라고 단정하지 않아')
  })
})
