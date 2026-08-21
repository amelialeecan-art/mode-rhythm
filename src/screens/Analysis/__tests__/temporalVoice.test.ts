/* =====================================================================
   MODE · V2 temporal 문구 (사람말 · 단정 금지 · 통계용어 제거)
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { containsAssertion } from '../../../copy/tone'
import {
  morningEveningSentence,
  eventResponseSentence,
  laggedSentence,
  laggedAdjustmentFriendly,
  baselineShiftSentence,
} from '../temporalVoice'
import type { AssociationResult } from '../../../engine/v2'
import type {
  LaggedInsight,
  MorningEveningInsight,
  EventResponseInsight,
  BaselineShiftInsight,
} from '../../../data/services/v2TemporalAnalysisService'

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

const meInsight = (dir: 'increase' | 'decrease'): MorningEveningInsight => ({
  metric: 'irritability', label: '짜증·예민함',
  summary: { n: 16, meanDelta: dir === 'increase' ? 1.6 : -1.6, standardizedEffect: 0.5, ci: null, direction: dir, note: '' },
  morningMean: 3, eveningMean: 5,
})

const evInsight: EventResponseInsight = {
  category: 'interpersonal_conflict', categoryLabel: '사람 때문에 스트레스받았어',
  metric: 'anxiety', metricLabel: '불안', eventCount: 6,
  result: { supportCount: 6, windowMinutes: 240, meanBefore: 3, meanAfter: 6, meanDelta: 3, ci: null, note: '' },
}

const shiftInsight = (rose: boolean): BaselineShiftInsight => ({
  metric: 'moodLow', label: '기분 가라앉음',
  candidate: { isCandidate: true, index: 10, standardizedShift: 1.2, beforeMean: rose ? 3 : 6, afterMean: rose ? 6 : 3 },
  shiftDate: '2026-08-08',
})

/** 통계 용어가 메인 문구에서 사라졌는지(§F). */
const STAT_WORDS = /경향이 있었|관찰됐|association|baseline|같은 방향|변화 후보|effect|coverage/

describe('temporalVoice — 사람말 + 단정 금지', () => {
  it('아침→저녁: 방향에 맞는 사람말, 통계용어·단정 없음', () => {
    const up = morningEveningSentence(meInsight('increase'))
    expect(up).toContain('저녁에')
    expect(up).not.toMatch(STAT_WORDS)
    expect(containsAssertion(up)).toBe(false)
    const down = morningEveningSentence(meInsight('decrease'))
    expect(down).toContain('가라앉는')
  })

  it('사건 이후: "뒤에는 ~ 더 높았어", 통계용어·단정 없음', () => {
    const s = eventResponseSentence(evInsight)
    expect(s).toContain('뒤에는')
    expect(s).toContain('더 높았어')
    expect(s).not.toMatch(STAT_WORDS)
    expect(containsAssertion(s)).toBe(false)
  })

  it('lag: 방향+시점을 사람말로, "패턴이 관찰됐어" 없음', () => {
    const s = laggedSentence(lagInsight({ lag: 1, direction: 'negative' }))
    expect(s).toContain('다음날')
    expect(s).toContain('더 낮았어')
    expect(s).not.toMatch(STAT_WORDS)
    expect(containsAssertion(s)).toBe(false)
  })

  it('보정 설명: adjusted면 "같이 봐도 남았다", 아니면 "아직 같이 보지 않은"', () => {
    const adj = laggedAdjustmentFriendly(lagInsight({ adjusted: true, adjustedForPrevOutcome: true, confounders: ['weekend'] }))
    expect(adj).toContain('같이 봐도')
    expect(containsAssertion(adj)).toBe(false)
    const un = laggedAdjustmentFriendly(lagInsight({ adjusted: false, adjustedForPrevOutcome: false, confounders: [] }))
    expect(un).toContain('아직 같이 보지 않은')
  })

  it('기준선 변화: "수준 자체가 올라간/내려간 것 같아", "baseline/후보/원인" 없음', () => {
    const up = baselineShiftSentence(shiftInsight(true))
    expect(up).toContain('수준 자체가')
    expect(up).toContain('올라간 것 같아')
    expect(up).not.toMatch(/원인|바뀌었습니다|baseline|후보/)
    expect(containsAssertion(up)).toBe(false)
    const down = baselineShiftSentence(shiftInsight(false))
    expect(down).toContain('내려간 것 같아')
  })
})
