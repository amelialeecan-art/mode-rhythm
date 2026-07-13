/* =====================================================================
   MODE · 데이터 가져오기 (JSON 백업 → 로컬 복원)
   구버전 앱에서 내보낸 JSON을 최신 설치본으로 안전하게 복원한다.

   설계 원칙:
   - DB를 건드리기 전에 전체 payload를 순수 함수로 검증한다.
   - 검증 통과 시에만 단일 Dexie 트랜잭션에서 7개 테이블을 원자적으로 교체한다.
   - 하나라도 실패하면 clear 포함 모든 변경이 롤백되어 기존 기록이 그대로 남는다.
   - 재계산/분석 엔진을 호출하지 않는다 — JSON 값을 그대로 복원한다.
   - resetDatabase는 사용하지 않는다.
   ⚠️ 사용자의 기록 원문(감정/사건 등)을 console/오류 메시지에 노출하지 않는다.
   ===================================================================== */
import { db } from '../db'
import { DEFAULT_USER_SETTINGS } from '../models'
import { EXPORT_FORMAT_VERSION, type ModeExportPayload } from './dataExportService'

/** 가져오기 실패 사유 코드 — 사용자 메시지는 UI에서 매핑한다(원문 미노출). */
export type ImportErrorCode =
  | 'file-read' // 파일을 읽을 수 없어요 (I/O 또는 JSON 파싱 실패)
  | 'too-large' // 파일이 너무 커요
  | 'not-mode' // MODE 백업 파일이 아니에요
  | 'unsupported-version' // 이 버전의 백업은 아직 지원하지 않아요
  | 'invalid-structure' // 백업 파일이 손상됐거나 형식이 달라요
  | 'backup-failed' // 현재 데이터 백업을 만들지 못해 중단
  | 'import-failed' // 교체 도중 실패 (기존 기록 유지)

/** 파일 크기 상한 (모바일 안전용). */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024 // 20MB

/** 백업 요약 — 확인 화면 표시용. */
export interface ImportSummary {
  exportedAt: string
  dailyLogs: number
  eventLogs: number
  cycleLogs: number
  recoveryLogs: number
  hasAnalysis: boolean // dailyScores 또는 patternInsights 포함 여부
}

export type ImportValidation =
  | { ok: true; payload: ModeExportPayload; summary: ImportSummary }
  | { ok: false; code: ImportErrorCode }

/* ---------------------------------------------------------------------
   타입 가드 헬퍼 (순수)
   --------------------------------------------------------------------- */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
function isISODateStr(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE_RE.test(v)
}

type FieldKind = 'num' | 'str' | 'bool' | 'strArray' | 'date'

// 각 테이블의 "필수 필드"만 검증한다. optional 필드는 아래 공통 검사(유한 숫자/배열/id)로만 확인해
// 정상 version 1 백업이 optional 때문에 거부되지 않게 한다.
const TABLE_REQUIRED: Record<keyof ModeExportPayload['tables'], Record<string, FieldKind>> = {
  dailyLogs: {
    date: 'date', moodLow: 'num', anxiety: 'num', irritability: 'num', sadness: 'num', heaviness: 'num',
    calm: 'num', energy: 'num', focus: 'num', selfCriticism: 'num', impulsivity: 'num', appetite: 'num',
    sweetCraving: 'num', saltyCraving: 'num', bingeUrge: 'num', bodyDiscomfort: 'num', pain: 'num',
    bloating: 'num', fatigue: 'num', headache: 'num', digestion: 'num', createdAt: 'str', updatedAt: 'str',
  },
  eventLogs: {
    date: 'date', eventCode: 'str', eventLabel: 'str', category: 'str', timing: 'str', intensity: 'num',
    isCustom: 'bool', mappedFactorGroup: 'str', createdAt: 'str',
  },
  cycleLogs: {
    date: 'date', periodStart: 'bool', periodEnd: 'bool', createdAt: 'str', updatedAt: 'str',
  },
  recoveryLogs: {
    date: 'date', actionCode: 'str', actionLabel: 'str', category: 'str', effect: 'str', createdAt: 'str',
  },
  dailyScores: {
    date: 'date', emotionalLoad: 'num', appetiteLoad: 'num', sleepLoad: 'num', bodyLoad: 'num',
    cycleLoad: 'num', eventLoad: 'num', rhythmLoad: 'num', dayType: 'str', createdAt: 'str', updatedAt: 'str',
  },
  patternInsights: {
    insightType: 'str', targetMetric: 'str', factorCodes: 'strArray', message: 'str', createdAt: 'str',
  },
  userSettings: {
    cycleEnabled: 'bool', toneMode: 'str', reminderEnabled: 'bool', privacyMode: 'str',
    createdAt: 'str', updatedAt: 'str',
  },
}

const TABLE_NAMES = Object.keys(TABLE_REQUIRED) as (keyof ModeExportPayload['tables'])[]

function checkField(value: unknown, kind: FieldKind): boolean {
  switch (kind) {
    case 'num': return isFiniteNumber(value)
    case 'str': return typeof value === 'string'
    case 'bool': return typeof value === 'boolean'
    case 'date': return isISODateStr(value)
    case 'strArray': return Array.isArray(value) && value.every((s) => typeof s === 'string')
  }
}

/** 레코드 1건 검증 — 필수 필드 타입 + id(있으면 양의 정수) + 모든 숫자값 유한. */
function isValidRecord(rec: unknown, required: Record<string, FieldKind>): rec is Record<string, unknown> {
  if (!isPlainObject(rec)) return false
  for (const [key, kind] of Object.entries(required)) {
    if (!checkField(rec[key], kind)) return false
  }
  // id는 있으면 양의 정수여야 한다.
  if ('id' in rec && rec.id !== undefined) {
    if (typeof rec.id !== 'number' || !Number.isInteger(rec.id) || rec.id <= 0) return false
  }
  // optional 포함 모든 숫자 필드는 NaN/Infinity가 아니어야 한다.
  for (const v of Object.values(rec)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return false
  }
  return true
}

/** 같은 테이블 안에서 명시적 id 중복 여부. */
function hasDuplicateIds(rows: Record<string, unknown>[]): boolean {
  const seen = new Set<number>()
  for (const r of rows) {
    if (typeof r.id === 'number') {
      if (seen.has(r.id)) return true
      seen.add(r.id)
    }
  }
  return false
}

/** date 필드 중복 여부(dailyLogs/dailyScores는 date unique). */
function hasDuplicateDates(rows: Record<string, unknown>[]): boolean {
  const seen = new Set<string>()
  for (const r of rows) {
    const d = r.date
    if (typeof d === 'string') {
      if (seen.has(d)) return true
      seen.add(d)
    }
  }
  return false
}

/* ---------------------------------------------------------------------
   검증 (DB 무접촉, 순수 함수)
   --------------------------------------------------------------------- */
export function validateImportPayload(raw: unknown): ImportValidation {
  if (!isPlainObject(raw)) return { ok: false, code: 'invalid-structure' }
  if (raw.app !== 'MODE') return { ok: false, code: 'not-mode' }
  if (raw.version !== EXPORT_FORMAT_VERSION) return { ok: false, code: 'unsupported-version' }
  if (typeof raw.exportedAt !== 'string' || raw.exportedAt.length === 0) {
    return { ok: false, code: 'invalid-structure' }
  }
  if (!isPlainObject(raw.tables)) return { ok: false, code: 'invalid-structure' }

  const tables = raw.tables
  // 7개 테이블이 모두 배열로 존재해야 한다.
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(tables[name])) return { ok: false, code: 'invalid-structure' }
  }

  // 레코드별 검증 + 중복 규칙.
  for (const name of TABLE_NAMES) {
    const rows = tables[name] as unknown[]
    const required = TABLE_REQUIRED[name]
    for (const rec of rows) {
      if (!isValidRecord(rec, required)) return { ok: false, code: 'invalid-structure' }
    }
    const typedRows = rows as Record<string, unknown>[]
    if (hasDuplicateIds(typedRows)) return { ok: false, code: 'invalid-structure' }
    if ((name === 'dailyLogs' || name === 'dailyScores') && hasDuplicateDates(typedRows)) {
      return { ok: false, code: 'invalid-structure' }
    }
  }

  // userSettings는 0개 또는 1개만 허용.
  const settings = tables.userSettings as unknown[]
  if (settings.length > 1) return { ok: false, code: 'invalid-structure' }

  // 검증 통과 — 이 시점부터 안전한 payload로 취급.
  const payload = raw as unknown as ModeExportPayload
  const t = payload.tables
  return {
    ok: true,
    payload,
    summary: {
      exportedAt: payload.exportedAt,
      dailyLogs: t.dailyLogs.length,
      eventLogs: t.eventLogs.length,
      cycleLogs: t.cycleLogs.length,
      recoveryLogs: t.recoveryLogs.length,
      hasAnalysis: t.dailyScores.length > 0 || t.patternInsights.length > 0,
    },
  }
}

/** 텍스트를 파싱 후 검증. JSON 파싱 실패는 file-read로 매핑(원문 미노출). */
export function parseAndValidate(text: string): ImportValidation {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, code: 'file-read' }
  }
  return validateImportPayload(raw)
}

/* ---------------------------------------------------------------------
   원자적 전체 교체 (검증된 payload 전제)
   --------------------------------------------------------------------- */
export interface ImportResultCounts {
  dailyLogs: number
  eventLogs: number
  cycleLogs: number
  recoveryLogs: number
  dailyScores: number
  patternInsights: number
  userSettings: number
}

/**
 * 검증된 payload로 7개 테이블을 단일 트랜잭션에서 교체한다.
 * - clear 후 bulkAdd(레코드 id는 있으면 보존, 없으면 Dexie 생성)
 * - userSettings가 0개면 같은 트랜잭션 안에서 기본 설정을 생성한다.
 * - 트랜잭션 내부에서 개수 일치를 검증하고, 불일치/예외 시 전체 롤백된다.
 * 이 함수는 재계산/분석 엔진을 호출하지 않는다.
 */
export async function importAllData(payload: ModeExportPayload): Promise<ImportResultCounts> {
  const t = payload.tables
  return db.transaction(
    'rw',
    [db.dailyLogs, db.eventLogs, db.cycleLogs, db.recoveryLogs, db.dailyScores, db.patternInsights, db.userSettings],
    async () => {
      await Promise.all([
        db.dailyLogs.clear(),
        db.eventLogs.clear(),
        db.cycleLogs.clear(),
        db.recoveryLogs.clear(),
        db.dailyScores.clear(),
        db.patternInsights.clear(),
        db.userSettings.clear(),
      ])

      await db.dailyLogs.bulkAdd(t.dailyLogs)
      await db.eventLogs.bulkAdd(t.eventLogs)
      await db.cycleLogs.bulkAdd(t.cycleLogs)
      await db.recoveryLogs.bulkAdd(t.recoveryLogs)
      await db.dailyScores.bulkAdd(t.dailyScores)
      await db.patternInsights.bulkAdd(t.patternInsights)
      await db.userSettings.bulkAdd(t.userSettings)

      // 설정 없이 남지 않도록 같은 트랜잭션 안에서 기본 설정 생성.
      if (t.userSettings.length === 0) {
        const now = new Date().toISOString()
        await db.userSettings.add({ ...DEFAULT_USER_SETTINGS, createdAt: now, updatedAt: now })
      }

      const counts: ImportResultCounts = {
        dailyLogs: await db.dailyLogs.count(),
        eventLogs: await db.eventLogs.count(),
        cycleLogs: await db.cycleLogs.count(),
        recoveryLogs: await db.recoveryLogs.count(),
        dailyScores: await db.dailyScores.count(),
        patternInsights: await db.patternInsights.count(),
        userSettings: await db.userSettings.count(),
      }

      // 개수 검증 — 하나라도 어긋나면 throw → 전체 롤백.
      const expectedSettings = t.userSettings.length === 0 ? 1 : t.userSettings.length
      const okCounts =
        counts.dailyLogs === t.dailyLogs.length &&
        counts.eventLogs === t.eventLogs.length &&
        counts.cycleLogs === t.cycleLogs.length &&
        counts.recoveryLogs === t.recoveryLogs.length &&
        counts.dailyScores === t.dailyScores.length &&
        counts.patternInsights === t.patternInsights.length &&
        counts.userSettings === expectedSettings
      if (!okCounts) throw new Error('import-count-mismatch')

      return counts
    },
  )
}
