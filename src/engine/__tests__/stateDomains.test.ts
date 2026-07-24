import { describe, expect, it } from 'vitest'
import { resolveDailyStateDomains, calcEmotionalLoad, calcAppetiteLoad, calcEventLoad } from '..'
import { makeLog, makeEvent } from './factories'

/* step2 · 상태 영역 resolver. 감정 두 축 분리 + 직접값 우선순위 + 이중계산 금지.
   숫자 필드 값은 step1 매핑(emotionNumericFields)이 만드는 값을 그대로 사용한다. */

describe('resolveDailyStateDomains · 감정 두 축', () => {
  // (1) 대체로 안정 + 짜증 + 잠깐 영향 → 안정감·부담 두 축으로 유지
  it('대체로 안정 + 짜증 + 잠깐 영향은 안정감과 부담이 둘 다 남는다', () => {
    const d = resolveDailyStateDomains(
      makeLog({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['irritated'], emotionImpactLevel: 'brief', calm: 6, irritability: 6, moodLow: 3 }),
    )
    expect(d.emotionalStability).toEqual({ value: 75, source: 'direct', kind: 'capacity' })
    expect(d.emotionalBurden?.source).toBe('direct')
    expect(d.emotionalBurden!.value).toBeGreaterThan(0) // 짜증이 부담으로 남는다
    // 안정감이 부담 때문에 사라지지 않는다.
    expect(d.emotionalStability!.value).toBeGreaterThan(d.emotionalBurden!.value)
  })

  // (2) 하루 대부분 흔들림 + 예민·짜증 + 큰 영향
  it('하루 대부분 흔들림 + 예민·짜증 + 큰 영향은 안정감 낮고 부담 크다', () => {
    const d = resolveDailyStateDomains(
      makeLog({ emotionalStabilityLevel: 'mostly_shaken', emotionCodes: ['sensitive', 'irritated'], emotionImpactLevel: 'most_day', calm: 0, moodLow: 10, heaviness: 7, irritability: 9, anxiety: 4 }),
    )
    expect(d.emotionalStability!.value).toBeLessThan(20) // 흔들림 → 안정감 낮음
    expect(d.emotionalBurden!.value).toBeGreaterThan(40) // 부담 큼
    expect(d.emotionalBurden!.value).toBeGreaterThan(d.emotionalStability!.value)
  })

  // (3) 대체로 안정 + 가라앉음 → 안정감과 부담으로 분리 (덮어쓰지 않음)
  it('대체로 안정 + 가라앉음은 안정감을 낮추지 않고 부담만 따로 잡는다', () => {
    const d = resolveDailyStateDomains(
      makeLog({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['down'], calm: 6, sadness: 7, heaviness: 6, moodLow: 6 }),
    )
    // 가라앉았다는 이유로 안정감까지 낮추지 않는다.
    expect(d.emotionalStability).toEqual({ value: 75, source: 'direct', kind: 'capacity' })
    // 안정감(calm)으로 부담을 덮어쓰지 않는다 — 가라앉음이 부담으로 남는다.
    expect(d.emotionalBurden!.value).toBeGreaterThan(0)
    expect(d.emotionalBurden!.source).toBe('direct')
  })

  // (4) 매우 안정 + 감정 없음
  it('매우 안정 + 감정 없음은 안정감만 높고 부담은 없다(0)', () => {
    const d = resolveDailyStateDomains(makeLog({ emotionalStabilityLevel: 'very_stable', emotionCodes: [], calm: 8 }))
    expect(d.emotionalStability).toEqual({ value: 95, source: 'direct', kind: 'capacity' })
    expect(d.emotionalBurden).toEqual({ value: 0, source: 'direct', kind: 'strain' })
  })
})

describe('resolveDailyStateDomains · 영역 독립(서로 덮어쓰지 않음)', () => {
  // (5) 몸 에너지 낮음 + 집중 좋음 + 생활기능 유지
  it('몸 에너지 낮아도 집중·생활기능은 따로 유지된다', () => {
    const d = resolveDailyStateDomains(makeLog({ bodyEnergyLevel: 'empty', focusLevel: 'well', functionLevel: 2 }))
    expect(d.bodyEnergy!.value).toBeLessThan(20) // 에너지 낮음
    expect(d.focus!.value).toBeGreaterThan(70) // 집중은 좋음
    expect(d.functionLevel!.value).toBeLessThan(50) // 생활기능은 대체로 유지
  })

  // (6) 머릿속 복잡함 + 집중 가능
  it('머릿속이 복잡해도 집중은 가능할 수 있다(대체 금지)', () => {
    const d = resolveDailyStateDomains(makeLog({ mentalSpaceLevel: 'overloaded', focusLevel: 'well' }))
    expect(d.mentalSpace!.value).toBeLessThan(20)
    expect(d.focus!.value).toBeGreaterThan(70)
  })

  // (7) 집중 가능 + 사회적 여유 낮음
  it('집중은 가능해도 사람을 대할 여유는 낮을 수 있다', () => {
    const d = resolveDailyStateDomains(makeLog({ focusLevel: 'well', socialCapacityLevel: 'low' }))
    expect(d.focus!.value).toBeGreaterThan(70)
    expect(d.socialCapacity!.value).toBeLessThan(40)
  })

  // (12) 몸 신호는 몸의 불편에 반영(몸 에너지와 별개)
  it('몸 신호(bodySignalCodes)는 몸의 불편에 반영된다', () => {
    const d = resolveDailyStateDomains(makeLog({ bodySignalCodes: ['head_eye_fatigue', 'neck_shoulder_tension'] }))
    expect(d.bodyDiscomfort?.source).toBe('direct')
    expect(d.bodyDiscomfort!.value).toBeGreaterThan(0)
    expect(d.bodyEnergy).toBeUndefined() // 몸 신호가 몸 에너지를 만들어내지 않는다
  })
})

describe('resolveDailyStateDomains · 우선순위/이중계산', () => {
  // (8) 직접 입력과 옛 상태코드가 동시에 있을 때 직접값만(이중계산 없음)
  it('직접값과 옛 상태칩이 함께 있으면 직접값만 쓰고 legacy를 더하지 않는다', () => {
    const d = resolveDailyStateDomains(
      makeLog({
        emotionalStabilityLevel: 'mostly_stable',
        focusLevel: 'well',
        socialCapacityLevel: 'enough',
        bodyEnergyLevel: 'charged',
        // 같은 의미의 옛 상태칩이 함께 저장돼 있어도 무시돼야 한다.
        stateCodes: ['calm', 'unfocused', 'social_fatigue', 'drained'],
        calm: 6,
        focus: 3,
      }),
    )
    expect(d.emotionalStability).toEqual({ value: 75, source: 'direct', kind: 'capacity' })
    expect(d.focus).toEqual({ value: 85, source: 'direct', kind: 'capacity' }) // legacy 'unfocused'(30) 아님
    expect(d.socialCapacity!.source).toBe('direct')
    expect(d.socialCapacity!.value).toBe(90) // legacy 'social_fatigue'(30) 아님
    expect(d.bodyEnergy!.source).toBe('direct') // legacy 'drained' 아님
  })

  // (9) 직접값이 없을 때만 옛 기록 fallback
  it('직접값이 없으면 옛 stateCodes에서 가능한 값만 복원한다', () => {
    const d = resolveDailyStateDomains(makeLog({ stateCodes: ['calm', 'unfocused', 'social_fatigue', 'drained'] }))
    expect(d.emotionalStability).toEqual({ value: 75, source: 'legacy', kind: 'capacity' })
    expect(d.focus).toEqual({ value: 30, source: 'legacy', kind: 'capacity' })
    expect(d.socialCapacity).toEqual({ value: 30, source: 'legacy', kind: 'capacity' })
    expect(d.bodyEnergy).toEqual({ value: 20, source: 'legacy', kind: 'capacity' })
    // 근거 없는 영역은 정상으로 채우지 않는다.
    expect(d.mentalSpace).toBeUndefined()
    expect(d.sleep).toBeUndefined()
  })

  it('아무 근거가 없는 영역은 undefined (정상·보통 자동 채움 금지)', () => {
    const d = resolveDailyStateDomains(makeLog({}))
    expect(d.emotionalStability).toBeUndefined()
    expect(d.emotionalBurden).toBeUndefined()
    expect(d.bodyEnergy).toBeUndefined()
    expect(d.focus).toBeUndefined()
    expect(d.socialCapacity).toBeUndefined()
    expect(d.functionLevel).toBeUndefined()
  })
})

describe('상태와 사건 분리', () => {
  // (10) 업무 압박 사건 추가만으로 상태 영역값이 변하지 않음
  it('업무 압박 사건은 상태 영역·감정 부하를 바꾸지 않는다', () => {
    const log = makeLog({ emotionalStabilityLevel: 'mostly_stable', calm: 6, appetite: 5 })
    const before = resolveDailyStateDomains(log)
    // resolver는 사건을 입력으로 받지 않는다 → 사건은 상태 영역을 만들 수 없다.
    const after = resolveDailyStateDomains(log)
    expect(after).toEqual(before)
    // 감정/식욕 부하도 업무 사건으로 자동 악화되지 않는다.
    const workEvent = makeEvent({ category: 'work', eventCode: 'work_pressure', mappedFactorGroup: 'deadline_pressure', intensity: 8 })
    expect(calcEmotionalLoad(log)).toBe(calcEmotionalLoad(log))
    expect(calcAppetiteLoad(log, [workEvent])).toBe(calcAppetiteLoad(log, []))
  })

  // (11) 운동·산책·씻기 기록만으로 상태·부하가 자동 개선되지 않음
  it('움직임 사건은 사건 부하를 자동으로 낮추지 않는다', () => {
    const relOnly = calcEventLoad([makeEvent({ category: 'relationship', intensity: 8 })])
    const withMovement = calcEventLoad([
      makeEvent({ category: 'relationship', intensity: 8 }),
      makeEvent({ category: 'movement', eventCode: 'exercised', mappedFactorGroup: 'exercise', intensity: 9 }),
    ])
    expect(withMovement).toBe(relOnly) // 운동이 부하를 깎지 않는다
  })
})
