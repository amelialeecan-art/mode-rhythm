import { describe, expect, it } from 'vitest'
import { factorStrength, factorPhrase, episodeTrigger, eventResponseSentence } from './analysisVoice'

const pts = (m: Record<number, number | undefined>) =>
  [-3, -2, -1, 0, 1, 2, 3].map((rel) => ({ rel, mean: m[rel] }))

describe('factorStrength — 엔진 evidence/시간창 → 강도', () => {
  it('reference는 약함', () => {
    expect(factorStrength('reference', 'previous_day')).toBe('weak')
  })
  it('반복/충분 + 지연 시간창은 강함', () => {
    expect(factorStrength('sufficient', 'recent_3_days')).toBe('strong')
    expect(factorStrength('repeated', 'previous_day')).toBe('strong')
  })
  it('같은 날은 강함이 될 수 없음(방향 모름)', () => {
    expect(factorStrength('sufficient', 'same_day')).toBe('medium')
  })
  it('early는 중간', () => {
    expect(factorStrength('early', 'previous_day')).toBe('medium')
  })
})

describe('factorPhrase — 강도별 편한 말투', () => {
  it('강함(지연): 직설 인과 + 반복 표현', () => {
    const r = factorPhrase({ title: '대인 갈등', metric: 'sleep', window: 'recent_3_days', evidence: 'sufficient' })
    expect(r.strength).toBe('strong')
    expect(r.text).toBe('대인 갈등 때문에 그 뒤 며칠간 잠이 망가지는 패턴이 반복됐어요.')
  })

  it('중간(지연): 인과 단정 없이 경향', () => {
    const r = factorPhrase({ title: '쇼츠·릴스 과다', metric: 'body', window: 'previous_day', evidence: 'early' })
    expect(r.strength).toBe('medium')
    expect(r.text).toBe('쇼츠·릴스 과다 뒤 몸이 힘든 날이 많았어요.')
    expect(r.text).not.toContain('때문에')
  })

  it('마감·압박 → 멘탈: 조사 처리(받침)', () => {
    const r = factorPhrase({ title: '마감·압박', metric: 'emotional', window: 'previous_day', evidence: 'repeated' })
    // repeated + previous_day = strong
    expect(r.text).toBe('마감·압박 때문에 그 다음날 멘탈이 크게 흔들리는 패턴이 반복됐어요.')
  })
})

describe('factorPhrase — 같은 날 관계는 잘못된 선후로 바꾸지 않음', () => {
  it('같은 날은 "같이 터졌어요"만, "때문에" 금지', () => {
    const r = factorPhrase({ title: '과식', metric: 'emotional', window: 'same_day', evidence: 'repeated' })
    expect(r.text).toBe('과식과 멘탈 붕괴가 같은 날 같이 터졌어요.')
    expect(r.text).not.toContain('때문에')
  })
  it('같은 날은 evidence가 높아도 인과 표현 없음', () => {
    const r = factorPhrase({ title: '외모 자극', metric: 'emotional', window: 'same_day', evidence: 'sufficient' })
    expect(r.text).not.toMatch(/때문에|주요 원인|악화/)
    expect(r.text).toContain('같은 날 같이 터졌어요')
  })
})

describe('episodeTrigger — 유쾌 라벨(카드당 1회), 결정론적', () => {
  it('선행 2개면 조합 트리거', () => {
    expect(episodeTrigger({ precursors: ['마감·압박', '수면 부족'], afters: [] })).toBe(
      '이번 정병 트리거는 마감·압박과 수면 부족 조합이었어요.',
    )
  })
  it('선행 1개면 그 쪽', () => {
    expect(episodeTrigger({ precursors: ['대인 갈등'], afters: [] })).toBe('이번 정병 트리거는 대인 갈등 쪽이 컸어요.')
  })
  it('선행 없고 이후 행동만이면 후폭풍', () => {
    expect(episodeTrigger({ precursors: [], afters: ['쇼츠·릴스 과다'] })).toContain('후폭풍')
  })
  it('아무것도 없으면 null', () => {
    expect(episodeTrigger({ precursors: [], afters: [] })).toBeNull()
  })
  it('같은 입력은 항상 같은 출력(결정론적)', () => {
    const a = episodeTrigger({ precursors: ['마감·압박', '수면 부족'], afters: [] })
    const b = episodeTrigger({ precursors: ['마감·압박', '수면 부족'], afters: [] })
    expect(a).toBe(b)
  })
})

describe('eventResponseSentence — 사건 전후 곡선 요약', () => {
  const base = 42
  it('사건 뒤 1~3일 악화', () => {
    const s = eventResponseSentence({ title: '대인 갈등', metric: 'sleep', baseline: base, points: pts({ [-1]: 42, 0: 44, 1: 70, 2: 66, 3: 62 }) })
    expect(s).toContain('대인 갈등 뒤 1~3일 동안')
    expect(s).toContain('망가졌어요')
  })
  it('당일 정점', () => {
    const s = eventResponseSentence({ title: '마감·압박', metric: 'emotional', baseline: base, points: pts({ [-1]: 43, 0: 78, 1: 70, 2: 50, 3: 45 }) })
    expect(s).toContain('당일과 다음 날')
    expect(s).toContain('멘탈')
  })
  it('사건 전부터 안 좋고 이후에도 이어짐', () => {
    const s = eventResponseSentence({ title: '쇼츠·릴스 과다', metric: 'body', baseline: base, points: pts({ [-3]: 60, [-2]: 62, [-1]: 64, 0: 65, 1: 63, 2: 61, 3: 60 }) })
    expect(s).toBe('쇼츠·릴스 과다 전부터 몸 상태가 안 좋았고, 이후에도 이어졌어요.')
  })
  it('뚜렷한 변화 없음', () => {
    const s = eventResponseSentence({ title: '과식', metric: 'appetite', baseline: base, points: pts({ [-1]: 44, 0: 45, 1: 43, 2: 46, 3: 44 }) })
    expect(s).toBe('사건 전후로 뚜렷한 변화는 없었어요.')
  })
})
