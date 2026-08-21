/* =====================================================================
   MODE · Export/Import V2 라운드트립 + V1 하위호환 테스트 (6단계)
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import { buildExportPayload, EXPORT_FORMAT_VERSION, type ModeExportPayload } from '../services/dataExportService'
import { validateImportPayload, importAllData } from '../services/dataImportService'

beforeEach(async () => {
  await resetDatabase()
})

/** V2 원자료를 직접 넣는다(0/null/unknown을 정확히 제어하기 위해 db 직접 사용). */
async function seedV2() {
  const now = '2026-08-01T08:00:00.000Z'
  // 실제 앱은 항상 userSettings 1행을 갖는다 — 라운드트립 동일성을 위해 함께 심는다.
  await db.userSettings.add({
    cycleEnabled: true, averageCycleLength: 28, toneMode: 'witty', reminderEnabled: false,
    privacyMode: 'local', createdAt: now, updatedAt: now,
  } as never)
  await db.stateMeasurements.add({
    localDate: '2026-08-01', recordedAt: now, timezoneOffsetMinutes: 540, checkInType: 'morning',
    promptedMetrics: ['moodLow', 'anxiety', 'energy'],
    metrics: { moodLow: 0, anxiety: 'unknown' }, // 0 / unknown / (energy 미응답)
    source: 'manual', schemaVersion: 1, createdAt: now, updatedAt: now,
  })
  await db.sleepEpisodes.add({
    localDate: '2026-08-01', sleepOnsetAt: '2026-07-31T23:30:00.000Z', wakeAt: now,
    awakenings: null, satisfaction: 'unknown', source: 'manual', schemaVersion: 1, createdAt: now, updatedAt: now,
  })
  await db.mealEpisodes.add({
    localDate: '2026-08-01', startedAt: now, prePhysicalHunger: 0, preCraving: null,
    source: 'manual', schemaVersion: 1, createdAt: now, updatedAt: now,
  })
  await db.weightMeasurements.add({
    localDate: '2026-08-01', measuredAt: now, weightKg: 56.3, userSawWeight: null,
    source: 'manual', schemaVersion: 1, createdAt: now, updatedAt: now,
  })
}

describe('V2 export/import 라운드트립', () => {
  it('export → import → export가 완전히 동일하다', async () => {
    await seedV2()
    const p1 = await buildExportPayload()
    expect(p1.version).toBe(EXPORT_FORMAT_VERSION)
    expect(p1.version).toBe(2)

    await resetDatabase()
    const v = validateImportPayload(p1)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    await importAllData(v.payload)

    const p2 = await buildExportPayload()
    // exportedAt만 다르고 tables는 동일해야 한다.
    expect(p2.tables).toEqual(p1.tables)
  })

  it('0/null/unknown이 라운드트립에서 그대로 보존된다', async () => {
    await seedV2()
    const p1 = await buildExportPayload()
    await resetDatabase()
    const v = validateImportPayload(p1)
    if (!v.ok) throw new Error('validate failed')
    await importAllData(v.payload)

    const sm = (await db.stateMeasurements.toArray())[0]
    expect(sm.metrics.moodLow).toBe(0) // 0 유지 (numeric)
    expect(sm.metrics.anxiety).toBe('unknown') // unknown 유지
    expect('energy' in sm.metrics).toBe(false) // 미응답은 여전히 부재
    const sleep = (await db.sleepEpisodes.toArray())[0]
    expect(sleep.awakenings).toBeNull() // null 유지 (0 아님)
    const meal = (await db.mealEpisodes.toArray())[0]
    expect(meal.prePhysicalHunger).toBe(0)
    expect(meal.preCraving).toBeNull()
    const w = (await db.weightMeasurements.toArray())[0]
    expect(w.userSawWeight).toBeNull()
    expect(w.weightKg).toBe(56.3)
  })
})

describe('V1 백업 하위호환', () => {
  const V1_FILE: ModeExportPayload = {
    app: 'MODE',
    version: 1,
    exportedAt: '2026-07-01T00:00:00.000Z',
    tables: {
      dailyLogs: [
        {
          id: 1, date: '2026-06-20', moodLow: 0, anxiety: 3, irritability: 2, sadness: 3, heaviness: 2, calm: 5,
          energy: 5, focus: 5, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
          bingeUrge: 1, bodyDiscomfort: 2, pain: 1, bloating: 1, fatigue: 3, headache: 0, digestion: 2,
          createdAt: 't', updatedAt: 't',
        } as never,
      ],
      eventLogs: [], cycleLogs: [], recoveryLogs: [], dailyScores: [], patternInsights: [],
      userSettings: [],
    },
  }

  it('version 1 파일도 import 가능하고 legacy table로 복원된다', async () => {
    const v = validateImportPayload(V1_FILE)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.summary.formatVersion).toBe(1)
    expect(v.summary.hasV2).toBe(false)
    const counts = await importAllData(v.payload)
    expect(counts.dailyLogs).toBe(1)
    // V1 파일엔 V2가 없으니 V2 테이블은 전부 0으로 교체
    expect(counts.stateMeasurements).toBe(0)
    // V1 ambiguous 0은 그대로 0으로 복원(재해석/생성 없음)
    const dl = (await db.dailyLogs.toArray())[0]
    expect(dl.moodLow).toBe(0)
    expect(dl.headache).toBe(0)
  })

  it('V1 import은 기존 V2 데이터를 스냅샷대로 비운다(부분 병합 아님)', async () => {
    await seedV2()
    expect(await db.stateMeasurements.count()).toBe(1)
    const v = validateImportPayload(V1_FILE)
    if (!v.ok) throw new Error('validate failed')
    await importAllData(v.payload)
    // V1 스냅샷 복원 → 기존 V2 데이터는 남지 않는다
    expect(await db.stateMeasurements.count()).toBe(0)
    expect(await db.dailyLogs.count()).toBe(1)
  })
})

describe('버전/구조 검증', () => {
  it('지원하지 않는 버전은 거부', () => {
    const r = validateImportPayload({ ...V1ish(), version: 3 })
    expect(r).toEqual({ ok: false, code: 'unsupported-version' })
  })
  it('v2인데 V2 테이블 값이 배열이 아니면 거부', () => {
    const bad = { ...V1ish(), version: 2, tables: { ...V1ish().tables, stateMeasurements: 'nope' } }
    expect(validateImportPayload(bad)).toEqual({ ok: false, code: 'invalid-structure' })
  })
})

function V1ish(): ModeExportPayload {
  return {
    app: 'MODE', version: 2, exportedAt: '2026-07-01T00:00:00.000Z',
    tables: {
      dailyLogs: [], eventLogs: [], cycleLogs: [], recoveryLogs: [], dailyScores: [], patternInsights: [], userSettings: [],
    },
  }
}
