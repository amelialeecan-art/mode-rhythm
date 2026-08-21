/* =====================================================================
   MODE · V2 repository / 0·null·unknown / 공존·upsert 테스트
   앱 전역 싱글턴 db(version 2)를 쓰고 매 테스트마다 reset한다.
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import {
  activityEpisodeRepository,
  dailyLogRepository,
  eventLogRepository,
  healthExceptionRepository,
  mealEpisodeRepository,
  medicationRepository,
  screenMetricRepository,
  sleepEpisodeRepository,
  stateMeasurementRepository,
  weightMeasurementRepository,
} from '../repositories'
import type { DailyLogInput } from '../models'
import type { CoreMetric } from '../modelsV2'
import { V2ValidationError } from '../v2Validation'

const TZ = 540 // KST

beforeEach(async () => {
  await resetDatabase()
})

/* --------------------------------------------------------------------- */
describe('0 / null / unknown 삼분 저장', () => {
  it('measured 0, 미측정 null, unknown을 서로 바꾸지 않고 그대로 보존한다', async () => {
    await stateMeasurementRepository.upsertCheckIn({
      localDate: '2026-08-10',
      recordedAt: '2026-08-10T08:00:00.000Z',
      timezoneOffsetMinutes: TZ,
      checkInType: 'morning',
      promptedMetrics: ['moodLow', 'anxiety', 'energy'],
      metrics: { moodLow: 0, anxiety: null, energy: 'unknown' },
      source: 'manual',
      schemaVersion: 1,
    })
    const rows = await stateMeasurementRepository.listByDate('2026-08-10')
    expect(rows).toHaveLength(1)
    const m = rows[0].metrics
    // 0은 진짜 number 0
    expect(m.moodLow).toBe(0)
    expect(typeof m.moodLow).toBe('number')
    // null은 0으로 접히지 않는다
    expect(m.anxiety).toBeNull()
    expect(m.anxiety).not.toBe(0)
    // unknown은 문자열 그대로
    expect(m.energy).toBe('unknown')
  })

  it('안 물어본 metric은 0으로 채워지지 않고 키 자체가 없다', async () => {
    await stateMeasurementRepository.upsertCheckIn({
      localDate: '2026-08-11', recordedAt: '2026-08-11T08:00:00.000Z', timezoneOffsetMinutes: TZ,
      checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 4 }, source: 'manual', schemaVersion: 1,
    })
    const [row] = await stateMeasurementRepository.listByDate('2026-08-11')
    expect(row.metrics.moodLow).toBe(4)
    // 물어보지 않은 craving은 존재하지 않는다(0 아님)
    expect('craving' in row.metrics).toBe(false)
    expect(row.metrics.craving).toBeUndefined()
    expect(row.promptedMetrics).toEqual(['moodLow'])
  })

  it('잘못된 rating(11, 소수)은 저장을 거부한다(0으로 보정하지 않음)', async () => {
    await expect(
      stateMeasurementRepository.upsertCheckIn({
        localDate: '2026-08-12', recordedAt: '2026-08-12T08:00:00.000Z', timezoneOffsetMinutes: TZ,
        checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 11 }, source: 'manual', schemaVersion: 1,
      }),
    ).rejects.toBeInstanceOf(V2ValidationError)
    expect(await db.stateMeasurements.count()).toBe(0)
  })
})

/* --------------------------------------------------------------------- */
describe('StateMeasurement morning/evening/adhoc', () => {
  const base = (checkInType: 'morning' | 'evening' | 'adhoc', hour: string, mood: number) => ({
    localDate: '2026-08-13',
    recordedAt: `2026-08-13T${hour}:00:00.000Z`,
    timezoneOffsetMinutes: TZ,
    checkInType,
    promptedMetrics: ['moodLow'] as CoreMetric[],
    metrics: { moodLow: mood },
    source: 'manual' as const,
    schemaVersion: 1,
  })

  it('같은 날 morning과 evening이 공존한다(각 1개)', async () => {
    await stateMeasurementRepository.upsertCheckIn(base('morning', '08', 2))
    await stateMeasurementRepository.upsertCheckIn(base('evening', '22', 6))
    const rows = await stateMeasurementRepository.listByDate('2026-08-13')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.checkInType).sort()).toEqual(['evening', 'morning'])
  })

  it('같은 날 morning을 다시 저장하면 중복 생성되지 않고 upsert된다(같은 id, 값 갱신)', async () => {
    const id1 = await stateMeasurementRepository.upsertCheckIn(base('morning', '08', 2))
    const id2 = await stateMeasurementRepository.upsertCheckIn(base('morning', '09', 5))
    expect(id2).toBe(id1)
    const rows = await stateMeasurementRepository.listByDate('2026-08-13')
    const mornings = rows.filter((r) => r.checkInType === 'morning')
    expect(mornings).toHaveLength(1)
    expect(mornings[0].metrics.moodLow).toBe(5)
  })

  it('adhoc은 같은 날 여러 개 공존한다', async () => {
    await stateMeasurementRepository.upsertCheckIn(base('adhoc', '11', 3))
    await stateMeasurementRepository.upsertCheckIn(base('adhoc', '15', 7))
    const rows = await stateMeasurementRepository.listByDate('2026-08-13')
    expect(rows.filter((r) => r.checkInType === 'adhoc')).toHaveLength(2)
  })
})

/* --------------------------------------------------------------------- */
describe('Episode 테이블 공존', () => {
  it('여러 MealEpisode가 같은 날 공존한다', async () => {
    await mealEpisodeRepository.add({ localDate: '2026-08-14', startedAt: '2026-08-14T08:00:00.000Z', prePhysicalHunger: 6, source: 'manual', schemaVersion: 1 })
    await mealEpisodeRepository.add({ localDate: '2026-08-14', startedAt: '2026-08-14T13:00:00.000Z', prePhysicalHunger: 3, source: 'manual', schemaVersion: 1 })
    await mealEpisodeRepository.add({ localDate: '2026-08-14', startedAt: '2026-08-14T19:00:00.000Z', prePhysicalHunger: 8, source: 'manual', schemaVersion: 1 })
    const meals = await mealEpisodeRepository.listByDate('2026-08-14')
    expect(meals).toHaveLength(3)
    expect(meals.map((m) => m.startedAt)).toEqual([
      '2026-08-14T08:00:00.000Z', '2026-08-14T13:00:00.000Z', '2026-08-14T19:00:00.000Z',
    ])
  })

  it('식사 시각 순서 위반(종료<시작)은 거부한다', async () => {
    await expect(
      mealEpisodeRepository.add({ localDate: '2026-08-14', startedAt: '2026-08-14T13:00:00.000Z', endedAt: '2026-08-14T12:00:00.000Z', source: 'manual', schemaVersion: 1 }),
    ).rejects.toBeInstanceOf(V2ValidationError)
  })

  it('여러 EventLog가 각자의 occurredAt/intensity를 갖고 공존한다(하나를 복사하지 않음)', async () => {
    await eventLogRepository.add({
      date: '2026-08-15', eventCode: 'relationship_conflict', eventLabel: '갈등', category: 'relationship',
      timing: 'exact', intensity: 8, isCustom: false, mappedFactorGroup: 'relationship',
      occurredAt: '2026-08-15T16:40:00.000Z', source: 'manual', schemaVersion: 1,
    })
    await eventLogRepository.add({
      date: '2026-08-15', eventCode: 'work_pressure', eventLabel: '업무', category: 'work',
      timing: 'exact', intensity: 4, isCustom: false, mappedFactorGroup: 'work',
      occurredAt: '2026-08-15T10:00:00.000Z', source: 'manual', schemaVersion: 1,
    })
    const events = await eventLogRepository.listByDate('2026-08-15')
    expect(events).toHaveLength(2)
    const byCode = Object.fromEntries(events.map((e) => [e.eventCode, e]))
    expect(byCode.relationship_conflict.intensity).toBe(8)
    expect(byCode.relationship_conflict.occurredAt).toBe('2026-08-15T16:40:00.000Z')
    expect(byCode.work_pressure.intensity).toBe(4)
    expect(byCode.work_pressure.occurredAt).toBe('2026-08-15T10:00:00.000Z')
  })

  it('SleepEpisode 시각 순서 위반(잠듦<취침)은 거부한다', async () => {
    await expect(
      sleepEpisodeRepository.add({
        localDate: '2026-08-16', wentToBedAt: '2026-08-16T00:00:00.000Z', sleepOnsetAt: '2026-08-15T23:00:00.000Z',
        source: 'manual', schemaVersion: 1,
      }),
    ).rejects.toBeInstanceOf(V2ValidationError)
  })
})

/* --------------------------------------------------------------------- */
describe('Medication 프로필 ↔ dose 연결', () => {
  it('프로필 id로 dose를 연결하고 타임라인으로 조회한다', async () => {
    const medId = await medicationRepository.createProfile({ name: '설트랄린', defaultDose: 50, doseUnit: 'mg', active: true })
    await medicationRepository.addDose({ medicationId: medId, localDate: '2026-08-17', takenAt: '2026-08-17T09:00:00.000Z', dose: 50, source: 'manual', schemaVersion: 1 })
    await medicationRepository.addDose({ medicationId: medId, localDate: '2026-08-18', takenAt: '2026-08-18T09:00:00.000Z', dose: 100, source: 'manual', schemaVersion: 1 })
    const doses = await medicationRepository.listDosesByMedication(medId)
    expect(doses).toHaveLength(2)
    // 용량 변경이 타임라인에 남는다
    expect(doses.map((d) => d.dose)).toEqual([50, 100])
  })

  it('존재하지 않는 medicationId로 dose를 추가하면 거부한다', async () => {
    await expect(
      medicationRepository.addDose({ medicationId: 9999, localDate: '2026-08-17', takenAt: '2026-08-17T09:00:00.000Z', dose: 50, source: 'manual', schemaVersion: 1 }),
    ).rejects.toBeInstanceOf(V2ValidationError)
  })

  it('프로필 중단(deactivate)은 삭제하지 않고 과거 dose를 보존한다', async () => {
    const medId = await medicationRepository.createProfile({ name: 'X', active: true })
    await medicationRepository.addDose({ medicationId: medId, localDate: '2026-08-17', takenAt: '2026-08-17T09:00:00.000Z', source: 'manual', schemaVersion: 1 })
    await medicationRepository.deactivateProfile(medId)
    expect((await medicationRepository.getProfile(medId))?.active).toBe(false)
    expect(await medicationRepository.listDosesByMedication(medId)).toHaveLength(1)
  })
})

/* --------------------------------------------------------------------- */
describe('V1 → V2 자동 변환 금지 (repository 관점)', () => {
  it('V1 dailyLog(0 포함)을 저장해도 stateMeasurements는 생성되지 않는다', async () => {
    const daily: DailyLogInput = {
      date: '2026-08-19', moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0, calm: 0,
      energy: 0, focus: 0, selfCriticism: 0, impulsivity: 0, appetite: 0, sweetCraving: 0, saltyCraving: 0,
      bingeUrge: 0, bodyDiscomfort: 0, pain: 0, bloating: 0, fatigue: 0, headache: 0, digestion: 0,
    }
    await dailyLogRepository.upsert(daily)
    // 애매한 V1 0들이 V2 core measurement로 자동 변환되지 않는다
    expect(await db.stateMeasurements.count()).toBe(0)
    // V1 기록 자체는 보존
    expect((await dailyLogRepository.getByDate('2026-08-19'))?.moodLow).toBe(0)
  })
})

/* --------------------------------------------------------------------- */
describe('기타 V2 테이블 기본 동작', () => {
  it('ScreenMetric은 localDate 기준 upsert(하루 1행)', async () => {
    await screenMetricRepository.upsertByDate({ localDate: '2026-08-20', preBed2hMinutes: 90, source: 'manual', schemaVersion: 1 })
    await screenMetricRepository.upsertByDate({ localDate: '2026-08-20', preBed2hMinutes: 120, totalMinutes: 300, source: 'manual', schemaVersion: 1 })
    const row = await screenMetricRepository.getByDate('2026-08-20')
    expect(row?.preBed2hMinutes).toBe(120)
    expect(row?.totalMinutes).toBe(300)
    expect(await db.screenMetrics.where('localDate').equals('2026-08-20').count()).toBe(1)
  })

  it('WeightMeasurement는 weightKg와 userSawWeight를 분리 저장한다', async () => {
    await weightMeasurementRepository.add({ localDate: '2026-08-20', measuredAt: '2026-08-20T07:00:00.000Z', weightKg: 56.3, userSawWeight: false, source: 'manual', schemaVersion: 1 })
    const [w] = await weightMeasurementRepository.listByDate('2026-08-20')
    expect(w.weightKg).toBe(56.3)
    expect(w.userSawWeight).toBe(false)
  })

  it('ActivityEpisode는 음수 duration을 거부한다', async () => {
    await expect(
      activityEpisodeRepository.add({ localDate: '2026-08-20', startedAt: '2026-08-20T18:00:00.000Z', durationMinutes: -5, activityType: 'cardio', source: 'manual', schemaVersion: 1 }),
    ).rejects.toBeInstanceOf(V2ValidationError)
  })

  it('HealthException은 category 사건을 하루 여러 개 저장한다', async () => {
    await healthExceptionRepository.add({ localDate: '2026-08-20', category: 'fever', intensity: 7, source: 'manual', schemaVersion: 1 })
    await healthExceptionRepository.add({ localDate: '2026-08-20', category: 'gi_illness', source: 'manual', schemaVersion: 1 })
    expect(await healthExceptionRepository.listByDate('2026-08-20')).toHaveLength(2)
  })
})
