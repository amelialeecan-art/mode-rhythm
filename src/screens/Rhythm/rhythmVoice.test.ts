import { describe, expect, it } from 'vitest'
import { rhythmCompareSentence, cycleCompareSentence, type CycleCurvePoints } from './rhythmVoice'
import type { WeekCompareStat } from '../../data/services/rhythmService'

/** rel→mean 맵으로 recent/previous 곡선을 만든다(빠진 rel은 undefined). */
function curve(baseline: number, recent: Record<number, number>, previous: Record<number, number>): CycleCurvePoints {
  const pts = (m: Record<number, number>) =>
    Array.from({ length: 22 }, (_, i) => i - 14).map((rel) => ({ rel, mean: m[rel] }))
  return { baseline, recent: pts(recent), previous: pts(previous) }
}
const flat = (v: number) => {
  const o: Record<number, number> = {}
  for (let r = -14; r <= 7; r++) o[r] = v
  return o
}

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

describe('cycleCompareSentence — 주기 비교', () => {
  it('이전 주기가 같은 시기 안정적이면 억울 표현', () => {
    // 최근: 생리 전 높음, 이전: 기준선 수준(안정)
    const c = curve(45, { ...flat(45), [-3]: 80, [-2]: 82, [-1]: 84 }, flat(45))
    expect(cycleCompareSentence('emotional', c)).toBe(
      '생리 탓만 하기엔 억울해요. 이전 주기에는 같은 시기에도 감정이 비교적 안정적이었어요.',
    )
  })

  it('이전보다 일찍 흔들리기 시작하면 며칠 빨랐다고', () => {
    // 최근 onset -6, 이전 onset -2 (둘 다 pre가 높아 억울 분기 회피)
    const recent = { ...flat(50), [-6]: 70, [-5]: 72, [-4]: 74, [-3]: 76, [-2]: 78, [-1]: 80 }
    const previous = { ...flat(50), [-2]: 70, [-1]: 72 }
    const c = curve(45, recent, previous)
    const s = cycleCompareSentence('sleep', c)
    expect(s).toContain('이번 주기는 생리 6일 전부터 수면이 흔들렸어요.')
    expect(s).toContain('이전 주기보다 4일쯤 빨랐어요.')
  })

  it('비슷하면 거의 비슷했다고', () => {
    const c = curve(45, flat(50), flat(50))
    expect(cycleCompareSentence('appetite', c)).toBe('식욕 변화는 이전 주기들과 거의 비슷했어요.')
  })

  it('회복은 늘었/줄었', () => {
    const up = curve(40, flat(70), flat(45))
    expect(cycleCompareSentence('recovery', up)).toBe('이번 주기는 이전보다 회복 행동이 많았어요.')
  })

  it('같은 날 관계에 새 인과 방향을 만들지 않음(때문에 없음)', () => {
    const c = curve(45, { ...flat(45), [-1]: 80 }, flat(45))
    expect(cycleCompareSentence('emotional', c)).not.toContain('때문에')
  })
})
