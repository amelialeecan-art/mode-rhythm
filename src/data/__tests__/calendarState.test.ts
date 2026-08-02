import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getCalendarDayDetail } from '../services/calendarService'

const D = '2026-06-21'
const draft = (p: Partial<DailyEntryDraft>): DailyEntryDraft => ({ ...emptyDraft(D), ...p })

beforeEach(async () => {
  await resetDatabase()
})

describe('Calendar 상태 라벨 (update1)', () => {
  // (1) 새 직접 입력 필드가 있으면 "저장된 상태 기록이 없어요"가 나오지 않는다
  it('새 직접 입력만 있어도 상태 라벨이 표시된다', async () => {
    await saveDailyEntry(draft({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['irritated'], emotionImpactLevel: 'brief', bodyEnergyLevel: 'empty', focusLevel: 'well' }))
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true)
    expect(detail.stateLabels.length).toBeGreaterThan(0)
    expect(detail.stateLabels.some((l) => l.includes('짜증'))).toBe(true)
    expect(detail.stateLabels).toContain('몸이 쉽게 지쳤어요')
    expect(detail.stateLabels).toContain('집중이 잘 됐어요')
  })

  // 각 직접 입력 도메인이 사람말로 표시된다
  it('몸 에너지·머릿속·집중·사회 여유·생활기능이 사람말로 표시된다', async () => {
    await saveDailyEntry(draft({ bodyEnergyLevel: 'empty', mentalSpaceLevel: 'overloaded', focusLevel: 'rarely', socialCapacityLevel: 'low', functionLevel: 4 }))
    const { stateLabels } = await getCalendarDayDetail(D)
    expect(stateLabels).toContain('몸이 쉽게 지쳤어요')
    expect(stateLabels).toContain('머리가 복잡했어요')
    expect(stateLabels).toContain('집중하기 어려웠어요')
    expect(stateLabels).toContain('사람을 대하기 버거웠어요')
    expect(stateLabels).toContain('평소 하던 일이 버거웠어요')
    // 개발자식 필드명은 노출하지 않는다
    const joined = stateLabels.join(' ')
    for (const t of ['몸 에너지', '생활기능', '감정 부담', '사회적 여유', 'focus', 'metric']) expect(joined).not.toContain(t)
  })

  // (2) 옛 stateCodes만 있어도 상태가 표시된다
  it('옛 stateCodes 기록도 상태가 표시된다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['sad', 'drained'] }))
    const { stateLabels } = await getCalendarDayDetail(D)
    expect(stateLabels.length).toBeGreaterThan(0)
    expect(stateLabels.some((l) => l.includes('가라앉'))).toBe(true)
  })

  // (3) 상태 없이 사건만 → 전체 기록 없음이 아니다(상태 라벨만 비고 hasEntry는 true)
  it('사건만 있는 날은 전체 기록 없음이 아니다', async () => {
    await saveDailyEntry(draft({ catalogEventCodes: ['work_heavy'] }))
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true)
    expect(detail.stateLabels).toEqual([]) // 화면은 "상태 선택 없이 다른 기록만" 표시
    expect(detail.eventLogs.length).toBeGreaterThan(0)
  })

  // (4) 상태 없이 몸 신호만
  it('몸 신호만 있는 날은 전체 기록 없음이 아니다', async () => {
    await saveDailyEntry(draft({ bodySignalCodes: ['head_eye_fatigue'] }))
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true)
    expect(detail.stateLabels).toEqual([])
    expect(detail.dailyLog?.bodySignalCodes).toContain('head_eye_fatigue')
  })

  // (5) 상태 없이 회복 행동만
  it('회복 행동만 있는 날은 전체 기록 없음이 아니다', async () => {
    await saveDailyEntry(draft({ recoveryCodes: ['walk'], recoveryEffect: 'much_better' }))
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true)
    expect(detail.stateLabels).toEqual([])
    expect(detail.recoveryLogs.length).toBeGreaterThan(0)
  })

  // (6) 완전히 빈 날짜만 빈 날짜
  it('아무 기록도 없는 날짜만 빈 날짜다', async () => {
    const detail = await getCalendarDayDetail('2026-01-01')
    expect(detail.hasEntry).toBe(false)
    expect(detail.stateLabels).toEqual([])
  })

  // (7) 미입력 항목을 정상으로 표시하지 않는다
  it('입력하지 않은 항목을 정상으로 채우지 않는다', async () => {
    await saveDailyEntry(draft({ bodyEnergyLevel: 'empty' })) // 몸 에너지만 입력
    const { stateLabels } = await getCalendarDayDetail(D)
    expect(stateLabels).toEqual(['몸이 쉽게 지쳤어요'])
  })

  // (9) 기록을 열고 재저장해도 데이터 손실 없음
  it('상태 라벨 계산이 기록을 바꾸지 않는다(재저장 보존)', async () => {
    await saveDailyEntry(draft({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['down'], bodyEnergyLevel: 'empty', catalogEventCodes: ['work_heavy'], memo: '유지' }))
    const before = await getCalendarDayDetail(D)
    expect(before.stateLabels.length).toBeGreaterThan(0)
    // 다시 저장(수정 없음)
    await saveDailyEntry(draft({ emotionalStabilityLevel: 'mostly_stable', emotionCodes: ['down'], bodyEnergyLevel: 'empty', catalogEventCodes: ['work_heavy'], memo: '유지' }))
    const after = await getCalendarDayDetail(D)
    expect(after.dailyLog?.emotionCodes).toEqual(['down'])
    expect(after.dailyLog?.bodyEnergyLevel).toBe('empty')
    expect(after.dailyLog?.memo).toBe('유지')
    expect(after.eventLogs.length).toBe(1)
  })
})
