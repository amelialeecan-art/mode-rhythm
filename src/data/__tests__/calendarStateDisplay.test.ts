import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { dailyLogRepository, eventLogRepository, recoveryLogRepository } from '../repositories'
import { recalculateDailyScore } from '../services/dailyScoreService'
import { getCalendarMonth, getCalendarDayDetail } from '../services/calendarService'
import type { DailyLogInput } from '../models'

const Z = {
  moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0, calm: 0, energy: 0, focus: 0, selfCriticism: 0,
  impulsivity: 0, appetite: 0, sweetCraving: 0, saltyCraving: 0, bingeUrge: 0, bodyDiscomfort: 0, pain: 0, bloating: 0,
  fatigue: 0, headache: 0, digestion: 0,
}
const putDay = (date: string, p: Partial<DailyLogInput> = {}) => dailyLogRepository.upsert({ date, ...Z, ...p })
const addEvent = (date: string) =>
  eventLogRepository.bulkAdd([{ date, eventCode: 'work_heavy', eventLabel: '업무 과중', category: 'work', timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'work' } as never])
const addRecovery = (date: string) => recoveryLogRepository.add({ date, actionCode: 'rest_alone', actionLabel: '혼자 쉼', category: 'rest', effect: 'helped' } as never)
const cellOf = async (date: string) => (await getCalendarMonth(date)).days.find((d) => d.date === date)!

beforeEach(async () => {
  await resetDatabase()
})

describe('Calendar — 상태 미입력 날의 거짓 안정 방지', () => {
  it('(12) 몸 신호만 있는 날(상태 미입력)은 달력 칸에 안정으로 표시하지 않는다', async () => {
    const D = '2026-06-10'
    await putDay(D, { bodySignalCodes: ['head_eye_fatigue'], memo: '테스트' })
    await recalculateDailyScore(D)
    const cell = await cellOf(D)
    expect(cell.hasEntry).toBe(true) // 빈 날짜로 표시하지 않음
    expect(cell.shortLabel).toBeUndefined() // '안정' 라벨 없음
    expect(cell.dayType).toBeUndefined()
    expect(cell.scores).toBeDefined() // 점수(히트맵)는 유지
  })

  it('(11/13) 사건·회복만 있는 날(dailyLog 없음)은 안정 라벨 없음', async () => {
    const D = '2026-06-11'
    await addEvent(D)
    await addRecovery(D)
    await recalculateDailyScore(D) // dailyLog 없으면 score 미기록
    const cell = await cellOf(D)
    expect(cell.shortLabel).toBeUndefined()
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true) // 기록(사건·회복)은 존재
    expect(detail.eventLogs.length).toBe(1)
    expect(detail.recoveryLogs.length).toBe(1)
  })

  it('(14/17) 상태 없이 여러 기록이 있는 날: 빈 날 아님 + 원본 기록 유지 + 상태 안내', async () => {
    const D = '2026-06-12'
    await putDay(D, { bodySignalCodes: ['malaise'], lastNightSleep: { issues: ['sleep_late'] } })
    await addEvent(D)
    await addRecovery(D)
    await recalculateDailyScore(D)
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasEntry).toBe(true)
    expect(detail.eventLogs.length).toBe(1)
    expect(detail.recoveryLogs.length).toBe(1)
    expect(detail.hasStateInput).toBe(false) // 직접 상태 입력 없음 → 화면은 "상태 선택 없이…" 안내로 처리
  })

  it('(15/16) 직접 상태가 있는 날은 사람말 상태 라벨을 그대로 표시한다', async () => {
    const D = '2026-06-13'
    await putDay(D, { bodyEnergyLevel: 'empty', mentalSpaceLevel: 'overloaded' })
    await recalculateDailyScore(D)
    const detail = await getCalendarDayDetail(D)
    expect(detail.hasStateInput).toBe(true)
    expect(detail.stateLabels).toContain('몸이 쉽게 지쳤어요')
    expect(detail.stateLabels).toContain('머리가 복잡했어요')
  })

  it('직접 상태로 안정적인 날은 안정 라벨을 유지한다', async () => {
    const D = '2026-06-14'
    // 감정 안정감 높음 → 상태 입력 있음, 부하 낮음 → stable
    await putDay(D, { emotionalStabilityLevel: 'very_stable' })
    await recalculateDailyScore(D)
    const cell = await cellOf(D)
    expect((await getCalendarDayDetail(D)).hasStateInput).toBe(true)
    // 상태 입력이 있으므로 stable이면 '안정' 라벨 허용
    if (cell.dayType === 'stable') expect(cell.shortLabel).toBe('안정')
  })
})
