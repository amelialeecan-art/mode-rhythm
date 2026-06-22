import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getCalendarMonth, getCalendarDayDetail, shiftMonthISO } from '../services/calendarService'

const MONTH = '2026-06-10'

function draftWith(date: string, partial: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...partial }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('getCalendarMonth', () => {
  it('월 범위 dailyScores를 읽어 hasEntry로 표시한다', async () => {
    await saveDailyEntry(draftWith('2026-06-21', { stateCodes: ['anxious'], overallIntensity: 'much' }))

    const vm = await getCalendarMonth(MONTH)
    const day21 = vm.days.find((d) => d.date === '2026-06-21')
    const day20 = vm.days.find((d) => d.date === '2026-06-20')
    expect(day21?.hasEntry).toBe(true)
    expect(day20?.hasEntry).toBe(false)
  })

  it('dayType이 shortLabel로 변환되고 렌즈별 scores가 매핑된다', async () => {
    await saveDailyEntry(draftWith('2026-06-21', { stateCodes: ['anxious', 'sad'], overallIntensity: 'much' }))
    const vm = await getCalendarMonth(MONTH)
    const day = vm.days.find((d) => d.date === '2026-06-21')
    expect(day?.shortLabel).toBeTruthy()
    expect(day?.scores).toBeDefined()
    expect(day!.scores!.overall).toBeGreaterThanOrEqual(0)
    expect(day!.scores!.emotion).toBeGreaterThanOrEqual(0)
    expect(day!.scores!.recovery).toBe(0) // 회복 점수는 아직 0
  })

  it('grid는 7의 배수이고 현재월 표시가 있다', async () => {
    const vm = await getCalendarMonth(MONTH)
    expect(vm.days.length % 7).toBe(0)
    expect(vm.days.some((d) => d.isCurrentMonth)).toBe(true)
    expect(vm.monthLabel).toContain('6월')
  })
})

describe('getCalendarDayDetail', () => {
  it('저장 기록을 dailyLog/eventLogs/cycleLogs/recoveryLogs와 함께 반환한다', async () => {
    await saveDailyEntry(
      draftWith('2026-06-21', {
        stateCodes: ['sad'],
        catalogEventCodes: ['sleep_short'],
        recoveryCodes: ['walk'],
        recoveryEffect: 'much_better',
        cycle: { periodStart: true, periodEnd: false, flowLevel: 'normal', periodPain: 4, symptoms: ['허리 묵직함'] },
        memo: '상세 테스트',
      }),
    )
    const detail = await getCalendarDayDetail('2026-06-21')
    expect(detail.hasEntry).toBe(true)
    expect(detail.dailyScore).toBeDefined()
    expect(detail.dailyLog?.memo).toBe('상세 테스트')
    expect(detail.eventLogs).toHaveLength(1)
    expect(detail.cycleLogs).toHaveLength(1)
    expect(detail.recoveryLogs).toHaveLength(1)
  })

  it('기록 없는 날짜는 hasEntry false를 반환한다', async () => {
    const detail = await getCalendarDayDetail('2026-06-01')
    expect(detail.hasEntry).toBe(false)
    expect(detail.eventLogs).toHaveLength(0)
  })
})

describe('shiftMonthISO', () => {
  it('월을 이동한다(연 경계 포함)', () => {
    expect(shiftMonthISO('2026-06-15', -1)).toBe('2026-05-01')
    expect(shiftMonthISO('2026-12-15', 1)).toBe('2027-01-01')
  })
})
