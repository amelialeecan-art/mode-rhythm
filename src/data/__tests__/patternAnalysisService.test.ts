import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getAnalysisViewModel, recalculatePatternInsights } from '../services/patternAnalysisService'
import { patternInsightRepository } from '../repositories'
import { addDaysISO } from '../../engine'

const END = '2026-06-12'
const FORBIDDEN = ['원인입니다', '때문입니다', '범인', '확실합니다', '반드시']

function draft(date: string, partial: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...partial }
}

async function seedTwelveDays() {
  for (let i = 0; i < 12; i++) {
    const date = addDaysISO('2026-06-01', i)
    await saveDailyEntry(
      draft(date, {
        stateCodes: ['anxious', 'sad'],
        overallIntensity: 'much',
        catalogEventCodes: i % 2 === 0 ? ['sleep_short', 'reply_stress'] : [],
        recoveryCodes: ['walk'],
        recoveryEffect: 'little_better',
      }),
    )
  }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('getAnalysisViewModel', () => {
  it('factor/combo/unknown/recoveryFrequency 형태를 반환한다', async () => {
    await seedTwelveDays()
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.dayCount).toBe(12)
    expect(vm.hasEnoughData).toBe(true)
    expect(Array.isArray(vm.factorPatterns)).toBe(true)
    expect(Array.isArray(vm.combos)).toBe(true)
    expect(Array.isArray(vm.unexplained)).toBe(true)
    expect(vm.recoveryFrequency.find((r) => r.label === '산책')?.count).toBe(12)
  })

  it('기록이 부족하면 hasEnoughData false', async () => {
    await saveDailyEntry(draft('2026-06-10', { stateCodes: ['anxious'] }))
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.hasEnoughData).toBe(false)
  })
})

describe('recalculatePatternInsights', () => {
  it('patternInsights를 저장하고, 재계산 시 clear 후 재생성한다', async () => {
    await seedTwelveDays()
    await recalculatePatternInsights({ endDate: END })
    const first = await patternInsightRepository.listRecent(200)
    await recalculatePatternInsights({ endDate: END })
    const second = await patternInsightRepository.listRecent(200)
    expect(second.length).toBe(first.length) // 중복 누적 안 됨
  })

  it('단정 금지 문구가 message에 들어가지 않는다', async () => {
    await seedTwelveDays()
    await recalculatePatternInsights({ endDate: END })
    const all = await patternInsightRepository.listRecent(200)
    for (const insight of all) {
      for (const w of FORBIDDEN) expect(insight.message.includes(w)).toBe(false)
    }
  })
})
