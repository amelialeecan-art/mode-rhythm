/* =====================================================================
   MODE · V2 temporal 문구 (F) — 단정 금지 가드 통과 + 후보/보정 표현
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { containsAssertion } from '../../../copy/tone'
import {
  morningEveningSentence,
  eventResponseSentence,
  laggedSentence,
  laggedAdjustmentNote,
  baselineShiftSentence,
} from '../temporalVoice'
import type { AssociationResult } from '../../../engine/v2'
import type { LaggedInsight } from '../../../data/services/v2TemporalAnalysisService'

const rep = (over: Partial<AssociationResult>): AssociationResult => ({
  label: 'x', lag: 1, n: 30, status: 'ok', effectEstimate: 0.3, standardizedEffect: 0.3,
  unadjustedEstimate: 0.3, direction: 'positive', ci: { lo: 0.1, hi: 0.5 }, ciExcludesZero: true,
  rawP: 0.02, adjustedQ: 0.04, fdrPassed: true, adjusted: true, adjustedForPrevOutcome: true,
  confounders: ['weekend'], directionConsistency: 0.8, droppedRows: 0, confidence: 'moderate', notes: [], ...over,
})

const lagInsight = (over: Partial<AssociationResult>): LaggedInsight => ({
  key: 'k', exposureLabel: '수면시간', outcomeLabel: '에너지', outcomeMetric: 'energy',
  result: rep(over), familyOkCount: 3,
})

describe('temporalVoice — 단정 금지 가드 통과', () => {
  it('아침→저녁 문구는 단정하지 않는다', () => {
    const s = morningEveningSentence({ metric: 'anxiety', label: '불안', summary: { n: 16, meanDelta: 1.6, standardizedEffect: 0.5, ci: null, direction: 'increase', note: '' } })
    expect(s).toContain('평균 1.6점')
    expect(containsAssertion(s)).toBe(false)
  })

  it('사건 이후 문구는 "경향" 표현이며 단정하지 않는다', () => {
    const s = eventResponseSentence({ category: 'interpersonal_conflict', categoryLabel: '인간관계 갈등', metric: 'anxiety', metricLabel: '불안', eventCount: 6, result: { supportCount: 6, windowMinutes: 240, meanBefore: 2, meanAfter: 7, meanDelta: 5, ci: null, note: '' } })
    expect(s).toContain('경향이 있었어요')
    expect(containsAssertion(s)).toBe(false)
  })

  it('lagged 문구는 lag/방향을 말하되 원인 단정하지 않는다', () => {
    const s = laggedSentence(lagInsight({ lag: 1, direction: 'positive' }))
    expect(s).toContain('패턴이 관찰됐어요')
    expect(containsAssertion(s)).toBe(false)
  })

  it('보정 문구: adjusted면 "조정한 뒤에도 같은 방향", unadjusted면 "보정 없이"', () => {
    const adj = laggedAdjustmentNote(lagInsight({ adjusted: true, adjustedForPrevOutcome: true, confounders: ['weekend'] }))
    expect(adj).toContain('조정한 뒤에도 같은 방향')
    expect(containsAssertion(adj)).toBe(false)
    const un = laggedAdjustmentNote(lagInsight({ adjusted: false, adjustedForPrevOutcome: false, confounders: [] }))
    expect(un).toContain('보정 없이')
  })

  it('baseline shift 문구는 "후보" 표현만 쓰고 원인 단정 없음', () => {
    const s = baselineShiftSentence({ metric: 'moodLow', label: '기분 저하', candidate: { isCandidate: true, index: 10, standardizedShift: 1.2, beforeMean: 3, afterMean: 5 }, shiftDate: '2026-08-08' })
    expect(s).toContain('후보가 보여요')
    expect(s).not.toMatch(/원인|바뀌었습니다/)
    expect(containsAssertion(s)).toBe(false)
  })
})
