/* =====================================================================
   MODE · friendlyCopy helper (표시 전용) — 없는 숫자 창작 금지 + 사람말
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  approxRating,
  beforeAfterLine,
  repetitionPhrase,
  cycleWindowPhrase,
  lagWord,
  confidenceWords,
} from '../friendlyCopy'

describe('approxRating', () => {
  it('반올림해서 "N점 정도"', () => {
    expect(approxRating(4.1)).toBe('4점 정도')
    expect(approxRating(6.4)).toBe('6점 정도')
  })
  it('숫자가 아니면 빈 문자열(없는 값 창작 금지)', () => {
    expect(approxRating(NaN)).toBe('')
  })
})

describe('beforeAfterLine', () => {
  it('두 값이 있으면 평소→이때 비교 문장', () => {
    expect(beforeAfterLine(4.1, 6.4)).toBe('평소에는 4점 정도였는데 이때는 6점 정도였어.')
  })
  it('라벨을 바꿀 수 있다', () => {
    expect(beforeAfterLine(3, 5, { beforeLabel: '아침에는', afterLabel: '저녁에는' })).toBe('아침에는 3점 정도였는데 저녁에는 5점 정도였어.')
  })
  it('한쪽이라도 없으면 null(문장 만들지 않음)', () => {
    expect(beforeAfterLine(NaN, 5)).toBeNull()
    expect(beforeAfterLine(3, NaN)).toBeNull()
  })
})

describe('repetitionPhrase — "같은 방향" 안 씀', () => {
  it('전부 일치면 "최근 N번 모두 비슷했어"', () => {
    expect(repetitionPhrase(4, 4)).toBe('최근 4번 모두 비슷했어.')
  })
  it('일부면 "비교한 N번 중 M번이 그랬어"', () => {
    expect(repetitionPhrase(6, 8)).toBe('비교한 8번 중 6번이 그랬어.')
  })
  it('같은 방향 같은 통계 표현이 없다', () => {
    expect(repetitionPhrase(4, 4)).not.toMatch(/같은 방향/)
    expect(repetitionPhrase(6, 8)).not.toMatch(/같은 방향/)
  })
})

describe('cycleWindowPhrase — D- 표기 안 씀', () => {
  it('D-7 → 일주일 전쯤', () => {
    expect(cycleWindowPhrase(-7)).toBe('생리하기 일주일 전쯤에는')
  })
  it('D-3 → 3일 전쯤', () => {
    expect(cycleWindowPhrase(-3)).toBe('생리하기 3일 전쯤에는')
  })
  it('결과에 D-/D+ 표기가 없다', () => {
    for (const d of [-7, -3, -1, 0, 2]) expect(cycleWindowPhrase(d)).not.toMatch(/D[-+]/)
  })
})

describe('lagWord', () => {
  it('0/1/2/n을 사람말로', () => {
    expect(lagWord(0)).toBe('같은 날')
    expect(lagWord(1)).toBe('다음날')
    expect(lagWord(2)).toBe('이틀 뒤')
    expect(lagWord(3)).toBe('3일 뒤')
  })
})

describe('confidenceWords — badge 대신 사람말', () => {
  it('등급별 설명이 자연어', () => {
    expect(confidenceWords('strong')).toContain('믿을 만')
    expect(confidenceWords('insufficient')).toContain('지켜봐야')
    for (const c of ['strong', 'moderate', 'tentative', 'exploratory', 'insufficient'] as const) {
      expect(confidenceWords(c).length).toBeGreaterThan(0)
    }
  })
})
