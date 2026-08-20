/* =====================================================================
   MODE · Dexie 스키마 정의 (버전별 인덱스)
   '&' = unique 인덱스. '++id' = auto-increment 기본키.
   인덱스는 날짜 기반 조회 + 분석에서 자주 쓰는 키 중심.
   ===================================================================== */

/** 스키마 v1: 7개 테이블. */
export const SCHEMA_V1: Record<string, string> = {
  dailyLogs: '++id, &date',
  eventLogs: '++id, date, eventCode, category, mappedFactorGroup',
  cycleLogs: '++id, date',
  recoveryLogs: '++id, date, actionCode, category',
  dailyScores: '++id, &date, dayType',
  patternInsights: '++id, insightType, targetMetric, confidence, createdAt',
  userSettings: '++id',
}

/**
 * 스키마 v2: V1 7테이블은 그대로 두고, N-of-1 데이터셋용 신규 테이블만 추가한다.
 * Dexie의 version(2).stores()는 델타로 동작한다 — 여기 없는 V1 테이블은 그대로 유지되고,
 * upgrade() 콜백을 두지 않으므로 기존 데이터를 변환/파괴하지 않는다(비파괴 마이그레이션).
 *
 * 인덱스 설계 메모:
 * - stateMeasurements의 morning/evening "하루 1개" 규칙은 DB unique로 걸지 않는다.
 *   같은 날 adhoc은 여러 개 공존해야 하므로 &[localDate+checkInType] unique는 위험하다.
 *   대신 조회용 비유니크 복합 인덱스만 두고, upsert 단일성은 repository가 강제한다.
 * - 나머지 episode 테이블도 하루 여러 행을 허용하므로 date에 unique를 걸지 않는다.
 */
export const SCHEMA_V2: Record<string, string> = {
  stateMeasurements: '++id, localDate, recordedAt, checkInType, [localDate+checkInType]',
  sleepEpisodes: '++id, localDate, wakeAt',
  mealEpisodes: '++id, localDate, startedAt',
  activityEpisodes: '++id, localDate, startedAt',
  medicationProfiles: '++id, name, active',
  medicationDoses: '++id, medicationId, localDate, takenAt',
  healthExceptions: '++id, localDate, category, occurredAt',
  screenMetrics: '++id, localDate',
  weightMeasurements: '++id, localDate, measuredAt',
}

/** 현재 DB 버전. 스키마 변경 시 새 버전을 추가하고 마이그레이션을 단다. */
export const DB_VERSION = 2

/** IndexedDB 데이터베이스 이름. */
export const DB_NAME = 'MODELocalDB'
