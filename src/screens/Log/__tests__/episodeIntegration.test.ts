/* =====================================================================
   MODE · Sleep/Meal 에피소드 저장·수정·V1 비충돌 통합 테스트
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../../../data/reset'
import { db } from '../../../data/db'
import {
  dailyLogRepository,
  eventLogRepository,
  mealEpisodeRepository,
  sleepEpisodeRepository,
} from '../../../data/repositories'
import { resolveDailySleep } from '../../../data/services/sleepResolveService'
import { computeMealIntervals } from '../../../engine'
import { V2ValidationError } from '../../../data/v2Validation'
import type { DailyLogInput, EventLogInput } from '../../../data/models'

beforeEach(async () => {
  await resetDatabase()
})

describe('SleepEpisode', () => {
  it('자정 넘는 수면을 저장하고 파생 수면시간을 계산한다', async () => {
    await sleepEpisodeRepository.upsertByDate({
      localDate: '2026-08-21',
      wentToBedAt: '2026-08-20T23:00:00.000Z',
      sleepOnsetAt: '2026-08-20T23:30:00.000Z',
      wakeAt: '2026-08-21T07:00:00.000Z',
      awakenings: 1,
      satisfaction: 6,
      source: 'manual',
      schemaVersion: 1,
    })
    const resolved = await resolveDailySleep('2026-08-21')
    expect(resolved.source).toBe('v2')
    expect(resolved.durationMinutes).toBe(450) // 7h30m
  })

  it('시각 순서가 잘못되면(잠듦<취침) 저장을 거부한다', async () => {
    await expect(
      sleepEpisodeRepository.add({
        localDate: '2026-08-21',
        wentToBedAt: '2026-08-21T00:00:00.000Z',
        sleepOnsetAt: '2026-08-20T23:00:00.000Z',
        source: 'manual',
        schemaVersion: 1,
      }),
    ).rejects.toBeInstanceOf(V2ValidationError)
    expect(await db.sleepEpisodes.count()).toBe(0)
  })

  it('awakenings null / satisfaction unknown이 0·false로 바뀌지 않는다', async () => {
    await sleepEpisodeRepository.upsertByDate({
      localDate: '2026-08-21',
      sleepOnsetAt: '2026-08-20T23:30:00.000Z',
      wakeAt: '2026-08-21T07:00:00.000Z',
      awakenings: null,
      satisfaction: 'unknown',
      source: 'manual',
      schemaVersion: 1,
    })
    const ep = await sleepEpisodeRepository.getByDate('2026-08-21')
    expect(ep!.awakenings).toBeNull()
    expect(ep!.satisfaction).toBe('unknown')
  })
})

describe('MealEpisode — 빠른 저장 후 식사 후 필드 추가', () => {
  it('시작만 저장한 뒤 patch로 식사 후 필드를 추가한다(기존 pre 보존)', async () => {
    const id = await mealEpisodeRepository.add({
      localDate: '2026-08-21',
      startedAt: '2026-08-21T13:05:00.000Z',
      prePhysicalHunger: 7,
      preCraving: 3,
      preBingeUrge: 1,
      source: 'manual',
      schemaVersion: 1,
    })
    // 나중에 식사 후 필드 추가
    await mealEpisodeRepository.patch(id, {
      endedAt: '2026-08-21T13:30:00.000Z',
      amount: 'normal',
      proteinIncluded: true,
      sweetsIncluded: false,
      perceivedOvereating: 'unknown',
    })
    const m = await mealEpisodeRepository.getById(id)
    // pre는 그대로
    expect(m!.prePhysicalHunger).toBe(7)
    expect(m!.preCraving).toBe(3)
    // post가 추가됨
    expect(m!.amount).toBe('normal')
    expect(m!.proteinIncluded).toBe(true)
    expect(m!.sweetsIncluded).toBe(false)
    expect(m!.perceivedOvereating).toBe('unknown')
  })

  it('preHunger=0이 실제 0으로 유지된다', async () => {
    const id = await mealEpisodeRepository.add({
      localDate: '2026-08-21', startedAt: '2026-08-21T15:00:00.000Z',
      prePhysicalHunger: 0, source: 'manual', schemaVersion: 1,
    })
    const m = await mealEpisodeRepository.getById(id)
    expect(m!.prePhysicalHunger).toBe(0)
    expect(typeof m!.prePhysicalHunger).toBe('number')
  })

  it('미입력 null은 false/0으로 바뀌지 않고, unknown은 유지된다', async () => {
    const id = await mealEpisodeRepository.add({
      localDate: '2026-08-21', startedAt: '2026-08-21T15:00:00.000Z',
      preCraving: null, source: 'manual', schemaVersion: 1,
    })
    await mealEpisodeRepository.patch(id, { proteinIncluded: null, sweetsIncluded: 'unknown' })
    const m = await mealEpisodeRepository.getById(id)
    expect(m!.preCraving).toBeNull()
    expect(m!.proteinIncluded).toBeNull()
    expect(m!.proteinIncluded).not.toBe(false)
    expect(m!.sweetsIncluded).toBe('unknown')
  })

  it('종료<시작이면 patch를 거부한다', async () => {
    const id = await mealEpisodeRepository.add({
      localDate: '2026-08-21', startedAt: '2026-08-21T13:00:00.000Z', source: 'manual', schemaVersion: 1,
    })
    await expect(
      mealEpisodeRepository.patch(id, { endedAt: '2026-08-21T12:00:00.000Z' }),
    ).rejects.toBeInstanceOf(V2ValidationError)
  })

  it('하루 여러 식사를 저장하고 각 timestamp가 독립적이며 간격이 계산된다', async () => {
    await mealEpisodeRepository.add({ localDate: '2026-08-21', startedAt: '2026-08-21T08:00:00.000Z', source: 'manual', schemaVersion: 1 })
    await mealEpisodeRepository.add({ localDate: '2026-08-21', startedAt: '2026-08-21T12:30:00.000Z', source: 'manual', schemaVersion: 1 })
    await mealEpisodeRepository.add({ localDate: '2026-08-21', startedAt: '2026-08-21T19:00:00.000Z', source: 'manual', schemaVersion: 1 })
    const meals = await mealEpisodeRepository.listByDate('2026-08-21')
    expect(meals).toHaveLength(3)
    // 각 startedAt 독립
    expect(meals.map((m) => m.startedAt)).toEqual([
      '2026-08-21T08:00:00.000Z', '2026-08-21T12:30:00.000Z', '2026-08-21T19:00:00.000Z',
    ])
    // 간격: null, 270분, 390분
    expect(computeMealIntervals(meals)).toEqual([null, 270, 390])
  })

  it('craving과 sweetsIncluded는 서로 다른 시점의 별개 값으로 남는다', async () => {
    // 14:00 craving=8, 15:00 단 음식=true → 같은 상태로 합치지 않는다
    const cravingMeal = await mealEpisodeRepository.add({
      localDate: '2026-08-21', startedAt: '2026-08-21T14:00:00.000Z', preCraving: 8, source: 'manual', schemaVersion: 1,
    })
    const sweetMeal = await mealEpisodeRepository.add({
      localDate: '2026-08-21', startedAt: '2026-08-21T15:00:00.000Z', source: 'manual', schemaVersion: 1,
    })
    await mealEpisodeRepository.patch(sweetMeal, { sweetsIncluded: true })
    const a = await mealEpisodeRepository.getById(cravingMeal)
    const b = await mealEpisodeRepository.getById(sweetMeal)
    expect(a!.preCraving).toBe(8)
    expect(a!.sweetsIncluded).toBeUndefined()
    expect(b!.preCraving).toBeUndefined()
    expect(b!.sweetsIncluded).toBe(true)
  })
})

describe('V1 lastNightSleep / legacy와 충돌하지 않는다', () => {
  it('V2 수면 저장이 legacy dailyLog·eventLog를 건드리지 않는다', async () => {
    const daily: DailyLogInput = {
      date: '2026-08-21', moodLow: 5, anxiety: 4, irritability: 3, sadness: 3, heaviness: 2, calm: 5,
      energy: 6, focus: 6, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
      bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
    }
    const sleepEvent: EventLogInput = {
      date: '2026-08-21', eventCode: 'late_sleep', eventLabel: '늦게 잠', category: 'sleep',
      timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'sleep',
    }
    await dailyLogRepository.upsert(daily)
    await eventLogRepository.add(sleepEvent)

    await sleepEpisodeRepository.upsertByDate({
      localDate: '2026-08-21', sleepOnsetAt: '2026-08-20T23:30:00.000Z', wakeAt: '2026-08-21T07:00:00.000Z',
      source: 'manual', schemaVersion: 1,
    })

    // legacy 그대로
    expect(await db.dailyLogs.count()).toBe(1)
    expect(await db.eventLogs.count()).toBe(1)
    expect((await dailyLogRepository.getByDate('2026-08-21'))!.energy).toBe(6)
    // V2는 별도
    expect(await db.sleepEpisodes.count()).toBe(1)
  })

  it('V2 수면이 없으면 resolveDailySleep은 legacy로 표시한다', async () => {
    const resolved = await resolveDailySleep('2026-08-21')
    expect(resolved.source).toBe('legacy')
    expect(resolved.durationMinutes).toBeNull()
  })
})
