import { describe, expect, it } from 'vitest'
import { mean, median, quantile, sd, spearman, pearson, standardizeWithinPerson, cohensDPaired } from '../descriptive'
import { linearRegression } from '../regression'
import { benjaminiHochberg } from '../fdr'
import { tPValueTwoSided } from '../pvalue'
import { movingBlockBootstrapCI } from '../bootstrap'
import { linearDateTrend, detectBaselineShift, rollingBaseline } from '../changePoint'

describe('descriptive', () => {
  it('mean/median/quantile/sd', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([1, 2, 3])).toBe(2)
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2)
  })
  it('spearman: 완전 단조는 1, 역단조는 -1', () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 6)
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1, 6)
  })
  it('pearson n<3 또는 상수면 null', () => {
    expect(pearson([1, 2], [1, 2])).toBeNull()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it('standardizeWithinPerson: 상수는 0으로(0 나눗셈 방지)', () => {
    expect(standardizeWithinPerson([5, 5, 5])).toEqual([0, 0, 0])
  })
  it('cohensDPaired 방향', () => {
    const d = cohensDPaired([6, 7, 8, 10], [1, 2, 3, 4]) // a-b = [5,5,5,6] 양수
    expect(d).toBeGreaterThan(0)
    // 상수 차이(분산 0)는 degenerate → 0(가짜 무한대 방지)
    expect(cohensDPaired([6, 7, 8, 9], [1, 2, 3, 4])).toBe(0)
  })
})

describe('linearRegression (안전장치)', () => {
  const x = Array.from({ length: 12 }, (_, i) => i + 1)
  it('알려진 선형관계 y=2+3x 계수 복원', () => {
    const y = x.map((v) => 2 + 3 * v)
    const r = linearRegression(y, x.map((v) => [v]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.coefficients[0]).toBeCloseTo(2, 6)
    expect(r.coefficients[1]).toBeCloseTo(3, 6)
    expect(r.r2).toBeCloseTo(1, 6)
  })
  it('표본이 predictor 수에 비해 부족하면 insufficient-data', () => {
    const r = linearRegression([1, 2, 3, 4], [[1], [2], [3], [4]])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('insufficient-data')
  })
  it('상수 predictor는 constant-or-collinear', () => {
    const r = linearRegression(x.map((v) => v + 0.1), x.map(() => [1]))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('constant-or-collinear')
  })
  it('완전 공선성(중복 열)은 singular', () => {
    const n = 16
    const xs = Array.from({ length: n }, (_, i) => i + 1)
    const y = xs.map((v) => v * 2 + (v % 3))
    const r = linearRegression(y, xs.map((v) => [v, v])) // 동일 열 2개
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('singular')
  })
  it('결측(비유한) 행은 listwise 제외(droppedRows 보고)', () => {
    const xs = Array.from({ length: 14 }, (_, i) => i + 1)
    const y = xs.map((v) => 1 + 2 * v)
    const yWithNaN = [...y]
    yWithNaN[0] = NaN
    const r = linearRegression(yWithNaN, xs.map((v) => [v]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.droppedRows).toBe(1)
    expect(r.n).toBe(13)
  })
})

describe('benjaminiHochberg FDR', () => {
  it('raw p와 adjusted q를 구분하고 q는 단조', () => {
    const r = benjaminiHochberg([0.01, 0.02, 0.03, 0.04, 0.05], 0.05)
    // q_i = min over j>=i of m*p_j/j (역순 단조)
    // p=0.01 → 0.05*... BH: 가장 작은 p의 q = 5*0.01/1=0.05
    expect(r.q[0]).toBeCloseTo(0.05, 6)
    // 단조 증가(정렬 기준)
    const sortedQ = [...r.q].sort((a, b) => a - b)
    expect(r.q).toEqual(sortedQ)
    expect(r.rawP).toEqual([0.01, 0.02, 0.03, 0.04, 0.05])
  })
  it('전부 큰 p면 아무것도 reject 안 함', () => {
    const r = benjaminiHochberg([0.4, 0.5, 0.6], 0.1)
    expect(r.rejected).toEqual([false, false, false])
  })
})

describe('tPValueTwoSided', () => {
  it('t=0 → p=1, |t| 크면 p 작음, 대칭', () => {
    expect(tPValueTwoSided(0, 10)).toBeCloseTo(1, 6)
    expect(tPValueTwoSided(5, 20)).toBeLessThan(0.001)
    expect(tPValueTwoSided(3, 15)).toBeCloseTo(tPValueTwoSided(-3, 15), 8)
  })
})

describe('movingBlockBootstrapCI', () => {
  const series = Array.from({ length: 40 }, (_, i) => (i % 5) - 2)
  const meanStat = (idx: number[]) => mean(idx.map((i) => series[i]))
  it('충분한 n이면 CI 제공(lo<=hi)', () => {
    const ci = movingBlockBootstrapCI(series.length, meanStat, { seed: 1 })
    expect(ci.available).toBe(true)
    if (!ci.available) return
    expect(ci.lo).toBeLessThanOrEqual(ci.hi)
  })
  it('같은 seed면 결정적(재현 동일)', () => {
    const a = movingBlockBootstrapCI(series.length, meanStat, { seed: 7 })
    const b = movingBlockBootstrapCI(series.length, meanStat, { seed: 7 })
    expect(a).toEqual(b)
  })
  it('n이 너무 작으면 uncertainty unavailable', () => {
    const ci = movingBlockBootstrapCI(5, (idx) => idx.length, { minN: 8 })
    expect(ci.available).toBe(false)
  })
})

describe('changePoint / trend', () => {
  it('linearDateTrend 기울기', () => {
    expect(linearDateTrend([0, 2, 4, 6, 8]).slopePerStep).toBeCloseTo(2, 6)
  })
  it('rollingBaseline은 window 평균', () => {
    expect(rollingBaseline([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5])
  })
  it('뚜렷한 수준 변화는 후보로, 평탄하면 후보 아님', () => {
    const shifted = [...Array(10).fill(1), ...Array(10).fill(8)]
    const c = detectBaselineShift(shifted, { threshold: 1 })
    expect(c.isCandidate).toBe(true)
    expect(c.index).toBe(10)
    const flat = Array.from({ length: 20 }, (_, i) => 3 + (i % 2) * 0.1)
    expect(detectBaselineShift(flat, { threshold: 1 }).isCandidate).toBe(false)
  })
})
