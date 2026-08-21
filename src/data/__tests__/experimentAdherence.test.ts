/* =====================================================================
   MODE · Experiment adherence 의미 분리 회귀 (P1-A)
   logging coverage(기록률)를 behavioral adherence(개입 준수율)로 혼동하지 않는다.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { analyzeExperiment } from '../../engine/v2'

describe('Experiment adherence vs loggingCoverage 분리', () => {
  it('기록이 계획을 꽉 채워도 adherence는 unavailable(null)이다 — 기록량은 준수율이 아니다', () => {
    const r = analyzeExperiment({
      baselineValues: [7, 8, 7, 8, 7, 8],
      interventionValues: [4, 5, 4, 5, 4, 5],
      plannedBaselineDays: 6,
      plannedInterventionDays: 6,
    })
    // logging coverage = 12/12 = 1 (전부 기록됨)
    expect(r.loggingCoverage).toBeCloseTo(1, 6)
    // 그러나 실제 개입을 지켰는지 확인할 구조화된 데이터가 없으므로 adherence는 null
    expect(r.adherence).toBeNull()
  })

  it('부분 기록이면 loggingCoverage는 정확한 분모(계획 일수)로 계산된다', () => {
    // 계획 20일(10+10) 중 12일만 기록 → 0.6
    const r = analyzeExperiment({
      baselineValues: [5, 6, 5, 6, 5, 6],
      interventionValues: [4, 5, 4, 5, 4, 5],
      plannedBaselineDays: 10,
      plannedInterventionDays: 10,
    })
    expect(r.usableObservations).toBe(12)
    expect(r.loggingCoverage).toBeCloseTo(12 / 20, 6)
    expect(r.adherence).toBeNull()
  })

  it('usableObservations는 분석 표본 수(baseline+intervention 관찰)를 뜻한다', () => {
    const r = analyzeExperiment({
      baselineValues: [7, 8, 7, 8, 7],
      interventionValues: [4, 5, 4, 5],
      plannedBaselineDays: 5,
      plannedInterventionDays: 5,
    })
    expect(r.usableObservations).toBe(9) // 5 + 4
  })

  it('표본 부족(insufficient)에서도 adherence는 null, loggingCoverage는 유효', () => {
    const r = analyzeExperiment({
      baselineValues: [5, 6],
      interventionValues: [4],
      plannedBaselineDays: 14,
      plannedInterventionDays: 14,
    })
    expect(r.status).toBe('insufficient')
    expect(r.adherence).toBeNull()
    expect(r.loggingCoverage).toBeCloseTo(3 / 28, 6)
  })
})
