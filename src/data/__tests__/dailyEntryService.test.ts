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
import { BODY_SIGNAL_OPTIONS } from '../catalog/dailyCheckIn'
import { EVENT_CATALOG, EVENT_CATEGORY_LABEL, RECOVERY_DUP_EVENT_CODES } from '../catalog/events'
import { LAST_NIGHT_SLEEP_CODES } from '../catalog/lastNightSleep'

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

/* =====================================================================
   step1 · 감정/집중/사회 여유 입력 구조 (분석 엔진·공식은 그대로)
   ===================================================================== */
describe('step1 감정·집중·사회 여유 입력', () => {
  // (1) 대체로 안정 + 짜증 + 잠깐 영향 → 저장·복원
  it('대체로 안정적 + 짜증 + 잠깐 영향을 저장하고 복원한다', async () => {
    await saveDailyEntry(
      draftWith({
        emotionalStabilityLevel: 'mostly_stable',
        emotionCodes: ['irritated'],
        emotionImpactLevel: 'brief',
      }),
    )
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(log?.emotionCodes).toEqual(['irritated'])
    expect(log?.emotionImpactLevel).toBe('brief')
    // 안정감(calm)과 짜증(irritability)이 함께 숫자로 남는다 → "안정적이지만 잠깐 짜증".
    expect(log?.calm).toBe(6) // mostly_stable
    expect(log?.irritability).toBe(6) // 7 * 0.85(brief) ≈ 6

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(loaded?.emotionCodes).toEqual(['irritated'])
    expect(loaded?.emotionImpactLevel).toBe('brief')
  })

  // (2) 하루 대부분 흔들림 + 예민·짜증 + 하루 대부분 영향
  it('하루 대부분 흔들림 + 예민·짜증 + 하루 대부분 영향을 저장·복원한다', async () => {
    await saveDailyEntry(
      draftWith({
        emotionalStabilityLevel: 'mostly_shaken',
        emotionCodes: ['sensitive', 'irritated'],
        emotionImpactLevel: 'most_day',
      }),
    )
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.emotionalStabilityLevel).toBe('mostly_shaken')
    expect(log?.emotionCodes).toEqual(['sensitive', 'irritated'])
    expect(log?.emotionImpactLevel).toBe('most_day')
    expect(log?.moodLow).toBe(10) // 8 * 1.3, clamp10
    expect(log?.irritability).toBe(9) // max(6,7)=7 * 1.3 ≈ 9
    expect(log?.calm).toBe(0)

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.emotionalStabilityLevel).toBe('mostly_shaken')
    expect(loaded?.emotionCodes).toEqual(['sensitive', 'irritated'])
    expect(loaded?.emotionImpactLevel).toBe('most_day')
  })

  // (3) 대체로 안정 + 가라앉음 (영향 미선택) — 안정과 감정이 배타적이지 않다
  it('대체로 안정 + 가라앉음을 함께 남길 수 있다', async () => {
    await saveDailyEntry(
      draftWith({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['down'] }),
    )
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.calm).toBe(6) // 안정감 유지
    expect(log?.sadness).toBe(7) // down
    expect(log?.heaviness).toBe(6)
    expect(log?.emotionImpactLevel).toBeUndefined() // 영향 미선택

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(loaded?.emotionCodes).toEqual(['down'])
    expect(loaded?.emotionImpactLevel).toBeUndefined()
  })

  // (4) 매우 안정적이고 별도 감정 없음
  it('매우 안정적이고 별도 감정이 없는 날을 남긴다', async () => {
    await saveDailyEntry(draftWith({ emotionalStabilityLevel: 'very_stable', emotionCodes: [] }))
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.emotionalStabilityLevel).toBe('very_stable')
    expect(log?.emotionCodes).toBeUndefined() // 감정 없으면 저장 안 함
    expect(log?.emotionImpactLevel).toBeUndefined()
    expect(log?.calm).toBe(8)
    expect(log?.irritability ?? 0).toBe(0)

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.emotionalStabilityLevel).toBe('very_stable')
    expect(loaded?.emotionCodes).toEqual([])
    expect(loaded?.emotionImpactLevel).toBeUndefined()
  })

  // (5) 집중 가능 정도 + 사람을 대할 여유 저장·복원
  it('집중 가능 정도와 사람을 대할 여유를 저장하고 복원한다', async () => {
    await saveDailyEntry(
      draftWith({ focusLevel: 'often_scattered', socialCapacityLevel: 'low' }),
    )
    const log = await dailyLogRepository.getByDate(DATE)
    expect(log?.focusLevel).toBe('often_scattered')
    expect(log?.socialCapacityLevel).toBe('low')
    expect(log?.focus).toBe(3) // often_scattered → 3, 머릿속 여유보다 우선

    const loaded = await loadDailyEntry(DATE)
    expect(loaded?.focusLevel).toBe('often_scattered')
    expect(loaded?.socialCapacityLevel).toBe('low')
  })

  // (6) 생리통·몸살·운동·산책·씻음 중복이 새 입력 목록에 없다
  it('생리통·몸살은 몸 신호에, 운동·산책·씻음은 사건 목록에 노출되지 않는다', () => {
    const signalCodes = BODY_SIGNAL_OPTIONS.map((o) => o.code)
    expect(signalCodes).not.toContain('period_cramps')
    expect(signalCodes).not.toContain('malaise')

    // 새 UI가 보여주는 사건 목록 = 지난밤 수면·회복중복 코드를 제외한 EVENT_CATALOG.
    const shownEventCodes = EVENT_CATALOG.map((e) => e.code).filter(
      (c) => !LAST_NIGHT_SLEEP_CODES.has(c) && !RECOVERY_DUP_EVENT_CODES.has(c),
    )
    expect(shownEventCodes).not.toContain('exercised')
    expect(shownEventCodes).not.toContain('walked')
    expect(shownEventCodes).not.toContain('washed')
  })

  // (7) 혈당/CGM 입력이 없다
  it('혈당/CGM 관련 입력 항목이 없다', () => {
    const bloodSugar = /혈당|blood|glucose|cgm/i
    expect(EVENT_CATALOG.some((e) => bloodSugar.test(e.code) || bloodSugar.test(e.label))).toBe(false)
    expect(BODY_SIGNAL_OPTIONS.some((o) => bloodSugar.test(o.code) || bloodSugar.test(o.label))).toBe(false)
    expect(Object.values(EVENT_CATEGORY_LABEL).some((l) => bloodSugar.test(l))).toBe(false)
    const draftKeys = Object.keys(emptyDraft(DATE))
    expect(draftKeys.some((k) => bloodSugar.test(k))).toBe(false)
  })

  // (8) 옛 기록(상태 칩만 있음) 읽기·재저장 호환 — 매핑 가능한 값만 복원, 데이터 보존
  it('옛 상태 칩 기록을 안전하게 복원하고 재저장해도 데이터가 사라지지 않는다', async () => {
    // 새 감정 필드 없이 상태 칩만 있는 옛 기록을 흉내낸다.
    await saveDailyEntry(
      draftWith({ stateCodes: ['calm', 'annoyed', 'unfocused', 'social_fatigue'], memo: '옛 기록' }),
    )
    const legacyLog = await dailyLogRepository.getByDate(DATE)
    expect(legacyLog?.emotionalStabilityLevel).toBeUndefined() // 저장 당시엔 새 필드 없음

    const loaded = await loadDailyEntry(DATE)
    expect(loaded).not.toBeNull()
    // 매핑 가능한 값만 안전 복원 (calm→안정, annoyed→짜증, unfocused→집중, social_fatigue→사회 여유)
    expect(loaded!.emotionalStabilityLevel).toBe('mostly_stable')
    expect(loaded!.emotionCodes).toEqual(['irritated'])
    expect(loaded!.focusLevel).toBe('often_scattered')
    expect(loaded!.socialCapacityLevel).toBe('low')
    expect(loaded!.stateCodes).toEqual(['calm', 'annoyed', 'unfocused', 'social_fatigue']) // 원본 보존

    // 재저장해도 원본 상태 칩과 메모가 보존되고, 새 감정 필드도 함께 남는다.
    await saveDailyEntry(loaded!)
    const resaved = await dailyLogRepository.getByDate(DATE)
    expect(resaved?.stateCodes).toEqual(['calm', 'annoyed', 'unfocused', 'social_fatigue'])
    expect(resaved?.memo).toBe('옛 기록')
    expect(resaved?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(resaved?.emotionCodes).toEqual(['irritated'])
    const range = await dailyLogRepository.listByDateRange('2026-06-01', '2026-06-30')
    expect(range).toHaveLength(1) // 재저장이 행을 늘리지 않는다
  })
})
