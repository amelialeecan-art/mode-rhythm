/* =====================================================================
   MODE · 리듬 겹쳐보기 어댑터 (순수 · 표시 전용) 단위 검증
   방향 통일/표시값 변환/도메인 시작/눈금/날짜 포맷만 검증한다.
   원본 점수·저장 구조는 이 모듈이 절대 건드리지 않는다.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  OVERLAY_METRICS,
  DEFAULT_RANGE_KEY,
  METRIC_LABEL,
  toDisplayValue,
  effectiveDomainStart,
  pickTickIndices,
  formatTickDate,
  formatDetailDate,
} from '../rhythmOverlay'

describe('메인 겹쳐보기 지표 = 4개 (회복 제외)', () => {
  it('기분·식욕·수면·몸 4개, 회복 없음', () => {
    expect(OVERLAY_METRICS).toEqual(['emotional', 'appetite', 'sleep', 'body'])
    expect(OVERLAY_METRICS).not.toContain('recovery')
  })
  it('버튼 이름은 기분/식욕/수면/몸', () => {
    expect(METRIC_LABEL.emotional).toBe('기분')
    expect(METRIC_LABEL.appetite).toBe('식욕')
    expect(METRIC_LABEL.sleep).toBe('수면')
    expect(METRIC_LABEL.body).toBe('몸')
  })
  it('기본 기간은 30일', () => {
    expect(DEFAULT_RANGE_KEY).toBe('30d')
  })
})

describe('표시 방향 (설명 없이 선만 봐도)', () => {
  it('기분 ↑ = 기분 좋음 (부하 뒤집음)', () => {
    expect(toDisplayValue('emotional', 80)).toBe(20) // 감정 부하 큼 → 기분선 낮음
    expect(toDisplayValue('emotional', 10)).toBe(90) // 부하 적음 → 기분선 높음
  })
  it('수면 ↑ = 잘 잠 (문제 뒤집음)', () => {
    expect(toDisplayValue('sleep', 90)).toBe(10) // 수면 문제 큼 → 수면선 낮음
    expect(toDisplayValue('sleep', 5)).toBe(95) // 문제 적음 → 수면선 높음
  })
  it('몸 ↑ = 몸 컨디션 좋음 (불편 뒤집음)', () => {
    expect(toDisplayValue('body', 70)).toBe(30)
    expect(toDisplayValue('body', 0)).toBe(100)
  })
  it('식욕 ↑ = 먹고 싶은 정도 강함 (뒤집지 않음)', () => {
    expect(toDisplayValue('appetite', 70)).toBe(70)
    expect(toDisplayValue('appetite', 10)).toBe(10)
  })
  it('결측은 0으로 채우지 않는다', () => {
    for (const m of OVERLAY_METRICS) expect(toDisplayValue(m, undefined)).toBeUndefined()
  })
  it('범위 밖 값은 clamp', () => {
    expect(toDisplayValue('appetite', 140)).toBe(100)
    expect(toDisplayValue('emotional', 140)).toBe(0)
  })
})

describe('그래프 도메인 시작 (오른쪽 압축 방지)', () => {
  it('첫 데이터가 기간 안에서 시작하면 거기서 시작', () => {
    // 1년 선택(작년 8/23~), 첫 데이터 6/13 → 6/13부터
    expect(effectiveDomainStart('2025-08-23', '2026-06-13')).toBe('2026-06-13')
  })
  it('6개월도 동일 규칙', () => {
    expect(effectiveDomainStart('2026-02-22', '2026-06-13')).toBe('2026-06-13')
  })
  it('데이터가 기간보다 오래되면 기간 시작에서 자른다', () => {
    expect(effectiveDomainStart('2026-07-24', '2024-01-01')).toBe('2026-07-24')
  })
  it('데이터가 없으면 기간 시작 그대로', () => {
    expect(effectiveDomainStart('2026-07-24', undefined)).toBe('2026-07-24')
  })
})

describe('x축 날짜 눈금 + 포맷', () => {
  it('30일이면 양끝 포함 최대 6개', () => {
    const idx = pickTickIndices(30, 6)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe(29)
    expect(idx.length).toBeLessThanOrEqual(6)
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1])
  })
  it('슬롯이 적으면 그만큼만', () => {
    expect(pickTickIndices(1, 6)).toEqual([0])
    expect(pickTickIndices(0, 6)).toEqual([])
  })
  it("눈금 'M/D', 상세 'M월 D일'", () => {
    expect(formatTickDate('2026-08-05')).toBe('8/5')
    expect(formatDetailDate('2026-08-16')).toBe('8월 16일')
  })
})
