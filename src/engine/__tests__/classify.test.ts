import { describe, expect, it } from 'vitest'
import { classifyDay, type ClassifyInput, type DayScores } from '../classify'
import type { CycleContext } from '../cycle'
import { makeLog, makeEvent } from './factories'
import type { EventLog } from '../../data/models'

const NONE_CYCLE: CycleContext = {
  isPeriod: false,
  isPremenstrualWindow: false,
  isOvulationWindow: false,
  confidence: 'none',
}

function input(scores: Partial<DayScores>, log = makeLog(), events: EventLog[] = []): ClassifyInput {
  return {
    scores: {
      emotionalLoad: 0,
      appetiteLoad: 0,
      sleepLoad: 0,
      bodyLoad: 0,
      cycleLoad: 0,
      eventLoad: 0,
      rhythmLoad: 0,
      ...scores,
    },
    log,
    events,
    cycle: NONE_CYCLE,
  }
}

describe('classifyDay', () => {
  it('emotionalLoad가 높으면 emotion_sensitive', () => {
    expect(classifyDay(input({ emotionalLoad: 70, rhythmLoad: 45 })).dayType).toBe('emotion_sensitive')
  })

  it('appetiteLoad가 높으면 appetite_shift', () => {
    expect(classifyDay(input({ appetiteLoad: 70, rhythmLoad: 45 })).dayType).toBe('appetite_shift')
  })

  it('rhythm/sleep 둘 다 높으면 recovery_priority', () => {
    expect(classifyDay(input({ rhythmLoad: 80, sleepLoad: 70, emotionalLoad: 50 })).dayType).toBe('recovery_priority')
  })

  it('emotional+appetite 둘 다 높으면 mixed_load', () => {
    expect(classifyDay(input({ emotionalLoad: 68, appetiteLoad: 62, rhythmLoad: 60 })).dayType).toBe('mixed_load')
  })

  it('selfCriticism 높은 감정 민감일이면 subLabel 자기평가 보류', () => {
    const c = classifyDay(input({ emotionalLoad: 70, rhythmLoad: 45 }, makeLog({ selfCriticism: 8 })))
    expect(c.dayType).toBe('emotion_sensitive')
    expect(c.subLabel).toBe('자기평가 보류')
  })

  it('sleepLoad 높은 식욕 변동일이면 subLabel 잠 부족성 허기', () => {
    const c = classifyDay(input({ appetiteLoad: 70, sleepLoad: 70, rhythmLoad: 55 }))
    expect(c.dayType).toBe('appetite_shift')
    expect(c.subLabel).toBe('잠 부족성 허기')
  })

  it('야식 사건이 있는 식욕 변동일이면 subLabel 야식 경보', () => {
    const c = classifyDay(
      input({ appetiteLoad: 70, rhythmLoad: 45 }, makeLog(), [makeEvent({ eventCode: 'meal_latenight', category: 'food' })]),
    )
    expect(c.subLabel).toBe('야식 경보')
  })
})
