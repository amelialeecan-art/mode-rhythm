import { describe, expect, it } from 'vitest'
import { suppressRedundantCumulative, suppressRepeatedRecovery, strongRecoveryInsights } from './resultHierarchy'
import { recentChangeSentence } from './Today/todayVoice'
import { recentFlowSentence } from './Rhythm/rhythmVoice'
import type { RecentFlow, RecoveryActionInsight } from '../engine'
import type { FlowDriverCard, CumulativeExposureCard } from '../data/services/patternAnalysisService'

const driver = (p: Partial<FlowDriverCard>): FlowDriverCard => ({
  eventKey: 'k',
  factorGroup: 'workload',
  label: '일이 많았음',
  affectedDomains: ['emotional'],
  cumulative: true,
  overlapLabels: [],
  onsetCount: 3,
  comparisonCount: 5,
  typicalLeadDays: 2,
  ...p,
})
const cumulative = (p: Partial<CumulativeExposureCard>): CumulativeExposureCard => ({
  factorGroup: 'workload',
  key: 'workload|일이 많았음',
  title: '일이 많았음',
  metric: 'emotional',
  metricLabel: '감정 흔들림 정도',
  singleMean: 40,
  multiMean: 60,
  effectSize: 20,
  totalRuns: 6,
  multiRuns: 3,
  overlapDays: 0,
  ...p,
})
const rec = (p: Partial<RecoveryActionInsight>): RecoveryActionInsight => ({
  actionCode: 'walk',
  actionLabel: '산책',
  category: 'body',
  combinedScore: 20,
  supportCount: 6,
  confidence: 70,
  confidenceTier: 'personal_helper',
  message: '최근 기록에서 산책은(는) 전후 기록상 도움이 된 편이에요.',
  ...p,
})

// (4) flowDrivers와 cumulativeExposures가 같은 사건이면 하나만 강조(중복 억제)
describe('suppressRedundantCumulative', () => {
  it('flowDrivers가 이미 말한 사건(factorGroup)은 누적 노출에서 감춘다', () => {
    const out = suppressRedundantCumulative([driver({ factorGroup: 'workload' })], [cumulative({ factorGroup: 'workload' })])
    expect(out).toHaveLength(0)
  })
  it('flowDrivers가 다루지 않은 추가 사건은 보조로 남긴다', () => {
    const out = suppressRedundantCumulative(
      [driver({ factorGroup: 'workload' })],
      [cumulative({ factorGroup: 'caffeine', key: 'caffeine|카페인', title: '카페인' })],
    )
    expect(out).toHaveLength(1)
    expect(out[0].factorGroup).toBe('caffeine')
  })
})

// (5) 회복 행동 결과가 여러 카드에 반복되지 않음
describe('회복 결과 중복 억제', () => {
  it('대표 회복 카드가 다룬 actionCode는 다른 목록에서 제외한다', () => {
    const primary = [rec({ actionCode: 'walk' })]
    const others = [{ actionCode: 'walk', actionLabel: '산책', episodeCount: 3 }, { actionCode: 'sleep_early', actionLabel: '일찍 자기', episodeCount: 2 }]
    const out = suppressRepeatedRecovery(primary, others)
    expect(out.map((o) => o.actionCode)).toEqual(['sleep_early'])
  })
  it('약한 tier·방어적 메시지 회복 후보는 대표 카드에서 감춘다', () => {
    const recs = [
      rec({ actionCode: 'walk', confidenceTier: 'personal_helper', message: '전후 기록상 도움이 된 편이에요.' }),
      rec({ actionCode: 'nap', confidenceTier: 'checking', message: '도움이 된 편이에요.' }),
      rec({ actionCode: 'tea', confidenceTier: 'some_help', message: '다음날 버거움이 낮게 기록된 편이에요. 아직 표본은 더 필요해요.' }),
    ]
    const out = strongRecoveryInsights(recs)
    expect(out.map((r) => r.actionCode)).toEqual(['walk']) // checking·방어 메시지 제외
  })
})

// (2) Today와 Rhythm의 최근 흐름이 같은 긴 문장으로 중복되지 않음
describe('Today vs Rhythm 최근 흐름 문장 분리', () => {
  const flow: RecentFlow = { status: 'depleting', startDate: '2026-06-10', lengthDays: 6, leading: ['body'], holding: ['emotional'], displayable: true }
  it('Today 한 줄과 Rhythm 전체 설명이 서로 다른 문장이다', () => {
    const todayLine = recentChangeSentence(flow)
    const rhythmLine = recentFlowSentence(flow)
    expect(todayLine).toBeTruthy()
    expect(rhythmLine).toBeTruthy()
    expect(todayLine).not.toBe(rhythmLine)
    // Today는 짧은 한 줄, Rhythm은 더 긴 설명
    expect((rhythmLine as string).length).toBeGreaterThan((todayLine as string).length)
  })
})
