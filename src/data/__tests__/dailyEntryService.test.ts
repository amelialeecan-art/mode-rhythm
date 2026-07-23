import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import {
  saveDailyEntry,
  loadDailyEntry,
  emptyDraft,
  type DailyEntryDraft,
} from '../services/dailyEntryService'
import {
  dailyLogRepository,
  eventLogRepository,
  cycleLogRepository,
  recoveryLogRepository,
} from '../repositories'

const DATE = '2026-06-21'

function draftWith(partial: Partial<DailyEntryDraft>): DailyEntryDraft {
  return { ...emptyDraft(DATE), ...partial }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('saveDailyEntry', () => {
  it('dailyLog을 upsert하고, 재저장해도 중복되지 않는다', async () => {
    await saveDailyEntry(draftWith({ stateCodes: ['anxious'], overallIntensity: 'much', memo: '첫 기록' }))
    await saveDailyEntry(draftWith({ stateCodes: ['calm'], overallIntensity: 'some', memo: '다시 기록' }))

    const log = await dailyLogRepository.getByDate(DATE)
    expect(log).toBeDefined()
    expect(log?.memo).toBe('다시 기록')
    const range = await dailyLogRepository.listByDateRange('2026-06-01', '2026-06-30')
    expect(range).toHaveLength(1) // 중복 없음
  })

  it('몸 에너지·머릿속 여유·생활 맥락·몸 신호·예외를 저장하고 복원한다', async () => {
    await saveDailyEntry(draftWith({
      stateCodes: ['calm'],
      bodyEnergyLevel: 'empty',
      mentalSpaceLevel: 'overloaded',
      dayContext: 'office',
      bodySignalCodes: ['head_eye_fatigue', 'neck_shoulder_tension'],
      rhythmExceptionCodes: ['illness'],
    }))

    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.bodyEnergyLevel).toBe('empty')
    expect(log?.mentalSpaceLevel).toBe('overloaded')
    expect(log?.dayContext).toBe('office')
    expect(log?.bodySignalCodes).toEqual(['head_eye_fatigue', 'neck_shoulder_tension'])
    expect(log?.rhythmExceptionCodes).toEqual(['illness'])
    // 직접 입력이 상태 preset보다 우선한다.
    expect(log?.energy).toBe(1)
    expect(log?.focus).toBe(1)

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.bodyEnergyLevel).toBe('empty')
    expect(loaded?.mentalSpaceLevel).toBe('overloaded')
    expect(loaded?.dayContext).toBe('office')
    expect(loaded?.bodySignalCodes).toEqual(['head_eye_fatigue', 'neck_shoulder_tension'])
    expect(loaded?.rhythmExceptionCodes).toEqual(['illness'])
  })

  it('상태 preset이 숫자 필드로 매핑되고 0~10을 넘지 않는다', async () => {
    await saveDailyEntry(draftWith({ stateCodes: ['anxious'], overallIntensity: 'veryMuch' }))
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log!.anxiety).toBeGreaterThan(0)
    expect(log!.anxiety).toBeLessThanOrEqual(10)
    // capacity 필드(calm)는 강도 배수로 부풀지 않는다
    expect(log!.calm).toBeLessThanOrEqual(10)
  })

  it('eventLogs는 같은 날짜 재저장 시 replace된다(중복 없음)', async () => {
    await saveDailyEntry(draftWith({ catalogEventCodes: ['sleep_short', 'weighed'] }))
    let events = await eventLogRepository.listByDate(DATE)
    expect(events).toHaveLength(2)

    await saveDailyEntry(draftWith({ catalogEventCodes: ['sleep_short'] }))
    events = await eventLogRepository.listByDate(DATE)
    expect(events).toHaveLength(1)
    expect(events[0].eventCode).toBe('sleep_short')
  })

  it('recoveryLogs도 같은 날짜 재저장 시 replace된다', async () => {
    await saveDailyEntry(draftWith({ recoveryCodes: ['walk', 'shower'], recoveryEffect: 'little_better' }))
    let rec = await recoveryLogRepository.listByDate(DATE)
    expect(rec).toHaveLength(2)
    expect(rec[0].effect).toBe('little_better')

    await saveDailyEntry(draftWith({ recoveryCodes: ['walk'], recoveryEffect: 'much_better' }))
    rec = await recoveryLogRepository.listByDate(DATE)
    expect(rec).toHaveLength(1)
  })

  it("'없었음'/'아직 모름' 회복 sentinel은 저장하지 않는다", async () => {
    await saveDailyEntry(draftWith({ recoveryCodes: ['none', 'not_yet'] }))
    const rec = await recoveryLogRepository.listByDate(DATE)
    expect(rec).toHaveLength(0)
  })

  it('cycleLogs는 입력이 있을 때만 저장된다', async () => {
    await saveDailyEntry(draftWith({})) // 생리 입력 없음
    expect(await cycleLogRepository.listByDate(DATE)).toHaveLength(0)

    await saveDailyEntry(draftWith({ cycle: { periodStart: true, periodEnd: false, periodPain: 5, symptoms: [] } }))
    const cycles = await cycleLogRepository.listByDate(DATE)
    expect(cycles).toHaveLength(1)
    expect(cycles[0].periodStart).toBe(true)
    expect(cycles[0].periodPain).toBe(5)
  })

  it('생리/주기가 eventLogs에 들어가지 않는다', async () => {
    await saveDailyEntry(
      draftWith({
        catalogEventCodes: ['sleep_short'],
        cycle: { periodStart: true, periodEnd: false, flowLevel: 'normal', symptoms: [] },
      }),
    )
    const events = await eventLogRepository.listByDate(DATE)
    expect(events.every((e) => e.category !== 'custom' || !e.mappedFactorGroup.includes('cycle'))).toBe(true)
    expect(events.some((e) => e.mappedFactorGroup.includes('cycle') || e.mappedFactorGroup.includes('period'))).toBe(false)
    // 생리 사실은 cycleLogs에만
    expect(await cycleLogRepository.listByDate(DATE)).toHaveLength(1)
  })

  it('custom event는 isCustom true와 mappedFactorGroup을 가진다', async () => {
    await saveDailyEntry(
      draftWith({
        customEvents: [
          {
            eventCode: 'custom_abc',
            eventLabel: '체중계 올라감',
            category: 'appearance',
            timing: 'today',
            intensity: 5,
            isCustom: true,
            customLabel: '체중계 올라감',
            mappedFactorGroup: 'custom_appearance_체중계_올라감',
          },
        ],
      }),
    )
    const events = await eventLogRepository.listByDate(DATE)
    const custom = events.find((e) => e.isCustom)
    expect(custom).toBeDefined()
    expect(custom?.isCustom).toBe(true)
    expect(custom?.mappedFactorGroup).toContain('custom_appearance')
  })
})

describe('loadDailyEntry', () => {
  it('기록이 없으면 null을 반환한다', async () => {
    expect(await loadDailyEntry('2026-01-01')).toBeNull()
  })

  it('저장값을 다시 불러온다 (events/cycle/recovery/memo)', async () => {
    await saveDailyEntry(
      draftWith({
        stateCodes: ['sad'],
        catalogEventCodes: ['sleep_short', 'weighed'],
        recoveryCodes: ['walk'],
        recoveryEffect: 'much_better',
        cycle: { periodStart: true, periodEnd: false, flowLevel: 'normal', periodPain: 4, symptoms: ['허리 묵직함'] },
        memo: '복원 테스트',
      }),
    )

    const loaded = await loadDailyEntry(DATE)
    expect(loaded).not.toBeNull()
    expect(loaded!.catalogEventCodes.sort()).toEqual(['sleep_short', 'weighed'])
    expect(loaded!.recoveryCodes).toEqual(['walk'])
    expect(loaded!.recoveryEffect).toBe('much_better')
    expect(loaded!.cycle.periodStart).toBe(true)
    expect(loaded!.cycle.symptoms).toEqual(['허리 묵직함'])
    expect(loaded!.memo).toBe('복원 테스트')
  })
})
