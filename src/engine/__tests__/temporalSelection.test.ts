/* =====================================================================
   MODE · V2 temporal selection/gate 순수 규칙 (P1-B / P2-A / G)
   family 대표 선택이 cherry-picking이 아닌지, gate가 실제로 거르는지 검증.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  pickLagFamilyRepresentative,
  gateLaggedAssociation,
  gateMorningEvening,
  gateEventResponse,
  gateBaselineShift,
  selectTopAssociations,
  TEMPORAL_GATES,
  type AssociationResult,
} from '../v2'

function assoc(over: Partial<AssociationResult>): AssociationResult {
  return {
    label: 'x',
    lag: 0,
    n: 30,
    status: 'ok',
    effectEstimate: 0.3,
    standardizedEffect: 0.3,
    unadjustedEstimate: 0.3,
    direction: 'positive',
    ci: { lo: 0.1, hi: 0.5 },
    ciExcludesZero: true,
    rawP: 0.02,
    adjustedQ: 0.04,
    fdrPassed: true,
    adjusted: true,
    adjustedForPrevOutcome: true,
    confounders: ['weekend'],
    directionConsistency: 0.8,
    droppedRows: 0,
    confidence: 'moderate',
    notes: [],
    ...over,
  }
}

describe('pickLagFamilyRepresentative — cherry-picking 금지', () => {
  it('가장 큰 효과가 아니라 confidence 우선으로 대표를 고른다', () => {
    const family = [
      assoc({ lag: 0, standardizedEffect: 0.9, confidence: 'exploratory' }), // 효과 큼, 신뢰도 낮음
      assoc({ lag: 1, standardizedEffect: 0.3, confidence: 'strong' }), // 효과 작지만 신뢰도 높음
      assoc({ lag: 2, standardizedEffect: 0.5, confidence: 'tentative' }),
    ]
    const pick = pickLagFamilyRepresentative(family)
    expect(pick.representative?.lag).toBe(1) // strong 우선(큰 효과 아님)
    expect(pick.okCount).toBe(3)
  })

  it('family 전부 insufficient면 대표 없음(null)', () => {
    const family = [assoc({ confidence: 'insufficient' }), assoc({ status: 'singular' })]
    const pick = pickLagFamilyRepresentative(family)
    expect(pick.representative).toBeNull()
    expect(pick.okCount).toBe(1) // status ok지만 insufficient였던 것 1개
  })
})

describe('gate 함수', () => {
  it('gateLaggedAssociation: 표본 부족/노출 반복 부족/insufficient는 막는다', () => {
    const rep = assoc({ n: 30, confidence: 'moderate' })
    expect(gateLaggedAssociation(rep, 10)).toBe(true)
    expect(gateLaggedAssociation(rep, 2)).toBe(false) // 노출 반복 < 4
    expect(gateLaggedAssociation(assoc({ n: 5 }), 10)).toBe(false) // n < minAlignedN
    expect(gateLaggedAssociation(assoc({ confidence: 'insufficient' }), 10)).toBe(false)
    expect(gateLaggedAssociation(null, 10)).toBe(false)
  })

  it('gateMorningEvening: 쌍 부족/방향 없음은 막는다', () => {
    expect(gateMorningEvening({ n: 20, meanDelta: 1.2, standardizedEffect: 0.5, ci: null, direction: 'increase', note: '' })).toBe(true)
    expect(gateMorningEvening({ n: 5, meanDelta: 1.2, standardizedEffect: 0.5, ci: null, direction: 'increase', note: '' })).toBe(false)
    expect(gateMorningEvening({ n: 20, meanDelta: 0, standardizedEffect: 0, ci: null, direction: 'none', note: '' })).toBe(false)
  })

  it('gateEventResponse: 반복/ support / 효과 크기 gate', () => {
    const r = { supportCount: 6, windowMinutes: 240, meanBefore: 3, meanAfter: 6, meanDelta: 3, ci: null, note: '' }
    expect(gateEventResponse(r, 6)).toBe(true)
    expect(gateEventResponse(r, 2)).toBe(false) // 사건 반복 < 4
    expect(gateEventResponse({ ...r, supportCount: 2 }, 6)).toBe(false) // support < 4
    expect(gateEventResponse({ ...r, meanDelta: 0.02 }, 6)).toBe(false) // 효과 미미
  })

  it('gateBaselineShift: 후보 아님/표본 부족은 막는다', () => {
    expect(gateBaselineShift({ isCandidate: true, index: 10, standardizedShift: 1.2, beforeMean: 3, afterMean: 5 }, 30)).toBe(true)
    expect(gateBaselineShift({ isCandidate: false, index: null, standardizedShift: 0.3, beforeMean: 3, afterMean: 3 }, 30)).toBe(false)
    expect(gateBaselineShift({ isCandidate: true, index: 10, standardizedShift: 1.2, beforeMean: 3, afterMean: 5 }, 10)).toBe(false)
  })
})

describe('selectTopAssociations — 품질순 상한(무더기 나열 방지)', () => {
  it('confidence → |effect| 순으로 cap개만 남긴다', () => {
    const reps = [
      assoc({ label: 'a', confidence: 'tentative', standardizedEffect: 0.2 }),
      assoc({ label: 'b', confidence: 'strong', standardizedEffect: 0.3 }),
      assoc({ label: 'c', confidence: 'moderate', standardizedEffect: 0.9 }),
      assoc({ label: 'd', confidence: 'exploratory', standardizedEffect: 0.8 }),
    ]
    const top = selectTopAssociations(reps, 2)
    expect(top.map((r) => r.label)).toEqual(['b', 'c']) // strong, moderate
    expect(TEMPORAL_GATES.maxPerCategory).toBeGreaterThan(0)
  })
})
