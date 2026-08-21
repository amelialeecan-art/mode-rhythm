/* =====================================================================
   MODE · 리듬 겹쳐보기 어댑터 (순수 · 표시 전용) 단위 검증
   방향 통일/표시값 변환/눈금 선택/날짜 포맷/프리셋만 검증한다.
   원본 점수·저장 구조는 이 모듈이 절대 건드리지 않는다.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  METRIC_DIRECTION,
  METRIC_ORDER,
  PRESETS,
  isNeutral,
  toDisplayValue,
  pickTickIndices,
  formatTickDate,
  formatTooltipDate,
} from '../rhythmOverlay'
import type { RhythmMetric } from '../../../data/services/rhythmService'

describe('방향 통일', () => {
  it('부하 지표(감정·수면·몸)는 뒤집어 표시한다(값이 크면 힘듦 → 아래로)', () => {
    for (const m of ['emotional', 'sleep', 'body'] as RhythmMetric[]) {
      expect(METRIC_DIRECTION[m]).toBe('hardUp')
      expect(toDisplayValue(m, 70)).toBe(30)
      expect(toDisplayValue(m, 0)).toBe(100)
      expect(toDisplayValue(m, 100)).toBe(0)
    }
  })

  it('회복은 그대로(값이 크면 좋음 → 위로)', () => {
    expect(METRIC_DIRECTION.recovery).toBe('goodUp')
    expect(toDisplayValue('recovery', 70)).toBe(70)
  })

  it('식욕은 중립 — 뒤집지 않고 그대로 둔다', () => {
    expect(METRIC_DIRECTION.appetite).toBe('neutral')
    expect(isNeutral('appetite')).toBe(true)
    expect(toDisplayValue('appetite', 70)).toBe(70)
    // 식욕만 중립
    for (const m of ['emotional', 'sleep', 'body', 'recovery'] as RhythmMetric[]) {
      expect(isNeutral(m)).toBe(false)
    }
  })

  it('결측(undefined)은 표시값도 undefined — 0으로 채우지 않는다', () => {
    for (const m of METRIC_ORDER) expect(toDisplayValue(m, undefined)).toBeUndefined()
  })

  it('범위를 벗어난 값은 0~100으로 clamp한다', () => {
    expect(toDisplayValue('recovery', 140)).toBe(100)
    expect(toDisplayValue('recovery', -20)).toBe(0)
    expect(toDisplayValue('emotional', 140)).toBe(0) // clamp 100 → flip 0
  })
})

describe('x축 날짜 눈금 선택', () => {
  it('30일이면 양끝 포함 최대 6개를 균등 간격으로 고른다', () => {
    const idx = pickTickIndices(30, 6)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(29)
    expect(idx.length).toBeLessThanOrEqual(6)
    // 오름차순 + 중복 없음
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1])
  })

  it('슬롯이 적으면 개수만큼만, 1개면 [0], 0개면 빈 배열', () => {
    expect(pickTickIndices(1, 6)).toEqual([0])
    expect(pickTickIndices(0, 6)).toEqual([])
    expect(pickTickIndices(3, 6)).toEqual([0, 1, 2])
  })
})

describe('날짜 포맷', () => {
  it("눈금은 'M/D', 툴팁은 'M월 D일'", () => {
    expect(formatTickDate('2026-08-21')).toBe('8/21')
    expect(formatTooltipDate('2026-08-21')).toBe('8월 21일')
  })
})

describe('프리셋', () => {
  it("'전체'는 5개 지표, 'custom'(직접 고르기)은 빈 배열", () => {
    const all = PRESETS.find((p) => p.key === 'all')!
    expect(all.metrics.length).toBe(5)
    const custom = PRESETS.find((p) => p.key === 'custom')!
    expect(custom.metrics).toEqual([])
  })

  it('프리셋 지표는 모두 유효한 RhythmMetric', () => {
    const valid = new Set(METRIC_ORDER)
    for (const p of PRESETS) for (const m of p.metrics) expect(valid.has(m)).toBe(true)
  })
})
