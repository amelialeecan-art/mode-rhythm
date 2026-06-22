/* =====================================================================
   MODE · Dexie 인스턴스 (로컬 우선 / 서버·계정 없음)
   이 모듈은 IndexedDB 연결만 담당한다. 비즈니스 로직/엔진과 결합하지 않는다.
   ===================================================================== */
import Dexie, { type Table } from 'dexie'
import { DB_NAME, SCHEMA_V1 } from './schema'
import type {
  DailyLog,
  EventLog,
  CycleLog,
  RecoveryLog,
  DailyScore,
  PatternInsight,
  UserSettings,
} from './models'

export class ModeLocalDB extends Dexie {
  dailyLogs!: Table<DailyLog, number>
  eventLogs!: Table<EventLog, number>
  cycleLogs!: Table<CycleLog, number>
  recoveryLogs!: Table<RecoveryLog, number>
  dailyScores!: Table<DailyScore, number>
  patternInsights!: Table<PatternInsight, number>
  userSettings!: Table<UserSettings, number>

  constructor() {
    super(DB_NAME)
    this.version(1).stores(SCHEMA_V1)
  }
}

/** 앱 전역에서 공유하는 단일 DB 인스턴스. */
export const db = new ModeLocalDB()

/** 모든 테이블 핸들 (seed/reset에서 일괄 처리용). */
export const ALL_TABLES = [
  'dailyLogs',
  'eventLogs',
  'cycleLogs',
  'recoveryLogs',
  'dailyScores',
  'patternInsights',
  'userSettings',
] as const
