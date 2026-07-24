import { describe, expect, it } from 'vitest'
import {
  calcEmotionalLoad,
  calcAppetiteLoad,
  calcSleepLoad,
  calcBodyLoad,
  calcEventLoad,
  calcRhythmLoad,
} from '../scoring'
import { makeLog, makeEvent } from './factories'

describe('calcEmotionalLoad', () => {
  it('calm이 높으면 감정 부하가 낮아진다', () => {
    const without = calcEmotionalLoad(makeLog({ moodLow: 6, anxiety: 6 }))
    const withCalm = calcEmotionalLoad(makeLog({ moodLow: 6, anxiety: 6, calm: 9 }))
    expect(withCalm).toBeLessThan(without)
  })

  it('anxiety/heaviness가 높으면 감정 부하가 높아진다', () => {
    const low = calcEmotionalLoad(makeLog({ anxiety: 1, heaviness: 1 }))
    const high = calcEmotionalLoad(makeLog({ anxiety: 9, heaviness: 9 }))
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(100)
  })
})

describe('직접 입력 우선', () => {
  it('머릿속 여유가 가득 참이면 감정 preset이 낮아도 부하에 반영된다', () => {
    const base = calcEmotionalLoad(makeLog({ calm: 8 }))
    const overloaded = calcEmotionalLoad(makeLog({ calm: 8, mentalSpaceLevel: 'overloaded' }))
    expect(overloaded).toBeGreaterThan(base)
    expect(overloaded).toBeGreaterThanOrEqual(80)
  })

  it('몸 에너지와 구체적 몸 신호가 몸 부하에 반영된다', () => {
    const base = calcBodyLoad(makeLog())
    const empty = calcBodyLoad(makeLog({ bodyEnergyLevel: 'empty' }))
    const signals = calcBodyLoad(makeLog({ bodySignalCodes: ['malaise', 'head_eye_fatigue'] }))
    expect(empty).toBeGreaterThan(base)
    expect(signals).toBeGreaterThan(base)
  })
})

describe('calcAppetiteLoad', () => {
  it('bingeUrge가 높으면 식욕 부하가 높아진다', () => {
    const low = calcAppetiteLoad(makeLog({ bingeUrge: 0 }), [])
    const high = calcAppetiteLoad(makeLog({ bingeUrge: 9 }), [])
    expect(high).toBeGreaterThan(low)
  })

  it('야식 사건이 있으면 식욕 부하가 가산된다', () => {
    const base = calcAppetiteLoad(makeLog({ appetite: 4 }), [])
    const withLateNight = calcAppetiteLoad(makeLog({ appetite: 4 }), [makeEvent({ eventCode: 'meal_latenight', category: 'food' })])
    expect(withLateNight).toBeGreaterThan(base)
  })
})

describe('calcSleepLoad', () => {
  it('sleepHours가 적으면 수면 부하가 높아진다 (legacy 경로)', () => {
    const enough = calcSleepLoad(makeLog({ sleepHours: 8 }), [])
    const little = calcSleepLoad(makeLog({ sleepHours: 4 }), [])
    expect(little).toBeGreaterThan(enough)
  })

  it('지난밤 수면(lastNightSleep)이 수면 부하를 결정한다', () => {
    const good = calcSleepLoad(makeLog({ lastNightSleep: { hours: 8 } }), [])
    const bad = calcSleepLoad(makeLog({ lastNightSleep: { hours: 4, issues: ['sleep_waking', 'sleep_nightmare'] } }), [])
    expect(bad).toBeGreaterThan(good)
  })

  it('lastNightSleep가 단일 출처 — sleep 사건이 함께 있어도 이중 가산하지 않는다', () => {
    const log = makeLog({ lastNightSleep: { hours: 5, quality: 4, issues: ['sleep_waking'] } })
    const sleepEvents = [
      makeEvent({ eventCode: 'sleep_allnight', category: 'sleep' }),
      makeEvent({ eventCode: 'sleep_nightmare', category: 'sleep' }),
    ]
    // lastNightSleep가 있으면 events는 무시된다 → 두 결과가 같아야 한다
    expect(calcSleepLoad(log, sleepEvents)).toBe(calcSleepLoad(log, []))
  })

  it("옛 기록의 'sleep_short' 사건이 이제 수면 부하에 반영된다 (기존 누락 해결)", () => {
    // 이전 구현에서는 sleep_short가 calcSleepLoad에서 참조되지 않아 0이었다.
    const before = calcSleepLoad(makeLog(), [])
    const withShort = calcSleepLoad(makeLog(), [makeEvent({ eventCode: 'sleep_short', category: 'sleep' })])
    expect(before).toBe(0)
    expect(withShort).toBeGreaterThan(before)
  })

  it('수면시간이 입력되면 sleep_short는 중복 가산하지 않는다', () => {
    const withHoursOnly = calcSleepLoad(makeLog({ lastNightSleep: { hours: 4 } }), [])
    const withHoursAndShort = calcSleepLoad(makeLog({ lastNightSleep: { hours: 4, issues: ['sleep_short'] } }), [])
    expect(withHoursAndShort).toBe(withHoursOnly)
  })
})

describe('calcEventLoad', () => {
  it('category 가중치가 반영된다 (relationship > environment)', () => {
    const rel = calcEventLoad([makeEvent({ category: 'relationship', intensity: 8 })])
    const env = calcEventLoad([makeEvent({ category: 'environment', intensity: 8 })])
    expect(rel).toBeGreaterThan(env)
  })

  it('movement 사건은 부하를 자동으로 낮추지도 높이지도 않는다(중립 0)', () => {
    // 운동/산책 같은 움직임 사건은 "했다는 사실"만으로 상태·부하를 개선하지 않는다.
    const load = calcEventLoad([makeEvent({ category: 'movement', intensity: 8 })])
    expect(load).toBe(0)
    // 다른 사건과 함께 있어도 movement가 그 사건 부하를 깎지 않는다.
    const withRel = calcEventLoad([
      makeEvent({ category: 'relationship', intensity: 8 }),
      makeEvent({ category: 'movement', intensity: 8 }),
    ])
    const relOnly = calcEventLoad([makeEvent({ category: 'relationship', intensity: 8 })])
    expect(withRel).toBe(relOnly)
  })
})

describe('calcRhythmLoad', () => {
  it('0~100 범위 안에 있다', () => {
    const r = calcRhythmLoad({ emotionalLoad: 100, appetiteLoad: 100, sleepLoad: 100, bodyLoad: 100, cycleLoad: 100, eventLoad: 100 })
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(100)
    expect(r).toBe(100)
  })
})
