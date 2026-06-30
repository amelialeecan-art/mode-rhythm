import { describe, expect, it } from 'vitest'
import { buildTodayPlan } from '../todayPlan'
import type { DayScores } from '../classify'
import { makeLog } from './factories'

function scores(p: Partial<DayScores> = {}): DayScores {
  return { emotionalLoad: 0, appetiteLoad: 0, sleepLoad: 0, bodyLoad: 0, cycleLoad: 0, eventLoad: 0, rhythmLoad: 0, ...p }
}

describe('buildTodayPlan', () => {
  it('rhythmLoad가 높으면 일정이 줄어드는 문구', () => {
    const plan = buildTodayPlan({ scores: scores({ rhythmLoad: 80 }), log: makeLog(), events: [] })
    expect(plan.schedule).toContain('최소한')
  })

  it('appetiteLoad가 높으면 식사가 단백질/야식 대비', () => {
    const plan = buildTodayPlan({ scores: scores({ appetiteLoad: 70 }), log: makeLog(), events: [] })
    expect(plan.food).toContain('단백질')
  })

  it('bodyLoad가 높으면 운동이 스트레칭/무리 금지', () => {
    const plan = buildTodayPlan({ scores: scores({ bodyLoad: 75 }), log: makeLog(), events: [] })
    expect(plan.movement).toContain('스트레칭')
  })

  it('irritability가 높으면 관계가 대화 속도 조절', () => {
    const plan = buildTodayPlan({ scores: scores({ emotionalLoad: 72 }), log: makeLog({ irritability: 8 }), events: [] })
    expect(plan.relationship).toContain('대화 속도')
  })
})
