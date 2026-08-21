/* =====================================================================
   MODE · V2 · 상태 군집(k-means + 안정성 gate) 테스트
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { clusterDays, type ClusterDay } from '../clustering'
import { containsAssertion } from '../../../copy/tone'

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}

const EMO = ['moodLow', 'anxiety', 'irritability']
const APP = ['physicalHunger', 'craving', 'bingeUrge']
const CANDIDATES = [...EMO, ...APP, 'energy', 'fatigueHeaviness', 'bloating', 'painDiscomfort']

/** 두 뚜렷한 유형(감정 높음 / 식욕 높음)의 합성 일자. */
function twoGroupDays(n: number, seed = 1): ClusterDay[] {
  const r = rng(seed)
  const days: ClusterDay[] = []
  for (let i = 0; i < n; i++) {
    const emotionDay = i % 2 === 0
    const values: Record<string, number> = {}
    for (const m of EMO) values[m] = (emotionDay ? 8 : 1) + (r() - 0.5) * 1.5
    for (const m of APP) values[m] = (emotionDay ? 1 : 8) + (r() - 0.5) * 1.5
    // 저분산 metric(거의 상수) → 선택에서 제외돼야 함
    for (const m of ['energy', 'fatigueHeaviness', 'bloating', 'painDiscomfort']) values[m] = 5 + (r() - 0.5) * 0.2
    days.push({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`, values })
  }
  return days
}

describe('안정적 군집', () => {
  it('뚜렷하게 분리된 두 유형이면 available + descriptive label', () => {
    const res = clusterDays(twoGroupDays(80), CANDIDATES)
    expect(res.available).toBe(true)
    expect(res.k).toBeGreaterThanOrEqual(2)
    expect(res.usedMetrics).toEqual(expect.arrayContaining([...EMO, ...APP]))
    // 저분산 metric은 사용에서 제외
    expect(res.usedMetrics).not.toContain('energy')
    // 라벨은 descriptive이며 진단/단정 문구가 아니다
    const allowed = ['감정 부하가 높은 날', '식욕 관련 신호가 높은 날', '몸 불편이 큰 날', '에너지가 낮은 날', '대체로 평이한 날']
    for (const c of res.clusters!) {
      expect(allowed).toContain(c.label)
      expect(containsAssertion(c.label)).toBe(false)
      expect(c.label).not.toMatch(/진단|장애|질환|증후군/)
    }
  })
})

describe('불안정/불충분은 숨긴다', () => {
  it('순수 잡음이면 available false (실루엣 낮음 또는 불안정)', () => {
    const r = rng(99)
    const days: ClusterDay[] = Array.from({ length: 80 }, (_, i) => {
      const values: Record<string, number> = {}
      for (const m of CANDIDATES) values[m] = r() * 10 // 구조 없음
      return { date: `d${i}`, values }
    })
    const res = clusterDays(days, CANDIDATES)
    expect(res.available).toBe(false)
    expect(['low-silhouette', 'unstable']).toContain(res.reason)
  })

  it('저분산(거의 상수)이면 사용할 metric이 없어 숨김', () => {
    const days: ClusterDay[] = Array.from({ length: 80 }, (_, i) => {
      const values: Record<string, number> = {}
      for (const m of CANDIDATES) values[m] = 5 // 완전 상수
      return { date: `d${i}`, values }
    })
    const res = clusterDays(days, CANDIDATES)
    expect(res.available).toBe(false)
    expect(res.reason).toBe('low-variance')
  })

  it('usable days가 부족하면 insufficient-days', () => {
    const res = clusterDays(twoGroupDays(30), CANDIDATES, { minDays: 60 })
    expect(res.available).toBe(false)
    expect(res.reason).toBe('insufficient-days')
  })

  it('missingness: 선택 metric이 자주 비면 완전한 날이 줄어 숨김', () => {
    const base = twoGroupDays(80)
    // 후반부 날에서 감정 metric 제거(그룹과 무관하게) → 완전한 행이 줄어듦(분산은 유지)
    const days = base.map((d, i) => {
      if (i >= 40) {
        const v = { ...d.values }
        for (const m of EMO) delete v[m]
        return { ...d, values: v }
      }
      return d
    })
    const res = clusterDays(days, CANDIDATES, { minDays: 60 })
    expect(res.available).toBe(false)
    // 감정 metric coverage 하락 → too-few-metrics 또는 insufficient-days
    expect(['too-few-metrics', 'insufficient-days', 'low-variance']).toContain(res.reason)
  })
})
