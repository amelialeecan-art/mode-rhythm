/* =====================================================================
   MODE · 저장 모델 (Phase 2 · IndexedDB/Dexie)
   여기는 "저장 계층"의 타입이다. 화면 표시용 타입(types.ts)과 별개로,
   명세의 7개 테이블 스키마를 그대로 따른다.
   이 파일은 순수 타입만 — 계산/엔진 로직 없음.
   ===================================================================== */
import type { ISODate } from './types'

export type { ISODate }

/* ---------------------------------------------------------------------
   공통
   --------------------------------------------------------------------- */

/** dailyScores.dayType 코드 (저장용). 표시명/모찌 매핑은 후속 단계에서 연결. */
export type DayTypeCode =
  | 'stable'
  | 'focus'
  | 'emotion_sensitive'
  | 'appetite_shift'
  | 'body_load'
  | 'social_fatigue'
  | 'impulse_caution'
  | 'recovery_priority'
  | 'unknown_cause'
  | 'mixed_load'

/** eventLogs.category (custom 포함). */
export type EventLogCategory =
  | 'sleep'
  | 'food'
  | 'relationship'
  | 'work'
  | 'body'
  | 'appearance'
  | 'environment'
  | 'digital'
  | 'movement'
  | 'control'
  | 'unknown'
  | 'custom'

/** 사건이 언제 일어났는지. */
export type EventTiming = 'today' | 'yesterday' | 'recent3days' | 'recent7days'

/** recoveryLogs.category. */
export type RecoveryLogCategory = 'body' | 'emotional' | 'relationship' | 'reality' | 'custom'

/** 회복 행동 효과. */
export type RecoveryEffectValue = 'much_better' | 'little_better' | 'same' | 'worse' | 'unknown'

/** 회복 행동과 재측정 사이 시간 간격. */
export type RecoveryTimeGap = 'immediate' | '30m' | '2h' | 'next_day'

/** 출혈량. */
export type FlowLevel = 'none' | 'light' | 'normal' | 'heavy'

/** patternInsights.insightType. */
export type InsightType = 'factor' | 'combo' | 'recovery' | 'unknown' | 'forecast'

/** patternInsights.targetMetric. */
export type TargetMetric =
  | 'emotional'
  | 'appetite'
  | 'sleep'
  | 'body'
  | 'cycle'
  | 'event'
  | 'rhythm'
  | 'recovery'

/** 톤 모드 (저장값). */
export type ToneModeValue = 'calm' | 'witty' | 'direct'

/* ---------------------------------------------------------------------
   1) dailyLogs — 하루 상태 (강도값 0~10). 하루 1행(date unique).
   --------------------------------------------------------------------- */
export interface DailyLog {
  id?: number
  date: ISODate
  moodLow: number
  anxiety: number
  irritability: number
  sadness: number
  heaviness: number
  calm: number
  energy: number
  focus: number
  selfCriticism: number
  impulsivity: number
  appetite: number
  sweetCraving: number
  saltyCraving: number
  bingeUrge: number
  /** 수면시간(시간). 숫자형 수면은 dailyLogs에. 사건성 수면은 eventLogs. */
  sleepHours?: number
  /** 수면질 0~10. */
  sleepQuality?: number
  bodyDiscomfort: number
  pain: number
  bloating: number
  fatigue: number
  headache: number
  digestion: number
  memo?: string
  /**
   * 폼 복원용 메타데이터 (비인덱스 optional — Dexie 스키마/인덱스 변경 없음).
   * 저장한 날짜를 다시 열었을 때 "오늘 상태" 칩/식욕 입력을 그대로 복원하기 위함.
   * 이게 없으면 재저장 시 숫자값이 0으로 덮어써지는 문제가 생긴다.
   */
  stateCodes?: string[]
  overallIntensity?: string
  appetiteRatings?: AppetiteRatings
  /** 기름진 음식 욕구 0~10 (비인덱스 optional — 기록용, 점수 공식 미포함). */
  greasyCraving?: number
  createdAt: string
  updatedAt: string
}

/** 식욕 상태 섹션 직접 입력값(있으면 state preset보다 우선). 각 0/3/5/7/9. */
export interface AppetiteRatings {
  appetite?: number
  sweetCraving?: number
  saltyCraving?: number
  bingeUrge?: number
  /** 기름진 음식 욕구. 기록/복원용 — appetiteLoad 공식에는 아직 미포함(엔진 유지). */
  greasyCraving?: number
}

/* ---------------------------------------------------------------------
   2) eventLogs — "오늘 있었던 일" (사건/상황 기록, 원인 추측 아님).
   하루 여러 개 가능. 생리/주기는 절대 여기 넣지 않는다.
   --------------------------------------------------------------------- */
export interface EventLog {
  id?: number
  date: ISODate
  eventCode: string
  eventLabel: string
  category: EventLogCategory
  timing: EventTiming
  intensity: number // 0~10
  isCustom: boolean
  customLabel?: string
  mappedFactorGroup: string
  createdAt: string
}

/* ---------------------------------------------------------------------
   3) cycleLogs — 생리 관련 "사실" 기록. (자동 계산은 후속 단계 engine/cycle)
   --------------------------------------------------------------------- */
export interface CycleLog {
  id?: number
  date: ISODate
  periodStart: boolean
  periodEnd: boolean
  flowLevel?: FlowLevel
  periodPain?: number // 0~10
  symptoms?: string[]
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   4) recoveryLogs — 회복 행동 기록. 하루 여러 개 가능.
   --------------------------------------------------------------------- */
export interface RecoveryLog {
  id?: number
  date: ISODate
  actionCode: string
  actionLabel: string
  category: RecoveryLogCategory
  beforeMood?: number
  afterMood?: number
  beforeAnxiety?: number
  afterAnxiety?: number
  beforeAppetite?: number
  afterAppetite?: number
  beforeBodyLoad?: number
  afterBodyLoad?: number
  effect: RecoveryEffectValue
  timeGap?: RecoveryTimeGap
  memo?: string
  /**
   * 회복 방향 (비인덱스 optional). 'positive'=도움 된 것, 'negative'=오히려 안 맞았던 것.
   * 같은 행동이 날에 따라 다른 방향으로 기록될 수 있다. 없으면 positive로 간주(옛 기록).
   */
  direction?: 'positive' | 'negative'
  createdAt: string
}

/* ---------------------------------------------------------------------
   5) dailyScores — 엔진이 계산한 하루 점수 (이번 단계는 구조만). date unique.
   --------------------------------------------------------------------- */
export interface DailyScore {
  id?: number
  date: ISODate
  emotionalLoad: number // 0~100
  appetiteLoad: number
  sleepLoad: number
  bodyLoad: number
  cycleLoad: number
  eventLoad: number
  rhythmLoad: number
  recoveryScore?: number
  dayType: DayTypeCode
  dayTypeSubLabel?: string
  confidence?: number // 0~100
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   6) patternInsights — 분석 결과 (이번 단계는 구조만).
   message에는 단정 문구를 넣지 않는다(후속 단계에서 copy guard와 연결).
   --------------------------------------------------------------------- */
export interface PatternInsight {
  id?: number
  insightType: InsightType
  targetMetric: TargetMetric
  factorCodes: string[]
  effectSize?: number
  confidence?: number
  supportCount?: number
  message: string
  createdAt: string
}

/* ---------------------------------------------------------------------
   7) userSettings — 사용자 설정 (단일 행).
   --------------------------------------------------------------------- */
export interface UserSettings {
  id?: number
  cycleEnabled: boolean
  averageCycleLength?: number
  toneMode: ToneModeValue
  reminderEnabled: boolean
  privacyMode: 'local'
  createdAt: string
  updatedAt: string
}

/** userSettings MVP 기본값 (id/timestamps 제외). */
export const DEFAULT_USER_SETTINGS: Omit<UserSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  cycleEnabled: true,
  averageCycleLength: 28,
  toneMode: 'witty',
  reminderEnabled: false,
  privacyMode: 'local',
}

/* ---------------------------------------------------------------------
   Repository 입력 타입 — id/timestamps는 repository가 채운다.
   --------------------------------------------------------------------- */
export type DailyLogInput = Omit<DailyLog, 'id' | 'createdAt' | 'updatedAt'>
export type EventLogInput = Omit<EventLog, 'id' | 'createdAt'>
export type CycleLogInput = Omit<CycleLog, 'id' | 'createdAt' | 'updatedAt'>
export type RecoveryLogInput = Omit<RecoveryLog, 'id' | 'createdAt'>
export type DailyScoreInput = Omit<DailyScore, 'id' | 'createdAt' | 'updatedAt'>
export type PatternInsightInput = Omit<PatternInsight, 'id' | 'createdAt'>
