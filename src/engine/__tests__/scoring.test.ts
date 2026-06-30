import { describe, expect, it } from 'vitest'
import {
  calcEmotionalLoad,
  calcAppetiteLoad,
  calcSleepLoad,
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
  it('sleepHours가 적으면 수면 부하가 높아진다', () => {
    const enough = calcSleepLoad(makeLog({ sleepHours: 8 }), [])
    const little = calcSleepLoad(makeLog({ sleepHours: 4 }), [])
    expect(little).toBeGreaterThan(enough)
  })
})

describe('calcEventLoad', () => {
  it('category 가중치가 반영된다 (relationship > environment)', () => {
    const rel = calcEventLoad([makeEvent({ category: 'relationship', intensity: 8 })])
    const env = calcEventLoad([makeEvent({ category: 'environment', intensity: 8 })])
    expect(rel).toBeGreaterThan(env)
  })

  it('movement만 있으면 부하가 낮다(음수→0 처리)', () => {
    const load = calcEventLoad([makeEvent({ category: 'movement', intensity: 8 })])
    expect(load).toBe(0)
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
