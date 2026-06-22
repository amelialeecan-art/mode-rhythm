import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { recalculateDailyScore, getTodaySummary } from '../services/dailyScoreService'
import { dailyScoreRepository } from '../repositories'

const DATE = '2026-06-21'

function draftWith(partial: Partial<DailyEntryDraft>): DailyEntryDraft {
  return { ...emptyDraft(DATE), ...partial }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('recalculateDailyScore', () => {
  it('saveDailyEntry 후 dailyScores가 upsert된다', async () => {
    await saveDailyEntry(draftWith({ stateCodes: ['anxious'], overallIntensity: 'much' }))
    const score = await dailyScoreRepository.getByDate(DATE)
    expect(score).toBeDefined()
    expect(score!.emotionalLoad).toBeGreaterThan(0)
    expect(score!.dayType).toBeTruthy()
    expect(score!.confidence).toBeGreaterThanOrEqual(60)
  })

  it('같은 날짜 재저장 시 dailyScores가 중복되지 않는다', async () => {
    await saveDailyEntry(draftWith({ stateCodes: ['sad'] }))
    await saveDailyEntry(draftWith({ stateCodes: ['calm'] }))
    const all = await dailyScoreRepository.listByDateRange('2026-06-01', '2026-06-30')
    expect(all).toHaveLength(1)
  })

  it('기록이 없는 날짜는 null을 반환한다', async () => {
    expect(await recalculateDailyScore('2026-01-01')).toBeNull()
  })
})

describe('getTodaySummary', () => {
  it('기록 없음이면 null', async () => {
    expect(await getTodaySummary('2026-01-01')).toBeNull()
  })

  it('기록 있음이면 classification과 plan을 반환한다', async () => {
    await saveDailyEntry(
      draftWith({
        stateCodes: ['anxious', 'sad'],
        overallIntensity: 'much',
        catalogEventCodes: ['sleep_short'],
      }),
    )
    const summary = await getTodaySummary(DATE)
    expect(summary).not.toBeNull()
    expect(summary!.hasEntry).toBe(true)
    expect(summary!.classification.label).toBeTruthy()
    expect(summary!.classification.subLabel).toBeTruthy()
    expect(summary!.plan.schedule).toBeTruthy()
    expect(summary!.scores.rhythmLoad).toBeGreaterThanOrEqual(0)
    expect(summary!.factorCandidates.length).toBeGreaterThan(0)
  })
})
