import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getRhythmForecastViewModel } from '../services/rhythmForecastService'
import { patternInsightRepository, dailyScoreRepository } from '../repositories'
import { addDaysISO } from '../../engine'

const END = '2026-06-12'

function draft(date: string, partial: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...partial }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('getRhythmForecastViewModel', () => {
  it('내일 forecast + next3Days(3개)를 반환한다', async () => {
    for (let i = 0; i < 6; i++) {
      await saveDailyEntry(draft(addDaysISO('2026-06-05', i), { stateCodes: ['anxious'], overallIntensity: 'much' }))
    }
    const vm = await getRhythmForecastViewModel({ endDate: END })
    expect(vm.hasData).toBe(true)
    expect(vm.next3Days).toHaveLength(3)
    expect(vm.tomorrow).not.toBeNull()
    expect(vm.tomorrow!.dayOffset).toBe(1)
    expect(vm.tomorrow!.date).toBe(addDaysISO(END, 1))
    expect(vm.tomorrow!.label).toBeTruthy()
  })

  it('dailyScores가 부족하면 데이터 부족 note를 반환한다', async () => {
    await saveDailyEntry(draft('2026-06-12', { stateCodes: ['anxious'] }))
    const vm = await getRhythmForecastViewModel({ endDate: END })
    expect(vm.hasData).toBe(false)
    expect(vm.tomorrow).toBeNull()
    expect(vm.next3Days).toHaveLength(0)
    expect(vm.note).toContain('기록이 적')
  })

  it('forecast는 patternInsights나 dailyScores에 저장하지 않는다', async () => {
    for (let i = 0; i < 6; i++) {
      await saveDailyEntry(draft(addDaysISO('2026-06-05', i), { stateCodes: ['sad'] }))
    }
    const scoresBefore = await dailyScoreRepository.listByDateRange('1900-01-01', '2100-01-01')
    const insightsBefore = await patternInsightRepository.listRecent(500)

    await getRhythmForecastViewModel({ endDate: END })

    const scoresAfter = await dailyScoreRepository.listByDateRange('1900-01-01', '2100-01-01')
    const insightsAfter = await patternInsightRepository.listRecent(500)
    // 미래 날짜 점수가 새로 생기지 않음 + insight 변화 없음
    expect(scoresAfter.length).toBe(scoresBefore.length)
    expect(insightsAfter.length).toBe(insightsBefore.length)
    expect(scoresAfter.every((s) => s.date <= END)).toBe(true)
  })
})
