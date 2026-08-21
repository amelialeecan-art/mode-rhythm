/* =====================================================================
   MODE · V1 → V2 비파괴 마이그레이션 테스트
   실제 SCHEMA_V1/SCHEMA_V2 상수로 임시 DB를 만들어, version(1) 데이터가
   version(2) 업그레이드 후에도 그대로 보존되는지 검증한다.
   (앱 전역 싱글턴 db와 충돌하지 않도록 별도 DB 이름을 쓴다.)
   ===================================================================== */
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCHEMA_V1, SCHEMA_V2 } from '../schema'

const NAME = 'MODEMigTestDB'

function nowIso() {
  return new Date().toISOString()
}

async function seedV1(v1: Dexie) {
  // 각 7개 테이블에 최소 1행. dailyLogs에는 "진짜 0"(moodLow=0)을 넣어 보존을 확인한다.
  await v1.table('dailyLogs').add({
    date: '2026-08-01', moodLow: 0, anxiety: 3, irritability: 2, sadness: 3, heaviness: 2, calm: 5,
    energy: 5, focus: 5, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
    bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
    createdAt: nowIso(), updatedAt: nowIso(),
  })
  await v1.table('eventLogs').add({
    date: '2026-08-01', eventCode: 'work_pressure', eventLabel: '업무 압박', category: 'work',
    timing: 'today', intensity: 6, isCustom: false, mappedFactorGroup: 'work', createdAt: nowIso(),
  })
  await v1.table('cycleLogs').add({ date: '2026-08-01', periodStart: true, periodEnd: false, createdAt: nowIso(), updatedAt: nowIso() })
  await v1.table('recoveryLogs').add({ date: '2026-08-01', actionCode: 'walk', actionLabel: '산책', category: 'body', effect: 'little_better', createdAt: nowIso() })
  await v1.table('dailyScores').add({
    date: '2026-08-01', emotionalLoad: 40, appetiteLoad: 30, sleepLoad: 20, bodyLoad: 10, cycleLoad: 15,
    eventLoad: 25, rhythmLoad: 20, dayType: 'stable', createdAt: nowIso(), updatedAt: nowIso(),
  })
  await v1.table('patternInsights').add({
    insightType: 'factor', targetMetric: 'emotional', factorCodes: ['work'], message: 'x', createdAt: nowIso(),
  })
  await v1.table('userSettings').add({ cycleEnabled: true, averageCycleLength: 28, toneMode: 'witty', reminderEnabled: false, privacyMode: 'local', createdAt: nowIso(), updatedAt: nowIso() })
}

describe('V1 → V2 비파괴 마이그레이션', () => {
  beforeEach(async () => {
    await Dexie.delete(NAME)
  })
  afterEach(async () => {
    await Dexie.delete(NAME)
  })

  it('version(1) 데이터가 version(2) 업그레이드 후에도 7개 테이블 모두 보존된다', async () => {
    // 1) version(1)만으로 열어 데이터 적재
    const v1 = new Dexie(NAME)
    v1.version(1).stores(SCHEMA_V1)
    await v1.open()
    expect(v1.verno).toBe(1)
    await seedV1(v1)
    v1.close()

    // 2) version(1)+version(2)로 재오픈 → 자동 업그레이드
    const v2 = new Dexie(NAME)
    v2.version(1).stores(SCHEMA_V1)
    v2.version(2).stores(SCHEMA_V2)
    await v2.open()
    expect(v2.verno).toBe(2)

    // 기존 7개 테이블 데이터가 그대로 있다
    for (const t of ['dailyLogs', 'eventLogs', 'cycleLogs', 'recoveryLogs', 'dailyScores', 'patternInsights', 'userSettings']) {
      expect(await v2.table(t).count(), `${t} 보존`).toBe(1)
    }

    // V1의 "진짜 0"은 0으로 보존된다(재해석/삭제 없음)
    const daily = await v2.table('dailyLogs').get({ date: '2026-08-01' })
    expect(daily.moodLow).toBe(0)
    expect(daily.headache).toBe(0)

    v2.close()
  })

  it('업그레이드는 신규 V2 테이블만 추가하고, V1 dailyLogs를 StateMeasurement로 변환하지 않는다', async () => {
    const v1 = new Dexie(NAME)
    v1.version(1).stores(SCHEMA_V1)
    await v1.open()
    await seedV1(v1)
    v1.close()

    const v2 = new Dexie(NAME)
    v2.version(1).stores(SCHEMA_V1)
    v2.version(2).stores(SCHEMA_V2)
    await v2.open()

    // 신규 테이블은 존재하되 전부 비어 있다 — 마이그레이션이 자동 변환을 하지 않았다는 증거
    for (const t of ['stateMeasurements', 'sleepEpisodes', 'mealEpisodes', 'activityEpisodes', 'medicationProfiles', 'medicationDoses', 'healthExceptions', 'screenMetrics', 'weightMeasurements']) {
      expect(await v2.table(t).count(), `${t} 신규 빈 테이블`).toBe(0)
    }
    // 신규 테이블에 쓰기가 정상 동작한다
    await v2.table('stateMeasurements').add({
      localDate: '2026-08-02', recordedAt: '2026-08-02T08:00:00.000Z', timezoneOffsetMinutes: 540,
      checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 2 }, source: 'manual', schemaVersion: 1,
      createdAt: nowIso(), updatedAt: nowIso(),
    })
    expect(await v2.table('stateMeasurements').count()).toBe(1)

    v2.close()
  })
})
