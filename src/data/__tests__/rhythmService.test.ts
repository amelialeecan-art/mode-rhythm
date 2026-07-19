import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getRhythmViewModel, getCycleCompareViewModel } from '../services/rhythmService'
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

describe('getRhythmViewModel — 7일 집계(장기)', () => {
  it('week 집계: 결측일을 0으로 세지 않고 실제 기록만 평균', async () => {
    // 마지막 주(06-14~06-20)에 이틀만 기록(같은 상태 → 같은 점수)
    await saveDailyEntry(draft('2026-06-19', { stateCodes: ['anxious'], overallIntensity: 'much' }))
    await saveDailyEntry(draft('2026-06-20', { stateCodes: ['anxious'], overallIntensity: 'much' }))
    const vm = await getRhythmViewModel({ endDate: END, days: 14, bucket: 'week' })
    expect(vm.bucketMode).toBe('week')
    expect(vm.buckets).toHaveLength(2) // 14일 / 7
    const last = vm.buckets[1]
    const dayVal = vm.days.find((d) => d.date === '2026-06-20')!.emotional!
    // 7일 중 2일만 기록 → 평균이 2일 값과 같아야(=/7로 희석되지 않음)
    expect(last.emotional).toBe(dayVal)
    expect(last.hasData).toBe(true)
    // 기록 없는 이전 주 → undefined(선 끊김), hasData false
    expect(vm.buckets[0].emotional).toBeUndefined()
    expect(vm.buckets[0].hasData).toBe(false)
  })

  it('weekCompare: 최근 7일 vs 이전 28일, 표본 수 집계', async () => {
    // 최근 7일 안에 3일
    for (const d of ['2026-06-18', '2026-06-19', '2026-06-20']) {
      await saveDailyEntry(draft(d, { stateCodes: ['anxious'], overallIntensity: 'much' }))
    }
    // 이전 28일 안에 5일
    for (const d of ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07', '2026-06-09']) {
      await saveDailyEntry(draft(d, { stateCodes: ['anxious'], overallIntensity: 'much' }))
    }
    const vm = await getRhythmViewModel({ endDate: END, days: 90, bucket: 'week' })
    const c = vm.weekCompare.emotional
    expect(c.recentN).toBe(3)
    expect(c.prevN).toBe(5)
    expect(c.enough).toBe(true)
    expect(c.diff).toBe(0) // 같은 상태 → 최근/이전 평균 동일
  })

  it('표본 부족이면 enough false', async () => {
    await saveDailyEntry(draft('2026-06-20', { stateCodes: ['anxious'] }))
    const vm = await getRhythmViewModel({ endDate: END, days: 90, bucket: 'week' })
    expect(vm.weekCompare.emotional.enough).toBe(false)
  })
})

describe('getCycleCompareViewModel — 표본 부족 게이트', () => {
  it('생리 시작 기록이 3회 미만이면 eligible false + neededMore', async () => {
    await saveDailyEntry(
      draft('2026-05-01', { stateCodes: ['sad'], cycle: { periodStart: true, periodEnd: false, symptoms: [] } }),
    )
    await saveDailyEntry(
      draft('2026-05-29', { stateCodes: ['sad'], cycle: { periodStart: true, periodEnd: false, symptoms: [] } }),
    )
    const vm = await getCycleCompareViewModel({ endDate: END })
    expect(vm.cycleCount).toBe(2)
    expect(vm.eligible).toBe(false)
    expect(vm.neededMore).toBe(1)
  })
})
