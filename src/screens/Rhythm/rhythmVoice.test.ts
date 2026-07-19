import { describe, expect, it } from 'vitest'
import { rhythmCompareSentence } from './rhythmVoice'
import type { WeekCompareStat } from '../../data/services/rhythmService'

const stat = (diff: number, enough = true): WeekCompareStat => ({
  recentMean: 50 + diff,
  prevMean: 50,
  diff,
  recentN: 5,
  prevN: 20,
  enough,
})

describe('rhythmCompareSentence — 최근 일주일 자연어', () => {
  it('부하 metric 증가 → 많았어요', () => {
    expect(rhythmCompareSentence('sleep', stat(12))).toBe('최근 일주일은 평소보다 수면 문제가 많았어요.')
    expect(rhythmCompareSentence('emotional', stat(20))).toBe('최근 일주일은 평소보다 감정 흔들림이 많았어요.')
  })
  it('부하 metric 감소 → 적었어요', () => {
    expect(rhythmCompareSentence('emotional', stat(-12))).toBe('최근 일주일은 평소보다 감정 흔들림이 적었어요.')
  })
  it('차이 작으면 → 큰 차이 없음', () => {
    expect(rhythmCompareSentence('body', stat(3))).toBe('최근 일주일은 평소와 큰 차이가 없었어요.')
  })
  it('회복은 늘었/줄었 표현', () => {
    expect(rhythmCompareSentence('recovery', stat(12))).toBe('최근 일주일은 평소보다 회복 행동이 늘었어요.')
    expect(rhythmCompareSentence('recovery', stat(-12))).toBe('최근 일주일은 평소보다 회복 행동이 줄었어요.')
  })
  it('표본 부족이면 안내 문장', () => {
    expect(rhythmCompareSentence('sleep', stat(30, false))).toContain('기록이 조금 적어요')
  })
  it('내부 점수 숫자를 문장에 노출하지 않음', () => {
    expect(rhythmCompareSentence('sleep', stat(12))).not.toMatch(/\d/)
  })
})
