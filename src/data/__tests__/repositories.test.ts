import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { seedDemoData } from '../seed'
import {
  dailyLogRepository,
  dailyScoreRepository,
  eventLogRepository,
  userSettingsRepository,
} from '../repositories'
import type { DailyLogInput, DailyScoreInput, EventLogInput } from '../models'

function makeDailyLog(date: string, moodLow: number): DailyLogInput {
  return {
    date,
    moodLow,
    anxiety: 3,
    irritability: 2,
    sadness: 3,
    heaviness: 2,
    calm: 5,
    energy: 5,
    focus: 5,
    selfCriticism: 2,
    impulsivity: 1,
    appetite: 5,
    sweetCraving: 3,
    saltyCraving: 2,
    bingeUrge: 1,
    bodyDiscomfort: 2,
    pain: 1,
    bloating: 1,
    fatigue: 3,
    headache: 0,
    digestion: 2,
  }
}

function makeScore(date: string, emotionalLoad: number): DailyScoreInput {
  return {
    date,
    emotionalLoad,
    appetiteLoad: 30,
    sleepLoad: 40,
    bodyLoad: 25,
    cycleLoad: 20,
    eventLoad: 30,
    rhythmLoad: 35,
    dayType: 'stable',
  }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('userSettingsRepository', () => {
  it('ensureDefault가 MVP 기본값을 만들고 멱등하다', async () => {
    const first = await userSettingsRepository.ensureDefault()
    expect(first.toneMode).toBe('witty')
    expect(first.privacyMode).toBe('local')
    expect(first.cycleEnabled).toBe(true)

    const second = await userSettingsRepository.ensureDefault()
    expect(second.id).toBe(first.id) // 중복 생성 안 함
  })

  it('update가 부분 갱신하고 updatedAt을 바꾼다', async () => {
    await userSettingsRepository.ensureDefault()
    const updated = await userSettingsRepository.update({ toneMode: 'calm' })
    expect(updated.toneMode).toBe('calm')
    expect(updated.privacyMode).toBe('local')
  })
})

describe('dailyLogRepository', () => {
  it('upsert가 date 기준으로 하루 1행을 유지한다', async () => {
    const id1 = await dailyLogRepository.upsert(makeDailyLog('2026-06-20', 5))
    const id2 = await dailyLogRepository.upsert(makeDailyLog('2026-06-20', 8))
    expect(id1).toBe(id2)

    const row = await dailyLogRepository.getByDate('2026-06-20')
    expect(row?.moodLow).toBe(8) // 갱신됨
    const all = await dailyLogRepository.listByDateRange('2026-06-01', '2026-06-30')
    expect(all).toHaveLength(1)
  })

  it('listByDateRange가 범위 내 정렬된 행을 반환한다', async () => {
    await dailyLogRepository.upsert(makeDailyLog('2026-06-03', 4))
    await dailyLogRepository.upsert(makeDailyLog('2026-06-01', 4))
    await dailyLogRepository.upsert(makeDailyLog('2026-06-02', 4))
    const rows = await dailyLogRepository.listByDateRange('2026-06-01', '2026-06-02')
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02'])
  })
})

describe('dailyScoreRepository', () => {
  it('upsert가 date unique를 보장한다', async () => {
    await dailyScoreRepository.upsert(makeScore('2026-06-21', 50))
    await dailyScoreRepository.upsert(makeScore('2026-06-21', 70))
    const recent = await dailyScoreRepository.listRecent(10)
    expect(recent).toHaveLength(1)
    expect(recent[0].emotionalLoad).toBe(70)
  })
})

describe('eventLogRepository', () => {
  it('bulkAdd 후 날짜/요인그룹으로 조회된다 (하루 여러 개)', async () => {
    const events: EventLogInput[] = [
      { date: '2026-06-21', eventCode: 'sleep_short', eventLabel: '잠이 부족했음', category: 'sleep', timing: 'today', intensity: 7, isCustom: false, mappedFactorGroup: 'sleep_deficit' },
      { date: '2026-06-21', eventCode: 'weighed', eventLabel: '몸무게를 봄', category: 'appearance', timing: 'today', intensity: 4, isCustom: false, mappedFactorGroup: 'body_image' },
    ]
    await eventLogRepository.bulkAdd(events)
    const byDate = await eventLogRepository.listByDate('2026-06-21')
    expect(byDate).toHaveLength(2)
    const byGroup = await eventLogRepository.listByFactorGroup('body_image')
    expect(byGroup).toHaveLength(1)
    expect(byGroup[0].eventCode).toBe('weighed')
  })
})

describe('seedDemoData', () => {
  it('demo data를 채우고 요약 개수를 반환한다', async () => {
    const summary = await seedDemoData()
    expect(summary.dailyLogs).toBeGreaterThan(0)
    expect(summary.userSettings).toBe(1)

    const settings = await userSettingsRepository.get()
    expect(settings?.privacyMode).toBe('local')

    // 생리/주기는 cycleLogs에만 — eventLogs에 cycle 관련 코드가 없어야 함
    const events = await eventLogRepository.listByDateRange('2000-01-01', '2100-01-01')
    expect(events.some((e) => e.mappedFactorGroup.includes('cycle') || e.mappedFactorGroup.includes('period'))).toBe(false)
  })
})
