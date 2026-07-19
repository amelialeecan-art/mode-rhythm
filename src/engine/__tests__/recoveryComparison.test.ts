import { describe, expect, it } from 'vitest'
import {
  compareSimilarEpisodeRecovery,
  MIN_SIMILAR_EPISODES,
  type EpisodeRecoveryFeature,
  type RecoveryActionRef,
} from '../recovery'

type FeatOpts = Partial<EpisodeRecoveryFeature>
const feat = (startDate: string, o: FeatOpts = {}): EpisodeRecoveryFeature => ({
  startDate,
  endDate: o.endDate ?? startDate,
  recoveryStartDate: o.recoveryStartDate,
  peakFunctionLevel: o.peakFunctionLevel ?? 4,
  confidence: o.confidence ?? 'reported',
  status: o.status ?? 'recovered',
  daysToRecovery: o.daysToRecovery,
})
const rec = (actionCode: string, actionLabel: string, direction: 'positive' | 'negative'): RecoveryActionRef => ({
  actionCode,
  actionLabel,
  direction,
})

describe('compareSimilarEpisodeRecovery (Phase 7)', () => {
  it('자기보고 에피소드가 없으면 null', () => {
    const eps = [feat('2026-06-10', { confidence: 'estimated' })]
    expect(compareSimilarEpisodeRecovery(eps, new Map())).toBeNull()
  })

  it('기준=최근, 유사=같은 기능저하 강도만(다른 강도/estimated 제외)', () => {
    const eps = [
      feat('2026-06-25', { peakFunctionLevel: 4, status: 'ongoing' }), // 기준(최근)
      feat('2026-06-01', { peakFunctionLevel: 4, daysToRecovery: 3 }),
      feat('2026-06-08', { peakFunctionLevel: 3, daysToRecovery: 2 }), // 강도 다름 → 제외
      feat('2026-06-10', { peakFunctionLevel: 4, confidence: 'estimated' }), // estimated → 제외
    ]
    const cmp = compareSimilarEpisodeRecovery(eps, new Map())!
    expect(cmp.referenceStart).toBe('2026-06-25')
    expect(cmp.peakFunctionLevel).toBe(4)
    expect(cmp.similarCount).toBe(1) // 06-01만
  })

  it('표본 부족(<3)이면 enoughSample=false', () => {
    const eps = [
      feat('2026-06-25', { status: 'ongoing' }),
      feat('2026-06-01', { daysToRecovery: 3 }),
      feat('2026-06-08', { daysToRecovery: 5 }),
    ]
    const cmp = compareSimilarEpisodeRecovery(eps, new Map())!
    expect(cmp.similarCount).toBe(2)
    expect(cmp.enoughSample).toBe(false)
    expect(MIN_SIMILAR_EPISODES).toBe(3)
  })

  it('표본 충분: 소요일 집계 + 행동 방향별 에피소드 수(중복 제거)', () => {
    const eps = [
      feat('2026-06-25', { status: 'ongoing' }), // 기준
      feat('2026-06-01', { recoveryStartDate: '2026-06-04', daysToRecovery: 3 }),
      feat('2026-06-08', { recoveryStartDate: '2026-06-13', daysToRecovery: 5 }),
      feat('2026-06-15', { recoveryStartDate: '2026-06-19', daysToRecovery: 4 }),
      feat('2026-06-20', { status: 'recovering' }), // 유사지만 회복 미확정
    ]
    const byDate = new Map<string, RecoveryActionRef[]>([
      ['2026-06-02', [rec('walk', '산책', 'positive')]],
      ['2026-06-03', [rec('walk', '산책', 'positive')]], // 같은 에피소드 내 중복 → 1번
      ['2026-06-04', [rec('sns', 'SNS 끊기', 'negative')]],
      ['2026-06-09', [rec('walk', '산책', 'positive'), rec('sleep', '잠', 'positive')]],
      ['2026-06-16', [rec('walk', '산책', 'positive')]],
    ])
    const cmp = compareSimilarEpisodeRecovery(eps, byDate)!
    expect(cmp.similarCount).toBe(4) // 회복 3 + 회복중 1
    expect(cmp.enoughSample).toBe(true)
    expect(cmp.recoveredCount).toBe(3)
    expect(cmp.daysToRecovery).toEqual([3, 4, 5])
    // walk = 3개 에피소드(06-01/08/15), sleep = 1개
    expect(cmp.positiveActions).toEqual([
      { actionCode: 'walk', actionLabel: '산책', direction: 'positive', episodeCount: 3 },
      { actionCode: 'sleep', actionLabel: '잠', direction: 'positive', episodeCount: 1 },
    ])
    expect(cmp.negativeActions).toEqual([
      { actionCode: 'sns', actionLabel: 'SNS 끊기', direction: 'negative', episodeCount: 1 },
    ])
  })
})
