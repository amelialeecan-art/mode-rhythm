import { describe, expect, it } from 'vitest'
import { resolveDailyStateDomains, describeTodayState, selectTodayDecision } from '..'
import type { RecoveryActionInsight, DailyStateDomains } from '..'
import { recentChangeSentence, followUpSentence } from '../../screens/Today/todayVoice'
import { makeLog } from './factories'

const rec = (p: Partial<RecoveryActionInsight>): RecoveryActionInsight => ({
  actionCode: 'sleep_early',
  actionLabel: '일찍 자기',
  category: 'body',
  combinedScore: 20,
  supportCount: 6,
  confidence: 70,
  confidenceTier: 'personal_helper',
  message: '',
  ...p,
})

const domainsOf = (p: Parameters<typeof makeLog>[0]) => resolveDailyStateDomains(makeLog(p))

describe('describeTodayState · 감정 두 축', () => {
  // (1) 대체로 안정 + 잠깐 짜증 → 안정과 짜증을 함께 표현
  it('대체로 안정 + 잠깐 짜증을 함께 표현한다', () => {
    const d = domainsOf({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['irritated'], emotionImpactLevel: 'brief', calm: 6, irritability: 6, moodLow: 3 })
    const [line] = describeTodayState(d, { emotionCodes: ['irritated'], emotionImpactLevel: 'brief' })
    expect(line).toContain('안정')
    expect(line).toContain('짜증')
  })

  // (2) 대체로 안정 + 가라앉음 → 안정감이 가라앉음에 덮이지 않음
  it('대체로 안정 + 가라앉음에서 안정감이 덮이지 않는다', () => {
    const d = domainsOf({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['down'], calm: 6, sadness: 7, heaviness: 6, moodLow: 6 })
    const [line] = describeTodayState(d, { emotionCodes: ['down'] })
    expect(line).toContain('감정은 대체로 안정적이었') // 안정감 유지
    expect(line).toContain('가라앉') // 부담도 따로 표현
    expect(line).not.toContain('많이 흔들렸') // 안정감을 낮추지 않음
  })

  // (12) capacity/strain 방향을 반대로 해석하지 않는다
  it('capacity는 낮을수록, strain은 높을수록 어려움으로 설명한다', () => {
    const lowEnergy = describeTodayState(domainsOf({ bodyEnergyLevel: 'empty' }))[0]
    expect(lowEnergy).toContain('몸 에너지가 낮았')
    const highEnergy = describeTodayState(domainsOf({ bodyEnergyLevel: 'charged' }))[0]
    expect(highEnergy).toContain('몸 에너지는 괜찮았')
    const fnHigh = describeTodayState(domainsOf({ functionLevel: 4 }))[0]
    expect(fnHigh).toContain('일상 기능이 버거웠')
    const fnLow = describeTodayState(domainsOf({ functionLevel: 1 }))[0]
    expect(fnLow).toContain('생활기능은 유지됐')
  })
})

describe('describeTodayState · 영역 대비', () => {
  // (3) 몸 에너지 낮음 + 집중·생활기능 유지 → 대비 문장
  it('몸 에너지 낮음 + 집중·생활기능 유지를 대비로 설명한다', () => {
    const d = domainsOf({ bodyEnergyLevel: 'empty', focusLevel: 'well', functionLevel: 2 })
    const [line] = describeTodayState(d)
    expect(line).toContain('집중력은 유지됐')
    expect(line).toContain('몸 에너지가 낮았')
    expect(line).toContain('지만') // 유지↔떨어짐 대비
  })

  // (4) 머릿속 복잡함 + 집중 가능 → 별도 영역 유지
  it('머릿속 복잡 + 집중 가능을 별도 영역으로 유지한다', () => {
    const d = domainsOf({ mentalSpaceLevel: 'overloaded', focusLevel: 'well' })
    const [line] = describeTodayState(d)
    expect(line).toContain('머릿속이 복잡했')
    expect(line).toContain('집중력은 유지됐')
  })

  // (5) 집중 가능 + 사람을 대할 여유 낮음 → 사회적 여유를 설명
  it('사람을 대할 여유가 낮으면 그 영역을 설명한다', () => {
    const d = domainsOf({ focusLevel: 'well', socialCapacityLevel: 'low' })
    const [line] = describeTodayState(d)
    expect(line).toContain('사람을 대할 여유가 떨어졌')
  })

  // (6) 직접 입력 없는 영역을 정상이라고 표현하지 않음
  it('입력 없는 영역을 정상으로 표현하지 않는다', () => {
    const d = domainsOf({ socialCapacityLevel: 'low' })
    const [line] = describeTodayState(d)
    expect(line).toContain('사람을 대할 여유가 떨어졌')
    // 입력하지 않은 영역을 '유지/괜찮'으로 지어내지 않는다.
    expect(line).not.toContain('감정')
    expect(line).not.toContain('수면')
    expect(line).not.toContain('집중')
    expect(line).not.toContain('몸 에너지')
  })

  it('상태 입력이 거의 없으면 억지 문장을 만들지 않는다', () => {
    expect(describeTodayState(domainsOf({}))).toEqual([])
  })
})

describe('selectTodayDecision · 대표 행동 1개', () => {
  const base = { isExceptionDay: false as const }

  // (7) 대표 행동은 항상 최대 1개
  it('여러 영역이 떨어져도 결정은 하나만 반환한다', () => {
    const d = domainsOf({ bodyEnergyLevel: 'empty', socialCapacityLevel: 'rarely', mentalSpaceLevel: 'overloaded', focusLevel: 'rarely', functionLevel: 4 })
    const decision = selectTodayDecision({ ...base, domains: d })
    expect(decision).not.toBeNull()
    expect(typeof decision!.text).toBe('string')
    expect(decision!.text.length).toBeGreaterThan(0)
  })

  // (8) 개인 회복 근거가 충분하면 개인화 행동 우선
  it('급성 저하가 없고 개인 회복 근거가 충분하면 개인화 행동을 고른다', () => {
    const d = domainsOf({ emotionalStabilityLevel: 'mostly_stable', calm: 6 }) // 뚜렷한 저하 없음
    const decision = selectTodayDecision({ ...base, domains: d, recoveryRecs: [rec({ actionLabel: '일찍 자기', confidence: 72, combinedScore: 25 })] })
    expect(decision!.source).toBe('personal')
    expect(decision!.text).toContain('비슷한 상태에서는')
    expect(decision!.text).toContain('일찍 자기')
  })

  // (9) 개인 근거가 없으면 "네 기록상" 같은 개인화 표현을 쓰지 않음
  it('개인 근거가 없으면 개인화 표현을 쓰지 않는다', () => {
    const d = domainsOf({ emotionalStabilityLevel: 'mostly_stable', calm: 6 })
    const decision = selectTodayDecision({ ...base, domains: d, recoveryRecs: [] })
    expect(decision!.source).toBe('default')
    for (const banned of ['네 기록상', '비슷한 날에는', '가장 효과적']) expect(decision!.text).not.toContain(banned)
  })

  // 약한 개인 근거(기준 미달)는 개인화하지 않는다.
  it('약한 회복 근거(신뢰도 낮음)는 개인화에 쓰지 않는다', () => {
    const d = domainsOf({ emotionalStabilityLevel: 'mostly_stable', calm: 6 })
    const decision = selectTodayDecision({ ...base, domains: d, recoveryRecs: [rec({ confidence: 30, confidenceTier: 'checking' })] })
    expect(decision!.source).toBe('default')
  })

  // (10) 예외일에는 평소 주기/소모 문구를 쓰지 않는다
  it('예외일 결정은 회복·기본생활 중심이고 주기 문구를 쓰지 않는다', () => {
    const d = domainsOf({ bodyEnergyLevel: 'empty', rhythmExceptionCodes: ['illness'] })
    const decision = selectTodayDecision({ isExceptionDay: true, exceptionLabels: ['감기·몸살'], domains: d })
    expect(decision!.kind).toBe('exception')
    expect(decision!.text).toContain('회복')
    expect(decision!.text).toContain('기본 생활')
    expect(decision!.text).not.toContain('주기')
    expect(decision!.text).not.toContain('평소 흐름')
  })

  // 기본 기능이 크게 떨어지면 그 영역을 기본 행동으로 (default)
  it('생활기능이 크게 낮으면 할 일을 줄이는 기본 행동을 고른다', () => {
    const d = domainsOf({ functionLevel: 4 })
    const decision = selectTodayDecision({ ...base, domains: d })
    expect(decision!.kind).toBe('basic_function')
    expect(decision!.source).toBe('default')
    expect(decision!.text).toContain('하나만 남기고')
  })

  it('상태 입력이 없으면 결정을 만들지 않는다(null)', () => {
    expect(selectTodayDecision({ ...base, domains: {} as DailyStateDomains })).toBeNull()
  })
})

describe('약한 결과 카드 숨김 (#11)', () => {
  it('최근 변화/이어진 변화 결과가 약하면 문장이 null이라 카드가 숨는다', () => {
    expect(recentChangeSentence(null)).toBeNull()
    expect(recentChangeSentence({ status: 'stable', startDate: '2026-06-10', lengthDays: 5, leading: [], holding: [], displayable: true })).toBeNull()
    expect(recentChangeSentence({ status: 'depleting', startDate: '2026-06-10', lengthDays: 5, leading: ['body'], holding: [], displayable: false })).toBeNull()
    expect(followUpSentence(null)).toBeNull()
  })

  it('최근 흐름이 뚜렷하면 문장을 만든다', () => {
    const s = recentChangeSentence({ status: 'depleting', startDate: '2026-06-10', lengthDays: 5, leading: ['sleep'], holding: [], displayable: true })
    expect(s).toContain('수면')
  })
})
