import { describe, expect, it } from 'vitest'
import { findAssertion, containsAssertion, getToneCopy, type ToneKey, type ToneModeValue } from './tone'

describe('findAssertion (단정 가드)', () => {
  it('앱 단정 표현을 잡는다', () => {
    expect(containsAssertion('이건 수면 부족이 원인입니다')).toBe(true)
    expect(containsAssertion('수면 부족 때문에 그래요')).toBe(true)
    expect(containsAssertion('반드시 산책하세요')).toBe(true)
    expect(containsAssertion('내일은 회복 우선일입니다')).toBe(true)
    expect(containsAssertion('이 행동이 치료예요')).toBe(true)
  })

  it('사용자 사건 라벨의 "때문에"는 예외(허용)', () => {
    // 사용자가 고르는 기록 라벨이지 앱이 단정하는 문장이 아니다.
    expect(containsAssertion('연락/답장 때문에 신경 쓰였음')).toBe(false)
    expect(containsAssertion('외모/몸 때문에 신경 쓰였음')).toBe(false)
  })

  it('부정/완곡 표현은 허용', () => {
    expect(containsAssertion('진단이 아니라 기록 기반 해석이에요')).toBe(false)
    expect(containsAssertion('내일은 회복 우선일 가능성이 있어요')).toBe(false)
    expect(containsAssertion('함께 나타나는 경향이 있어요')).toBe(false)
    expect(containsAssertion('확정은 아니에요')).toBe(false)
  })
})

describe('getToneCopy', () => {
  const keys: ToneKey[] = ['reference', 'analysisIntro', 'rhythmIntro', 'emptyData']
  const tones: (ToneModeValue | undefined)[] = ['calm', 'witty', 'direct', undefined]

  it('모든 tone/key 문구가 비어있지 않고 단정 표현이 없다', () => {
    for (const k of keys) {
      for (const t of tones) {
        const copy = getToneCopy(t, k)
        expect(copy.length).toBeGreaterThan(0)
        expect(findAssertion(copy)).toBeNull()
      }
    }
  })

  it('tone에 따라 문구가 달라진다', () => {
    expect(getToneCopy('calm', 'reference')).not.toBe(getToneCopy('direct', 'reference'))
  })
})
