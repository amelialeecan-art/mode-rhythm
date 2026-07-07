import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getAnalysisViewModel } from '../services/patternAnalysisService'
import { getCalendarDayDetail } from '../services/calendarService'
import { dailyLogRepository, recoveryLogRepository, dailyScoreRepository } from '../repositories'
import { STATE_CHIPS } from '../catalog/modes'
import { calcRhythmLoad } from '../../engine'
import { DB_VERSION } from '../schema'

const D = '2026-06-21'
const draft = (p: Partial<DailyEntryDraft>): DailyEntryDraft => ({ ...emptyDraft(D), ...p })

beforeEach(async () => {
  await resetDatabase()
})

describe('상태칩 개편 (결과값만)', () => {
  it('새 칩(짜증/화냄/무기력/집중 안 됨/울컥)이 dailyLog 필드로 매핑된다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['annoyed', 'lethargic', 'unfocused'], overallIntensity: 'some' }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.irritability).toBeGreaterThan(0) // 짜증
    expect(log!.energy).toBeLessThanOrEqual(3) // 무기력/집중 안 됨
    expect(log!.fatigue).toBeGreaterThan(0) // 무기력
  })

  it('화냄은 짜증보다 irritability가 높고 impulsivity가 붙는다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['angry'] }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.irritability).toBeGreaterThanOrEqual(8)
    expect(log!.impulsivity).toBeGreaterThan(0)
  })

  it('식욕 변동 칩은 UI에서 제거됐지만 legacy stateCode는 계속 계산된다', async () => {
    expect(STATE_CHIPS.some((s) => s.code === 'appetite_swing')).toBe(false)
    // 옛 기록의 stateCodes에 남아 있어도 preset이 유지되어 재저장 시 값이 보존됨
    await saveDailyEntry(draft({ stateCodes: ['appetite_swing'] }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.appetite).toBeGreaterThan(0)
    // 캘린더 상세 라벨도 복원됨 (STATE_PRESETS 기준)
    const detail = await getCalendarDayDetail(D)
    expect(detail.stateLabels).toContain('식욕 변동')
  })
})

describe('식욕 상태 — 기름진 음식 욕구', () => {
  it('greasyCraving이 저장/복원된다 (점수 공식은 미포함)', async () => {
    await saveDailyEntry(draft({ appetiteRatings: { greasyCraving: 7, appetite: 5 } }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.greasyCraving).toBe(7)
    const reloaded = await loadDailyEntry(D)
    expect(reloaded!.appetiteRatings.greasyCraving).toBe(7)
  })
})

describe('사건 카탈로그 확장', () => {
  it('통제감/좌절 카테고리 사건이 저장되고 eventLoad에 반영된다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['anxious'], catalogEventCodes: ['plan_disrupted', 'upcoming_stress'], eventIntensity: 'much' }))
    const score = await dailyScoreRepository.getByDate(D)
    expect(score!.eventLoad).toBeGreaterThan(0)
  })

  it('새 사건 칩(기록이 부담됐음 포함)이 저장된다', async () => {
    await saveDailyEntry(draft({ catalogEventCodes: ['no_morning_light', 'ate_sweets', 'phone_in_bed', 'long_alone', 'messy_home', 'tracking_burden'] }))
    const reloaded = await loadDailyEntry(D)
    expect(reloaded!.catalogEventCodes).toHaveLength(6)
    expect(reloaded!.catalogEventCodes).toContain('tracking_burden')
  })
})

describe('회복 두 그룹 (도움/안 맞음)', () => {
  it('negative는 direction+effect worse로 저장되고 복원 시 분리된다', async () => {
    await saveDailyEntry(draft({ recoveryCodes: ['walk'], recoveryEffect: 'much_better', recoveryNegativeCodes: ['rumination', 'lying_down'] }))
    const logs = await recoveryLogRepository.listByDate(D)
    const neg = logs.filter((r) => r.direction === 'negative')
    expect(neg).toHaveLength(2)
    expect(neg.every((r) => r.effect === 'worse')).toBe(true)
    expect(logs.find((r) => r.actionCode === 'walk')!.direction).toBe('positive')

    const reloaded = await loadDailyEntry(D)
    expect(reloaded!.recoveryCodes).toEqual(['walk'])
    expect(reloaded!.recoveryNegativeCodes.sort()).toEqual(['lying_down', 'rumination'])
    expect(reloaded!.recoveryEffect).toBe('much_better') // positive 효과가 worse에 오염되지 않음
  })

  it('같은 칩이 양쪽에 있으면 negative가 중복 저장되지 않는다', async () => {
    await saveDailyEntry(draft({ recoveryCodes: ['walk'], recoveryNegativeCodes: ['walk'] }))
    const logs = await recoveryLogRepository.listByDate(D)
    expect(logs).toHaveLength(1)
    expect(logs[0].direction).toBe('negative') // 안전망: 겹치면 negative 우선
  })

  it('혼합일이 분석 VM에 태그된다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['sad'], recoveryCodes: ['walk'], recoveryEffect: 'little_better', recoveryNegativeCodes: ['rumination'] }))
    const vm = await getAnalysisViewModel({ endDate: D })
    expect(vm.mixedRecoveryDayCount).toBe(1)
  })
})

describe('사건 가중치 하향 (상태=결과 중심)', () => {
  it('rhythmLoad 가중치 합은 1 (전부 100이면 100)', () => {
    expect(calcRhythmLoad({ emotionalLoad: 100, appetiteLoad: 100, sleepLoad: 100, bodyLoad: 100, cycleLoad: 100, eventLoad: 100 })).toBe(100)
  })

  it('사건만 높은 날의 rhythmLoad 기여가 낮다 (8%)', () => {
    expect(calcRhythmLoad({ emotionalLoad: 0, appetiteLoad: 0, sleepLoad: 0, bodyLoad: 0, cycleLoad: 0, eventLoad: 100 })).toBe(8)
  })

  it('DB schema version은 그대로다', () => {
    expect(DB_VERSION).toBe(1)
  })
})
