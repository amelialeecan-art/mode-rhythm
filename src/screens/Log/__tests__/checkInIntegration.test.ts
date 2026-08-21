/* =====================================================================
   MODE · 체크인 저장/복원 통합 테스트 (repository + dexie)
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../../../data/reset'
import { db } from '../../../data/db'
import { dailyLogRepository, stateMeasurementRepository } from '../../../data/repositories'
import { MORNING_PROMPTED, EVENING_PROMPTED } from '../../../data/catalog/coreState'
import type { DailyLogInput } from '../../../data/models'
import { buildMeasurementInput, measurementToValues, type CheckInValues } from '../checkIn/checkInForm'

function saveMorning(values: CheckInValues, recordedAt: string) {
  return stateMeasurementRepository.upsertCheckIn(
    buildMeasurementInput({
      localDate: '2026-08-21', checkInType: 'morning', promptedMetrics: MORNING_PROMPTED,
      values, recordedAt, timezoneOffsetMinutes: 540,
    }),
  )
}

beforeEach(async () => {
  await resetDatabase()
})

describe('아침/저녁 독립 저장 + 분리', () => {
  it('같은 날 morning과 evening을 각각 독립 저장한다', async () => {
    await saveMorning({ moodLow: 2, energy: 6 }, '2026-08-21T07:42:00.000Z')
    const eveningValues: CheckInValues = {}
    for (const m of EVENING_PROMPTED) eveningValues[m] = 4
    await stateMeasurementRepository.upsertCheckIn(
      buildMeasurementInput({
        localDate: '2026-08-21', checkInType: 'evening', promptedMetrics: EVENING_PROMPTED,
        values: eveningValues, recordedAt: '2026-08-21T21:58:00.000Z', timezoneOffsetMinutes: 540,
      }),
    )
    const rows = await stateMeasurementRepository.listByDate('2026-08-21')
    expect(rows).toHaveLength(2)
    const morning = rows.find((r) => r.checkInType === 'morning')!
    const evening = rows.find((r) => r.checkInType === 'evening')!
    expect(Object.keys(morning.metrics)).toHaveLength(2)
    expect(Object.keys(evening.metrics)).toHaveLength(12)
  })

  it('아침 8개 질문 외 metric은 0으로 채워지지 않는다', async () => {
    await saveMorning({ moodLow: 0 }, '2026-08-21T08:00:00.000Z')
    const m = await stateMeasurementRepository.getByDateAndType('2026-08-21', 'morning')
    expect(m!.metrics.moodLow).toBe(0)
    // 물어보지 않은 craving/bingeUrge는 존재하지 않는다
    expect('craving' in m!.metrics).toBe(false)
    expect('bingeUrge' in m!.metrics).toBe(false)
    // 물어봤지만 미응답한 energy도 0이 아니라 부재
    expect(m!.metrics.energy).toBeUndefined()
    expect(m!.promptedMetrics).toEqual(MORNING_PROMPTED)
  })
})

describe('수정/upsert + recordedAt 유지', () => {
  it('아침을 다시 저장해도 중복 없이 값이 갱신되고 recordedAt(측정 시각)은 유지된다', async () => {
    const id1 = await saveMorning({ moodLow: 2 }, '2026-08-21T07:42:00.000Z')
    // 편집 저장: 다른 recordedAt을 넘겨도 원래 측정 시각이 유지되어야 한다
    const id2 = await saveMorning({ moodLow: 6 }, '2026-08-21T09:30:00.000Z')
    expect(id2).toBe(id1)

    const rows = await stateMeasurementRepository.listByDate('2026-08-21')
    expect(rows.filter((r) => r.checkInType === 'morning')).toHaveLength(1)

    const m = await stateMeasurementRepository.getByDateAndType('2026-08-21', 'morning')
    expect(m!.metrics.moodLow).toBe(6) // 값은 갱신
    expect(m!.recordedAt).toBe('2026-08-21T07:42:00.000Z') // 측정 시각은 유지
    expect(m!.updatedAt).not.toBe(m!.createdAt) // 수정 시각은 갱신
  })
})

describe('복원(restore) 시 값 유지', () => {
  it('저장 후 다시 불러오면 화면 값이 그대로 복원된다', async () => {
    const values: CheckInValues = { moodLow: 0, anxiety: 7, focus: 'unknown' }
    await saveMorning(values, '2026-08-21T08:00:00.000Z')
    const m = await stateMeasurementRepository.getByDateAndType('2026-08-21', 'morning')
    expect(measurementToValues(m!)).toEqual(values)
  })
})

describe('V2 저장이 레거시 dailyLog를 덮어쓰지 않는다', () => {
  it('아침 상태 저장은 같은 날 dailyLog 숫자에 영향을 주지 않는다', async () => {
    const daily: DailyLogInput = {
      date: '2026-08-21', moodLow: 5, anxiety: 4, irritability: 3, sadness: 3, heaviness: 2, calm: 5,
      energy: 6, focus: 6, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
      bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
    }
    await dailyLogRepository.upsert(daily)
    await saveMorning({ moodLow: 0, energy: 0 }, '2026-08-21T08:00:00.000Z')

    // 레거시 dailyLog는 그대로
    const legacy = await dailyLogRepository.getByDate('2026-08-21')
    expect(legacy!.moodLow).toBe(5)
    expect(legacy!.energy).toBe(6)
    // V2 measurement는 별도로 존재
    const m = await stateMeasurementRepository.getByDateAndType('2026-08-21', 'morning')
    expect(m!.metrics.moodLow).toBe(0)
    // 두 저장소가 각각 1행씩
    expect(await db.dailyLogs.count()).toBe(1)
    expect(await db.stateMeasurements.count()).toBe(1)
  })
})
