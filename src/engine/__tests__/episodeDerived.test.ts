import { describe, expect, it } from 'vitest'
import {
  sleepDuration,
  sleepMidpoint,
  formatSleepDuration,
  minutesBetween,
} from '../sleepDerived'
import {
  mealInterval,
  computeMealIntervals,
  timeSincePreviousMeal,
  mealDurationMinutes,
  preCompleteness,
  postCompleteness,
} from '../mealDerived'
import type { MealEpisode } from '../../data/modelsV2'

describe('sleepDerived', () => {
  it('자정을 넘는 수면시간을 정확히 계산한다', () => {
    // 8/20 23:30 잠듦 → 8/21 07:00 기상 = 7시간 30분 = 450분
    const d = sleepDuration({ sleepOnsetAt: '2026-08-20T23:30:00', wakeAt: '2026-08-21T07:00:00' })
    expect(d).toBe(450)
    expect(formatSleepDuration(d)).toBe('7시간 30분')
  })

  it('onset 또는 wake가 없으면 수면시간은 null', () => {
    expect(sleepDuration({ sleepOnsetAt: undefined, wakeAt: '2026-08-21T07:00:00' })).toBeNull()
    expect(sleepDuration({ sleepOnsetAt: '2026-08-20T23:30:00', wakeAt: undefined })).toBeNull()
  })

  it('순서가 뒤집히면(기상<잠듦) null', () => {
    expect(sleepDuration({ sleepOnsetAt: '2026-08-21T07:00:00', wakeAt: '2026-08-20T23:30:00' })).toBeNull()
  })

  it('중간시각은 onset과 wake의 중점', () => {
    const mid = sleepMidpoint({ sleepOnsetAt: '2026-08-20T23:00:00', wakeAt: '2026-08-21T07:00:00' })
    // 중점 = 03:00 로컬 → 시각 확인(로컬 기준 03:00)
    expect(mid).not.toBeNull()
    expect(new Date(mid!).getHours()).toBe(3)
  })

  it('minutesBetween은 결측을 null로', () => {
    expect(minutesBetween(undefined, '2026-08-21T07:00:00')).toBeNull()
    expect(minutesBetween('2026-08-21T07:00:00', '2026-08-21T07:30:00')).toBe(30)
  })
})

function meal(startedAt: string, extra: Partial<MealEpisode> = {}): MealEpisode {
  return {
    localDate: startedAt.slice(0, 10), startedAt, source: 'manual', schemaVersion: 1,
    createdAt: 't', updatedAt: 't', ...extra,
  }
}

describe('mealDerived', () => {
  it('두 식사 간격(분)을 계산한다', () => {
    expect(mealInterval(meal('2026-08-21T12:00:00'), meal('2026-08-21T15:20:00'))).toBe(200)
  })

  it('식사 소요시간(started→ended)', () => {
    expect(mealDurationMinutes({ startedAt: '2026-08-21T12:00:00', endedAt: '2026-08-21T12:25:00' })).toBe(25)
    expect(mealDurationMinutes({ startedAt: '2026-08-21T12:00:00', endedAt: undefined })).toBeNull()
  })

  it('computeMealIntervals: 첫 식사는 null, 이후는 직전과의 간격', () => {
    const meals = [meal('2026-08-21T08:00:00'), meal('2026-08-21T12:30:00'), meal('2026-08-21T19:00:00')]
    expect(computeMealIntervals(meals)).toEqual([null, 270, 390])
  })

  it('computeMealIntervals는 입력 순서와 무관(정렬 후 계산)', () => {
    const meals = [meal('2026-08-21T19:00:00'), meal('2026-08-21T08:00:00'), meal('2026-08-21T12:30:00')]
    expect(computeMealIntervals(meals)).toEqual([null, 270, 390])
  })

  it('timeSincePreviousMeal: 직전 식사 이후 경과', () => {
    const meals = [meal('2026-08-21T08:00:00'), meal('2026-08-21T12:30:00')]
    const target = meal('2026-08-21T13:00:00')
    expect(timeSincePreviousMeal(target, meals)).toBe(30) // 12:30 직전과 30분
    // 이전 식사가 없으면 null
    expect(timeSincePreviousMeal(meal('2026-08-21T07:00:00'), meals)).toBeNull()
  })

  it('completeness: 0/false/unknown은 응답으로, null/undefined는 미응답으로 센다', () => {
    const m = meal('2026-08-21T12:00:00', {
      prePhysicalHunger: 0, preCraving: 'unknown', preBingeUrge: null,
      amount: 'normal', proteinIncluded: false, sweetsIncluded: 'unknown',
    })
    expect(preCompleteness(m)).toEqual({ filled: 2, total: 3, complete: false })
    expect(postCompleteness(m)).toEqual({ filled: 3, total: 5, complete: false })
  })
})
