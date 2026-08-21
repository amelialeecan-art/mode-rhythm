/* =====================================================================
   MODE · V2 최종 마이그레이션/통합 회귀 시나리오 (G)
   ===================================================================== */
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from '../schema'
import { resetDatabase } from '../reset'
import { db } from '../db'
import {
  buildExportPayload,
  validateImportPayload,
  importAllData,
  buildDayTimeline,
  eventLogRepository,
  mealEpisodeRepository,
  activityEpisodeRepository,
  medicationRepository,
  stateMeasurementRepository,
  buildStressEventInput,
  cycleLogRepository,
} from '..'
import type { ModeExportPayload } from '..'
import { cycleStartDates, getRelativeDayToNextPeriod, buildCycleContext } from '../../engine'
import { buildDataQualityReport } from '../../engine'
import { dailyMetricSeries } from '../../engine/v2'
import type { CoreMetric, StateMeasurement } from '../modelsV2'

/* --------------------------------------------------------------------- */
describe('Scenario 1: 오래된 V1 IndexedDB → V2 upgrade → 기록 유지', () => {
  const NAME = 'MODERegressionMigDB'
  const nowIso = () => new Date().toISOString()
  beforeEach(async () => { await Dexie.delete(NAME) })
  afterEach(async () => { await Dexie.delete(NAME) })

  it('V1 데이터 보존 + 새 morning 추가 + 재오픈 후 모두 유지', async () => {
    // version(1)만으로 오래된 DB 시뮬
    const v1 = new Dexie(NAME)
    v1.version(1).stores(SCHEMA_V1)
    await v1.open()
    await v1.table('dailyLogs').add({
      date: '2026-06-20', moodLow: 0, anxiety: 3, irritability: 2, sadness: 3, heaviness: 2, calm: 5,
      energy: 5, focus: 5, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
      bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
      createdAt: nowIso(), updatedAt: nowIso(),
    })
    v1.close()

    // 새 앱 코드 로드 = version(1)+(2)+(3) → 자동 업그레이드
    const app = new Dexie(NAME)
    app.version(1).stores(SCHEMA_V1)
    app.version(2).stores(SCHEMA_V2)
    app.version(3).stores(SCHEMA_V3)
    await app.open()
    expect(app.verno).toBe(3)
    expect(await app.table('dailyLogs').count()).toBe(1)
    const legacy = await app.table('dailyLogs').get({ date: '2026-06-20' })
    expect(legacy.moodLow).toBe(0) // 애매한 0도 그대로
    // 새 morning 기록 추가
    await app.table('stateMeasurements').add({
      localDate: '2026-08-21', recordedAt: '2026-08-21T07:30:00.000Z', timezoneOffsetMinutes: 540,
      checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 2 }, source: 'manual', schemaVersion: 1,
      createdAt: nowIso(), updatedAt: nowIso(),
    })
    app.close()

    // 앱 재실행
    const reopened = new Dexie(NAME)
    reopened.version(1).stores(SCHEMA_V1)
    reopened.version(2).stores(SCHEMA_V2)
    reopened.version(3).stores(SCHEMA_V3)
    await reopened.open()
    expect(await reopened.table('dailyLogs').count()).toBe(1)
    expect(await reopened.table('stateMeasurements').count()).toBe(1)
    const sm = (await reopened.table('stateMeasurements').toArray())[0]
    expect(sm.metrics.moodLow).toBe(2)
    reopened.close()
  })
})

/* --------------------------------------------------------------------- */
describe('Scenario 2: V1 JSON import → V2 신규 → export → reset → import 복원', () => {
  beforeEach(async () => { await resetDatabase() })

  const V1_FILE: ModeExportPayload = {
    app: 'MODE', version: 1, exportedAt: '2026-07-01T00:00:00.000Z',
    tables: {
      dailyLogs: [{
        id: 1, date: '2026-06-20', moodLow: 0, anxiety: 3, irritability: 2, sadness: 3, heaviness: 2, calm: 5,
        energy: 5, focus: 5, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
        bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
        createdAt: 't', updatedAt: 't',
      } as never],
      eventLogs: [], cycleLogs: [], recoveryLogs: [], dailyScores: [], patternInsights: [], userSettings: [],
    },
  }

  it('legacy 보존 + V2 신규 + 왕복 후 동일', async () => {
    // V1 import
    const v = validateImportPayload(V1_FILE)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    await importAllData(v.payload)
    expect(await db.dailyLogs.count()).toBe(1)

    // V2 신규 기록
    await stateMeasurementRepository.upsertCheckIn({
      localDate: '2026-08-21', recordedAt: '2026-08-21T07:30:00.000Z', timezoneOffsetMinutes: 540,
      checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 3 }, source: 'manual', schemaVersion: 1,
    })

    // export → reset → import
    const exported = await buildExportPayload()
    await resetDatabase()
    expect(await db.dailyLogs.count()).toBe(0)
    const v2 = validateImportPayload(exported)
    if (!v2.ok) throw new Error('re-import validate failed')
    await importAllData(v2.payload)

    // 동일 상태
    expect(await db.dailyLogs.count()).toBe(1)
    expect(await db.stateMeasurements.count()).toBe(1)
    const reexport = await buildExportPayload()
    expect(reexport.tables).toEqual(exported.tables)
  })
})

/* --------------------------------------------------------------------- */
describe('Scenario 3: 아침→약→식사→갈등→운동→저녁 순서 → timeline 순서/timestamp 정확', () => {
  beforeEach(async () => { await resetDatabase() })

  it('통합 타임라인이 시각 순으로 정렬되고 timestamp가 정확하다', async () => {
    const D = '2026-08-21'
    await stateMeasurementRepository.upsertCheckIn({ localDate: D, recordedAt: `${D}T07:30:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'morning', promptedMetrics: ['moodLow'], metrics: { moodLow: 2 }, source: 'manual', schemaVersion: 1 })
    const medId = await medicationRepository.createProfile({ name: '약', active: true })
    await medicationRepository.addDose({ medicationId: medId, localDate: D, takenAt: `${D}T08:05:00.000Z`, dose: 1, source: 'manual', schemaVersion: 1 })
    await mealEpisodeRepository.add({ localDate: D, startedAt: `${D}T12:43:00.000Z`, prePhysicalHunger: 6, source: 'manual', schemaVersion: 1 })
    await eventLogRepository.add(buildStressEventInput({ localDate: D, category: 'interpersonal_conflict', intensity: 8, occurredAt: `${D}T16:40:00.000Z` }))
    await activityEpisodeRepository.add({ localDate: D, startedAt: `${D}T18:30:00.000Z`, durationMinutes: 45, rpe: 7, activityType: 'strength', source: 'manual', schemaVersion: 1 })
    await stateMeasurementRepository.upsertCheckIn({ localDate: D, recordedAt: `${D}T22:10:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'evening', promptedMetrics: ['moodLow'], metrics: { moodLow: 5 }, source: 'manual', schemaVersion: 1 })

    const timeline = await buildDayTimeline(D)
    expect(timeline.map((e) => e.kind)).toEqual(['state', 'medication', 'meal', 'stress', 'activity', 'state'])
    // 분석 입력 timestamp 정확
    expect(timeline.map((e) => e.at)).toEqual([
      `${D}T07:30:00.000Z`, `${D}T08:05:00.000Z`, `${D}T12:43:00.000Z`, `${D}T16:40:00.000Z`, `${D}T18:30:00.000Z`, `${D}T22:10:00.000Z`,
    ])
  })
})

/* --------------------------------------------------------------------- */
describe('Scenario 4: 26일 + 34일 cycle → retrospective 정렬 정상 + prospective leak 없음', () => {
  beforeEach(async () => { await resetDatabase() })

  it('실제 다음 생리 기준 D-1 정확, 미래 시작을 오늘 판단에 쓰지 않음', async () => {
    // 26일, 34일 간격
    const starts = ['2026-05-01', '2026-05-27', '2026-06-30'] // +26, +34
    for (const d of starts) await cycleLogRepository.add({ date: d, periodStart: true, periodEnd: false })
    const logs = await cycleLogRepository.listByDateRange('2026-04-01', '2026-07-30')
    const startDates = cycleStartDates(logs)
    // retrospective: 5/26은 5/27의 D-1 (주기 길이와 무관)
    expect(getRelativeDayToNextPeriod('2026-05-26', startDates).day).toBe(-1)
    expect(getRelativeDayToNextPeriod('2026-06-29', startDates).day).toBe(-1)

    // prospective(오늘=5/15): 미래 시작(5/27, 6/30)을 데이터로 쓰지 않는다 → look-ahead 없음
    const ctxWithFuture = buildCycleContext('2026-05-15', logs)
    const onlyPast = logs.filter((l) => l.date <= '2026-05-15')
    const ctxPastOnly = buildCycleContext('2026-05-15', onlyPast)
    expect(ctxWithFuture.nextPeriodDate).toBe(ctxPastOnly.nextPeriodDate)
    expect(ctxWithFuture.isPremenstrualWindow).toBe(ctxPastOnly.isPremenstrualWindow)
  })
})

/* --------------------------------------------------------------------- */
describe('Scenario 5: null/0/unknown 혼합 → quality report + 분석 숫자 정확', () => {
  const mk = (date: string, moodLow: number | 'unknown' | null, prompted: CoreMetric[]): StateMeasurement => ({
    localDate: date, recordedAt: `${date}T08:00:00.000Z`, timezoneOffsetMinutes: 540, checkInType: 'morning',
    promptedMetrics: prompted, metrics: moodLow === null ? {} : { moodLow }, source: 'manual', schemaVersion: 1,
    createdAt: 't', updatedAt: 't',
  })

  it('0=numeric, unknown=unknown, null=missing로 정확히 집계 + series는 null/unknown 제외', () => {
    const ms = [
      mk('2026-08-01', 0, ['moodLow', 'energy']),
      mk('2026-08-02', 'unknown', ['moodLow', 'energy']),
      mk('2026-08-03', null, ['moodLow', 'energy']),
      mk('2026-08-04', 5, ['moodLow', 'energy']),
    ]
    const report = buildDataQualityReport(ms)
    const q = report.metrics.moodLow
    expect(q.promptedCount).toBe(4)
    expect(q.numericAnsweredCount).toBe(2) // 0 과 5
    expect(q.unknownCount).toBe(1)
    expect(q.missingCount).toBe(1) // null
    // energy는 물어봤지만 한 번도 응답 없음 → 전부 missing, 0으로 오염 없음
    expect(report.metrics.energy.numericAnsweredCount).toBe(0)
    expect(report.metrics.energy.missingCount).toBe(4)
    // 분석 series는 숫자만
    const series = dailyMetricSeries(ms, 'moodLow')
    expect(series.map((p) => p.value)).toEqual([0, 5])
  })
})
