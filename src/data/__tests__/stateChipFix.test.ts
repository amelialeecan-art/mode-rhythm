import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { recalculateDailyScore } from '../services/dailyScoreService'
import { getCalendarDayDetail } from '../services/calendarService'
import { dailyLogRepository } from '../repositories'
import { DB_VERSION, SCHEMA_V1 } from '../schema'

const D = '2026-06-21'
const draft = (p: Partial<DailyEntryDraft>): DailyEntryDraft => ({ ...emptyDraft(D), ...p })

beforeEach(async () => {
  await resetDatabase()
})

describe('상태칩 저장/반영 버그픽스', () => {
  it('1. 상태칩 저장 → dailyLogs 상태 필드가 0이 아니다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['irritable', 'appetite_swing', 'drained'], overallIntensity: 'much' }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.irritability).toBeGreaterThan(0)
    expect(log!.appetite).toBeGreaterThan(0)
    expect(log!.fatigue).toBeGreaterThan(0)
  })

  it('2. recalculateDailyScore → 관련 부하 점수가 0보다 크다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['irritable', 'appetite_swing', 'drained'], overallIntensity: 'much' }))
    const score = await recalculateDailyScore(D)
    expect(score!.emotionalLoad).toBeGreaterThan(0)
    expect(score!.appetiteLoad).toBeGreaterThan(0)
    expect(score!.bodyLoad).toBeGreaterThan(0)
  })

  it('3. loadDailyEntry가 stateCodes를 복원한다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['irritable', 'appetite_swing'], overallIntensity: 'much' }))
    const reloaded = await loadDailyEntry(D)
    expect(reloaded!.stateCodes.sort()).toEqual(['appetite_swing', 'irritable'])
    expect(reloaded!.overallIntensity).toBe('much')
  })

  it('4. 다시 열고(그대로) 재저장해도 상태값이 0으로 날아가지 않는다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['irritable', 'appetite_swing', 'drained'], overallIntensity: 'much' }))
    const before = await dailyLogRepository.getByDate(D)
    const reloaded = await loadDailyEntry(D)
    await saveDailyEntry(reloaded!) // 아무것도 안 바꾸고 재저장
    const after = await dailyLogRepository.getByDate(D)
    expect(after!.irritability).toBe(before!.irritability)
    expect(after!.appetite).toBe(before!.appetite)
    expect(after!.fatigue).toBe(before!.fatigue)
    expect(after!.irritability).toBeGreaterThan(0)
  })

  it('5. appetiteRatings가 dailyLogs 식욕 필드에 저장된다', async () => {
    await saveDailyEntry(draft({ appetiteRatings: { appetite: 7, sweetCraving: 5, saltyCraving: 3, bingeUrge: 9 } }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.appetite).toBe(7)
    expect(log!.sweetCraving).toBe(5)
    expect(log!.saltyCraving).toBe(3)
    expect(log!.bingeUrge).toBe(9)
    // 복원도 됨
    const reloaded = await loadDailyEntry(D)
    expect(reloaded!.appetiteRatings.appetite).toBe(7)
  })

  it('6. appetiteRatings가 state preset보다 우선한다', async () => {
    // appetite_swing preset은 appetite=7이지만, 직접 입력 3이 우선
    await saveDailyEntry(draft({ stateCodes: ['appetite_swing'], appetiteRatings: { appetite: 3 } }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log!.appetite).toBe(3)
  })

  it('7. Calendar day detail이 오늘 상태 라벨을 반환한다', async () => {
    await saveDailyEntry(draft({ stateCodes: ['irritable', 'appetite_swing'], overallIntensity: 'some' }))
    const detail = await getCalendarDayDetail(D)
    expect(detail.stateLabels).toContain('예민')
    expect(detail.stateLabels).toContain('식욕 변동')
  })

  it('8. DB schema version/인덱스는 변경되지 않았다', () => {
    expect(DB_VERSION).toBe(1)
    expect(SCHEMA_V1.dailyLogs).toBe('++id, &date') // 인덱스 그대로 (메타는 비인덱스)
  })
})
