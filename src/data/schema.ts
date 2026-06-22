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

/** 현재 DB 버전. 스키마 변경 시 새 버전을 추가하고 마이그레이션을 단다. */
export const DB_VERSION = 1

/** IndexedDB 데이터베이스 이름. */
export const DB_NAME = 'MODELocalDB'
