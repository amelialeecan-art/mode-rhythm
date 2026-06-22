import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getRhythmViewModel } from '../services/rhythmService'
import { addDaysISO } from '../../engine'

const END = '2026-06-20'

function draft(date: string, partial: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...partial }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('getRhythmViewModel', () => {
  it('범위 길이만큼 days를 만들고 점수 있는 날만 hasScore', async () => {
    for (let i = 0; i < 8; i++) {
      await saveDailyEntry(draft(addDaysISO('2026-06-10', i), { stateCodes: ['anxious'], overallIntensity: 'much' }))
    }
    const vm = await getRhythmViewModel({ endDate: END, days: 14 })
    expect(vm.days).toHaveLength(14)
    expect(vm.dayCount).toBe(8)
    expect(vm.hasData).toBe(true)
    const scored = vm.days.filter((d) => d.hasScore)
    expect(scored.every((d) => d.emotional !== undefined)).toBe(true)
    // today(실제 오늘)는 범위 밖 → -1
    expect(vm.todayIndex).toBe(-1)
  })

  it('생리 기록이 있으면 주기 구간 오버레이가 계산된다', async () => {
    await saveDailyEntry(draft('2026-06-15', { stateCodes: ['sad'], cycle: { periodStart: true, periodEnd: false, symptoms: [] } }))
    for (let i = 16; i <= 18; i++) {
      await saveDailyEntry(draft(`2026-06-${i}`, { stateCodes: ['anxious'] }))
    }
    const vm = await getRhythmViewModel({ endDate: END, days: 14 })
    expect(vm.days.some((d) => d.cyclePhase === 'period')).toBe(true)
  })

  it('기록이 부족하면 hasData false', async () => {
    await saveDailyEntry(draft('2026-06-19', { stateCodes: ['anxious'] }))
    const vm = await getRhythmViewModel({ endDate: END, days: 14 })
    expect(vm.hasData).toBe(false)
  })
})
