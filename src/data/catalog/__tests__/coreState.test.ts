import { describe, expect, it } from 'vitest'
import { CORE_METRICS } from '../../modelsV2'
import {
  CORE_STATE_META,
  CORE_STATE_ORDER,
  EVENING_PROMPTED,
  MORNING_PROMPTED,
  promptedMetricsFor,
} from '../coreState'

describe('coreState 카탈로그', () => {
  it('12 코어 metric 모두 한국어 표시명을 갖는다', () => {
    for (const m of CORE_METRICS) {
      expect(CORE_STATE_META[m]).toBeDefined()
      expect(CORE_STATE_META[m].label.length).toBeGreaterThan(0)
    }
    expect(CORE_STATE_ORDER).toEqual([...CORE_METRICS])
  })

  it('식욕을 하나로 합치지 않는다 — 세 축이 서로 다른 metric으로 존재한다', () => {
    expect(CORE_STATE_META.physicalHunger.label).toBe('신체적 배고픔')
    expect(CORE_STATE_META.craving.label).toBe('음식 craving')
    expect(CORE_STATE_META.bingeUrge.label).toBe('폭식 충동')
    // 세 라벨이 모두 다르다
    const labels = new Set([
      CORE_STATE_META.physicalHunger.label,
      CORE_STATE_META.craving.label,
      CORE_STATE_META.bingeUrge.label,
    ])
    expect(labels.size).toBe(3)
  })

  it('아침 기본 질문은 8개, 지정된 metric만 포함한다', () => {
    expect(MORNING_PROMPTED).toEqual([
      'moodLow', 'anxiety', 'irritability', 'energy', 'focus', 'physicalHunger', 'fatigueHeaviness', 'bloating',
    ])
    // 아침에는 craving/bingeUrge/impulsivity/painDiscomfort를 기본으로 묻지 않는다
    expect(MORNING_PROMPTED).not.toContain('craving')
    expect(MORNING_PROMPTED).not.toContain('bingeUrge')
    expect(MORNING_PROMPTED).not.toContain('impulsivity')
    expect(MORNING_PROMPTED).not.toContain('painDiscomfort')
  })

  it('저녁 기본 질문은 코어 12개 전체다', () => {
    expect(EVENING_PROMPTED).toEqual([...CORE_METRICS])
    expect(EVENING_PROMPTED).toHaveLength(12)
  })

  it('promptedMetricsFor가 checkInType별 목록을 돌려준다', () => {
    expect(promptedMetricsFor('morning')).toEqual(MORNING_PROMPTED)
    expect(promptedMetricsFor('evening')).toEqual(EVENING_PROMPTED)
    // 방어적 복사 — 반환값 수정이 원본에 영향 없어야 한다
    promptedMetricsFor('morning').push('craving')
    expect(MORNING_PROMPTED).toHaveLength(8)
  })
})
