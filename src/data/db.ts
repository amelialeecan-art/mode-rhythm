/* =====================================================================
   MODE · Dexie 인스턴스 (로컬 우선 / 서버·계정 없음)
   이 모듈은 IndexedDB 연결만 담당한다. 비즈니스 로직/엔진과 결합하지 않는다.

   버전 이력:
   - version(1): V1 7테이블 (SCHEMA_V1).
   - version(2): N-of-1 데이터셋용 신규 테이블 추가 (SCHEMA_V2).
       · upgrade() 콜백 없음 → 기존 V1 데이터를 변환/파괴하지 않는다(비파괴).
       · version(1) 사용자는 재방문 시 자동으로 신규 테이블만 추가된 채 열린다.
   ===================================================================== */
import Dexie, { type Table } from 'dexie'
import { DB_NAME, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3 } from './schema'
import type {
  DailyLog,
  EventLog,
  CycleLog,
  RecoveryLog,
  DailyScore,
  PatternInsight,
  UserSettings,
} from './models'
import type {
  StateMeasurement,
  SleepEpisode,
  MealEpisode,
  ActivityEpisode,
  MedicationProfile,
  MedicationDose,
  HealthException,
  ScreenMetric,
  WeightMeasurement,
  Experiment,
} from './modelsV2'

export class ModeLocalDB extends Dexie {
  // V1 (version 1) — 그대로 유지
  dailyLogs!: Table<DailyLog, number>
  eventLogs!: Table<EventLog, number>
  cycleLogs!: Table<CycleLog, number>
  recoveryLogs!: Table<RecoveryLog, number>
  dailyScores!: Table<DailyScore, number>
  patternInsights!: Table<PatternInsight, number>
  userSettings!: Table<UserSettings, number>

  // V2 (version 2) — 신규 테이블
  stateMeasurements!: Table<StateMeasurement, number>
  sleepEpisodes!: Table<SleepEpisode, number>
  mealEpisodes!: Table<MealEpisode, number>
  activityEpisodes!: Table<ActivityEpisode, number>
  medicationProfiles!: Table<MedicationProfile, number>
  medicationDoses!: Table<MedicationDose, number>
  healthExceptions!: Table<HealthException, number>
  screenMetrics!: Table<ScreenMetric, number>
  weightMeasurements!: Table<WeightMeasurement, number>

  // V3 (version 3) — N-of-1 실험
  experiments!: Table<Experiment, number>

  constructor() {
    super(DB_NAME)
    // 버전을 순서대로 선언한다. Dexie가 version(1)→version(2)→version(3) 경로를 잇는다.
    this.version(1).stores(SCHEMA_V1)
    // 비파괴: 신규 테이블만 추가, upgrade 콜백 없음(기존 데이터 변환/삭제 안 함).
    this.version(2).stores(SCHEMA_V2)
    this.version(3).stores(SCHEMA_V3)
  }
}

/** 앱 전역에서 공유하는 단일 DB 인스턴스. */
export const db = new ModeLocalDB()

/** V1 테이블 핸들 이름. (하위호환 export/import는 이 목록만 다룬다) */
export const V1_TABLES = [
  'dailyLogs',
  'eventLogs',
  'cycleLogs',
  'recoveryLogs',
  'dailyScores',
  'patternInsights',
  'userSettings',
] as const

/** V2 신규 테이블 핸들 이름. */
export const V2_TABLES = [
  'stateMeasurements',
  'sleepEpisodes',
  'mealEpisodes',
  'activityEpisodes',
  'medicationProfiles',
  'medicationDoses',
  'healthExceptions',
  'screenMetrics',
  'weightMeasurements',
  'experiments',
] as const

/** 모든 테이블 핸들 (seed/reset에서 일괄 처리용). */
export const ALL_TABLES = [...V1_TABLES, ...V2_TABLES] as const
