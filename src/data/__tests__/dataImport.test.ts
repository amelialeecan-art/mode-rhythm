import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import { DB_NAME, DB_VERSION, SCHEMA_V1 } from '../schema'
import {
  validateImportPayload,
  parseAndValidate,
  importAllData,
} from '../services/dataImportService'
import { buildExportPayload, EXPORT_FORMAT_VERSION, type ModeExportPayload } from '../services/dataExportService'
import dataImportSource from '../services/dataImportService.ts?raw'

/* -----------------------------------------------------------------
   합성 fixture — 실제 사용자 백업은 커밋하지 않는다.
   현재 version 1 export 구조를 최소 필드로 재현.
   ----------------------------------------------------------------- */
function makeDailyLog(date: string, id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    date,
    moodLow: 2, anxiety: 3, irritability: 1, sadness: 2, heaviness: 1, calm: 5, energy: 6,
    focus: 5, selfCriticism: 2, impulsivity: 1, appetite: 5, sweetCraving: 3, saltyCraving: 2,
    bingeUrge: 0, bodyDiscomfort: 1, pain: 0, bloating: 1, fatigue: 3, headache: 0, digestion: 5,
    // 대표 optional 필드 (폼 복원 메타데이터) — 왕복 보존 검증용
    stateCodes: ['tired', 'anxious'], overallIntensity: 'some',
    appetiteRatings: { appetite: 5, sweetCraving: 3 },
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
function makeEventLog(date: string, id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    date, eventCode: 'work_overload', eventLabel: '업무 과부하', category: 'work', timing: 'today',
    intensity: 5, isCustom: false, mappedFactorGroup: 'work', createdAt: '2026-07-01T00:00:00.000Z',
  }
}
function makeCycleLog(date: string, id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    date, periodStart: true, periodEnd: false, flowLevel: 'normal', periodPain: 3,
    symptoms: ['허리 묵직함'], createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
function makeRecoveryLog(date: string, id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    date, actionCode: 'walk', actionLabel: '산책', category: 'body', effect: 'little_better',
    direction: 'positive', createdAt: '2026-07-01T00:00:00.000Z',
  }
}
function makeDailyScore(date: string, id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    date, emotionalLoad: 40, appetiteLoad: 20, sleepLoad: 30, bodyLoad: 25, cycleLoad: 10,
    eventLoad: 35, rhythmLoad: 15, dayType: 'stable', confidence: 60, recoveryScore: 12,
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }
}
function makePatternInsight(id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    insightType: 'factor', targetMetric: 'emotional', factorCodes: ['work'], effectSize: 0.4,
    confidence: 55, supportCount: 6, message: '함께 나타나는 경향이 있어요', createdAt: '2026-07-01T00:00:00.000Z',
  }
}
function makeUserSettings(id?: number): Record<string, unknown> {
  return {
    ...(id !== undefined ? { id } : {}),
    cycleEnabled: true, averageCycleLength: 28, toneMode: 'witty', reminderEnabled: false,
    privacyMode: 'local', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }
}

function makePayload(overrides: Partial<ModeExportPayload['tables']> = {}): Record<string, unknown> {
  return {
    app: 'MODE',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: '2026-07-10T12:00:00.000Z',
    tables: {
      dailyLogs: [makeDailyLog('2026-07-05', 1), makeDailyLog('2026-07-06', 2)],
      eventLogs: [makeEventLog('2026-07-05', 1)],
      cycleLogs: [makeCycleLog('2026-07-05', 1)],
      recoveryLogs: [makeRecoveryLog('2026-07-05', 1)],
      dailyScores: [makeDailyScore('2026-07-05', 1), makeDailyScore('2026-07-06', 2)],
      patternInsights: [makePatternInsight(1)],
      userSettings: [makeUserSettings(1)],
      ...overrides,
    },
  }
}

// 7개 테이블 각각에 서로 식별 가능한 기존 레코드를 심는다(교체/롤백 대상).
async function seedAllTablesDistinct(): Promise<void> {
  await db.dailyLogs.bulkAdd([makeDailyLog('2000-01-01', 50)] as never)
  await db.eventLogs.bulkAdd([makeEventLog('2000-01-02', 51)] as never)
  await db.cycleLogs.bulkAdd([makeCycleLog('2000-01-03', 52)] as never)
  await db.recoveryLogs.bulkAdd([makeRecoveryLog('2000-01-04', 53)] as never)
  await db.dailyScores.bulkAdd([makeDailyScore('2000-01-05', 54)] as never)
  await db.patternInsights.bulkAdd([makePatternInsight(55)] as never)
  await db.userSettings.bulkAdd([makeUserSettings(56)] as never)
}

// 7개 테이블 전체 배열 스냅샷 (필드·id 포함 비교용).
async function snapshotAll() {
  return {
    dailyLogs: await db.dailyLogs.toArray(),
    eventLogs: await db.eventLogs.toArray(),
    cycleLogs: await db.cycleLogs.toArray(),
    recoveryLogs: await db.recoveryLogs.toArray(),
    dailyScores: await db.dailyScores.toArray(),
    patternInsights: await db.patternInsights.toArray(),
    userSettings: await db.userSettings.toArray(),
  }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('validateImportPayload — 검증 규칙', () => {
  it('1. 정상 version 1 payload는 검증 성공', () => {
    const r = validateImportPayload(makePayload())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.summary.dailyLogs).toBe(2)
      expect(r.summary.eventLogs).toBe(1)
      expect(r.summary.hasAnalysis).toBe(true)
    }
  })

  it('2. 손상 JSON은 거부 (parseAndValidate)', () => {
    const r = parseAndValidate('{ this is not json ]')
    expect(r).toEqual({ ok: false, code: 'file-read' })
  })

  it('3. 다른 app 값은 거부', () => {
    const r = validateImportPayload({ ...makePayload(), app: 'OTHERAPP' })
    expect(r).toEqual({ ok: false, code: 'not-mode' })
  })

  it('4. 미지원 version은 거부', () => {
    const r = validateImportPayload({ ...makePayload(), version: 999 })
    expect(r).toEqual({ ok: false, code: 'unsupported-version' })
  })

  it('5. 7테이블 중 하나 누락 시 거부', () => {
    const p = makePayload() as Record<string, unknown>
    delete (p.tables as Record<string, unknown>).cycleLogs
    expect(validateImportPayload(p)).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('6. 배열이 아닌 테이블은 거부', () => {
    const r = validateImportPayload(makePayload({ eventLogs: {} as never }))
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('7. 잘못된 필수 필드는 거부', () => {
    const bad = makeDailyLog('2026-07-05', 1)
    bad.moodLow = 'not-a-number'
    const r = validateImportPayload(makePayload({ dailyLogs: [bad] as never }))
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('7b. NaN/Infinity 숫자는 거부', () => {
    const bad = makeDailyLog('2026-07-05', 1)
    bad.anxiety = Number.POSITIVE_INFINITY
    // 참고: JSON.stringify는 Infinity를 null로 만들지만, 객체 검증 단계에서도 막는다.
    const r = validateImportPayload(makePayload({ dailyLogs: [bad] as never }))
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('7c. 잘못된 date 형식은 거부', () => {
    const bad = makeDailyLog('2026/07/05', 1)
    const r = validateImportPayload(makePayload({ dailyLogs: [bad] as never }))
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('8. 중복 dailyLogs date는 거부', () => {
    const r = validateImportPayload(
      makePayload({ dailyLogs: [makeDailyLog('2026-07-05', 1), makeDailyLog('2026-07-05', 2)] as never }),
    )
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('9. 중복 dailyScores date는 거부', () => {
    const r = validateImportPayload(
      makePayload({ dailyScores: [makeDailyScore('2026-07-05', 1), makeDailyScore('2026-07-05', 2)] as never }),
    )
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('10. 중복 id는 거부', () => {
    const r = validateImportPayload(
      makePayload({ eventLogs: [makeEventLog('2026-07-05', 7), makeEventLog('2026-07-06', 7)] as never }),
    )
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('11. userSettings 2개 이상은 거부', () => {
    const r = validateImportPayload(
      makePayload({ userSettings: [makeUserSettings(1), makeUserSettings(2)] as never }),
    )
    expect(r).toEqual({ ok: false, code: 'invalid-structure' })
  })

  it('id 없는 레코드(신규 생성 허용)도 검증 통과', () => {
    const r = validateImportPayload(makePayload({ dailyLogs: [makeDailyLog('2026-07-05')] as never }))
    expect(r.ok).toBe(true)
  })

  describe('exportedAt 유효 날짜 검증', () => {
    it('실제 MODE export의 ISO 값(new Date().toISOString())은 통과', () => {
      const r = validateImportPayload({ ...makePayload(), exportedAt: new Date().toISOString() })
      expect(r.ok).toBe(true)
    })

    it('명시적 ISO 문자열은 통과', () => {
      const r = validateImportPayload({ ...makePayload(), exportedAt: '2026-07-10T10:33:19.038Z' })
      expect(r.ok).toBe(true)
    })

    it('빈 문자열은 거부', () => {
      expect(validateImportPayload({ ...makePayload(), exportedAt: '' })).toEqual({ ok: false, code: 'invalid-structure' })
    })

    it('문자열이 아니면 거부', () => {
      expect(validateImportPayload({ ...makePayload(), exportedAt: 12345 })).toEqual({ ok: false, code: 'invalid-structure' })
    })

    it('파싱 불가한 값(not-a-date)은 거부', () => {
      expect(validateImportPayload({ ...makePayload(), exportedAt: 'not-a-date' })).toEqual({ ok: false, code: 'invalid-structure' })
    })

    it('불가능한 날짜(2026-99-99)는 거부', () => {
      expect(validateImportPayload({ ...makePayload(), exportedAt: '2026-99-99' })).toEqual({ ok: false, code: 'invalid-structure' })
    })
  })
})

describe('importAllData — 원자적 전체 교체', () => {
  it('12. userSettings 0개면 기본 설정을 생성', async () => {
    const v = validateImportPayload(makePayload({ userSettings: [] as never }))
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const counts = await importAllData(v.payload)
    expect(counts.userSettings).toBe(1)
    const s = await db.userSettings.toArray()
    expect(s).toHaveLength(1)
    expect(s[0].toneMode).toBe('witty') // DEFAULT_USER_SETTINGS
  })

  it('13/14. import 후 7테이블 개수·대표 레코드 일치, 기존 데이터 완전 교체', async () => {
    // 기존에 다른 데이터를 심어둔다 (교체 대상)
    await db.dailyLogs.bulkAdd([makeDailyLog('1999-01-01', 50) as never])
    expect(await db.dailyLogs.count()).toBe(1)

    const v = validateImportPayload(makePayload())
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const counts = await importAllData(v.payload)

    expect(counts).toEqual({
      dailyLogs: 2, eventLogs: 1, cycleLogs: 1, recoveryLogs: 1,
      dailyScores: 2, patternInsights: 1, userSettings: 1,
    })
    // 옛 레코드(1999)는 사라지고 백업 날짜만 남는다
    const dates = (await db.dailyLogs.toArray()).map((d) => d.date).sort()
    expect(dates).toEqual(['2026-07-05', '2026-07-06'])
    // 대표 레코드 필드 복원 확인
    const ev = await db.eventLogs.toArray()
    expect(ev[0].eventLabel).toBe('업무 과부하')
  })

  it('15. 트랜잭션 중간 실패 시 기존 7테이블 전부 보존 (필드·id까지 toEqual)', async () => {
    await seedAllTablesDistinct()
    const before = await snapshotAll()

    // recoveryLogs 처리 중 중복 id로 실패시킨다(clear + 일부 bulkAdd가 이미 실행된 뒤 시점).
    const brokenPayload = makePayload({
      recoveryLogs: [makeRecoveryLog('2026-07-05', 9), makeRecoveryLog('2026-07-06', 9)] as never,
    }) as unknown as ModeExportPayload

    await expect(importAllData(brokenPayload)).rejects.toBeTruthy()

    // 롤백되어 7개 테이블 전체가 before와 완전히 동일해야 한다.
    const after = await snapshotAll()
    expect(after.dailyLogs).toEqual(before.dailyLogs)
    expect(after.eventLogs).toEqual(before.eventLogs)
    expect(after.cycleLogs).toEqual(before.cycleLogs)
    expect(after.recoveryLogs).toEqual(before.recoveryLogs)
    expect(after.dailyScores).toEqual(before.dailyScores)
    expect(after.patternInsights).toEqual(before.patternInsights)
    expect(after.userSettings).toEqual(before.userSettings)
    expect(after).toEqual(before)
  })

  it('16. 검증 실패 시 7테이블 전체 DB 무접촉 (importAllData 미호출)', async () => {
    await seedAllTablesDistinct()
    const before = await snapshotAll()

    // 잘못된 app → 검증 실패. UI 흐름상 importAllData가 호출되지 않는다.
    const v1 = validateImportPayload({ ...makePayload(), app: 'NOPE' })
    expect(v1.ok).toBe(false)
    // 잘못된 구조(테이블 누락) → 검증 실패.
    const bad = makePayload() as Record<string, unknown>
    delete (bad.tables as Record<string, unknown>).dailyScores
    const v2 = validateImportPayload(bad)
    expect(v2.ok).toBe(false)

    // 검증만으로는 어떤 테이블도 건드리지 않는다.
    const after = await snapshotAll()
    expect(after).toEqual(before)
  })

  it('17. dailyScores/patternInsights를 재계산 없이 그대로 복원', async () => {
    const v = validateImportPayload(makePayload())
    if (!v.ok) return
    await importAllData(v.payload)
    const scores = await db.dailyScores.toArray()
    const insights = await db.patternInsights.toArray()
    // fixture에 넣은 값이 그대로 (엔진 재계산이면 confidence/message가 달라짐)
    expect(scores.find((s) => s.date === '2026-07-05')?.emotionalLoad).toBe(40)
    expect(insights[0].message).toBe('함께 나타나는 경향이 있어요')
    expect(insights[0].confidence).toBe(55)
  })

})

describe('기존 export JSON 구조 불변', () => {
  it('buildExportPayload 최상위/테이블 키와 타입이 정확하다', async () => {
    await seedAllTablesDistinct()
    const payload = await buildExportPayload()

    // 최상위 키는 정확히 4개
    expect(Object.keys(payload).sort()).toEqual(['app', 'exportedAt', 'tables', 'version'])
    // tables 키는 정확히 7개
    expect(Object.keys(payload.tables).sort()).toEqual(
      ['cycleLogs', 'dailyLogs', 'dailyScores', 'eventLogs', 'patternInsights', 'recoveryLogs', 'userSettings'].sort(),
    )
    expect(payload.app).toBe('MODE')
    expect(payload.version).toBe(EXPORT_FORMAT_VERSION)
    // exportedAt은 유효한 ISO 날짜
    expect(Number.isNaN(Date.parse(payload.exportedAt))).toBe(false)
    // 7개 값이 모두 배열
    for (const v of Object.values(payload.tables)) expect(Array.isArray(v)).toBe(true)
  })

  it('빈 DB에서도 7테이블 배열 구조를 유지한다', async () => {
    const payload = await buildExportPayload()
    expect(Object.keys(payload.tables)).toHaveLength(7)
    for (const v of Object.values(payload.tables)) expect(Array.isArray(v)).toBe(true)
  })

  it('export → validate → import → export 왕복 후 대표 optional 필드가 보존된다', async () => {
    // 1) 원본 seed → export
    await seedAllTablesDistinct()
    const first = await buildExportPayload()

    // 2) reset 후 그 export를 validate → import
    await resetDatabase()
    const v = validateImportPayload(first as unknown)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    await importAllData(v.payload)

    // 3) 다시 export → 대표 optional 필드가 살아 있어야 한다
    const second = await buildExportPayload()
    const dl = second.tables.dailyLogs[0]
    expect(dl.stateCodes).toEqual(['tired', 'anxious'])
    expect(dl.appetiteRatings).toEqual({ appetite: 5, sweetCraving: 3 })
    expect(second.tables.recoveryLogs[0].direction).toBe('positive')
    expect(second.tables.dailyScores[0].recoveryScore).toBe(12)
    expect(second.tables.patternInsights[0].effectSize).toBe(0.4)
    expect(second.tables.cycleLogs[0].symptoms).toEqual(['허리 묵직함'])
  })
})

describe('금지 사항 / 불변', () => {
  it('18. DB_NAME/DB_VERSION/SCHEMA_V1 불변', () => {
    expect(DB_NAME).toBe('MODELocalDB')
    expect(DB_VERSION).toBe(1)
    expect(Object.keys(SCHEMA_V1)).toHaveLength(7)
  })

  it('19. import 서비스가 resetDatabase를 호출하지 않는다', () => {
    const code = dataImportSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code.includes('resetDatabase')).toBe(false)
    // 재계산 엔진도 부르지 않는다
    expect(code.includes('recalculateDailyScore')).toBe(false)
    expect(code.includes('recalculatePatternInsights')).toBe(false)
  })

  it('20. EXPORT_FORMAT_VERSION은 DB_VERSION과 별개 상수다', () => {
    // 값은 같아도 개념이 분리되어 있어야 한다(별도 export)
    expect(EXPORT_FORMAT_VERSION).toBe(1)
    expect(DB_VERSION).toBe(1)
  })
})
