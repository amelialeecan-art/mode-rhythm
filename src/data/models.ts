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

/**
 * 사건이 언제 일어났는지.
 * - today/yesterday/exact: 정확한 발생일이 정해진다(분석에 사용 가능).
 * - recent3days/recent7days: 옛 기록 호환용으로만 남긴다. 새 입력 UI에서는 고르지 않으며,
 *   정확한 날짜가 없어 정밀 분석에서는 제외된다(삭제 금지 — 읽기 호환).
 */
export type EventTiming = 'today' | 'yesterday' | 'recent3days' | 'recent7days' | 'exact'

/** 여러 날 이어진 사건의 지속기간(발생 시점과 별개). 하루 / 2~3일 / 4일 이상. */
export type EventDuration = 'single' | 'few' | 'extended'

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

/** 몸 에너지 직접 입력. 상태 칩에서 추정하지 않고 이 값이 있으면 우선한다. */
export type BodyEnergyLevel = 'charged' | 'okay' | 'low' | 'empty'

/** 머릿속 여유 직접 입력. */
export type MentalSpaceLevel = 'spacious' | 'okay' | 'busy' | 'overloaded'

/** 그날의 생활 맥락. 요일과 생활 유형을 구분하기 위한 사실 기록. */
export type DayContextCode = 'office' | 'remote' | 'off' | 'special'

/** 구체적인 오늘의 몸 신호. */
export type BodySignalCode =
  | 'heavy_body'
  | 'head_eye_fatigue'
  | 'neck_shoulder_tension'
  | 'bloating_digestive'
  | 'period_cramps'
  | 'malaise'
  | 'none'

/** 평소 리듬과 분리해 볼 예외 상태. */
export type RhythmExceptionCode =
  | 'illness'
  | 'injury'
  | 'medication_change'
  | 'vaccination'
  | 'hangover'
  | 'none'

/** 감정 안정감(단일 선택). 안정↔흔들림을 하나의 축으로 본다. */
export type EmotionalStabilityLevel =
  | 'very_stable'
  | 'mostly_stable'
  | 'slightly_shaken'
  | 'quite_shaken'
  | 'mostly_shaken'

/** 두드러진 감정(복수 선택). 안정감과 상호배타가 아니다. */
export type EmotionCode =
  | 'sensitive'
  | 'irritated'
  | 'angry'
  | 'anxious'
  | 'down'
  | 'tearful'
  | 'lethargic'
  | 'other'

/** 두드러진 감정이 하루에 준 영향 정도(감정을 하나 이상 고른 날에만). */
export type EmotionImpactLevel = 'passing' | 'brief' | 'repeated' | 'most_day'

/** 집중 가능 정도(단일 선택). */
export type FocusLevel = 'well' | 'mostly' | 'often_scattered' | 'rarely'

/** 사람을 대할 여유(단일 선택). 사회 피로/혼자 있음과 다른 '현재 상태' 축. */
export type SocialCapacityLevel = 'enough' | 'okay' | 'low' | 'rarely'

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
  /**
   * 지난밤 수면 (비인덱스 optional — Dexie 스키마/인덱스 변경 없음).
   * "깨어난 날짜"(=이 dailyLog의 date)에 귀속한다. timing을 묻지 않는다.
   * 신규 기록의 수면 단일 출처 — sleep 사건(eventLogs)과 이중 가산하지 않는다.
   * 없는 옛 기록은 기존 sleep 사건에서 읽는다(scoring의 단일 출처 규칙).
   */
  lastNightSleep?: LastNightSleep
  /**
   * 오늘 일상 기능 (비인덱스 optional — 3단계). 사용자가 직접 고르는 기능 저하 라벨이며
   * 의료 진단이 아니다. 전체 부하 점수에는 직접 합산하지 않지만 최근·장기 흐름 분석에 사용한다.
   * 1 유지됨 / 2 버거웠지만 할 일은 함 / 3 중요한 것 몇 개를 못 함 / 4 거의 멈춤·무너짐.
   */
  functionLevel?: FunctionLevel
  /** 기능 저하 항목 코드들 (level 3·4에서만). */
  functionImpactCodes?: string[]
  /** 기능 저하 직접 추가 자유 입력 (level 3·4에서만). */
  functionImpactCustom?: string[]
  /** 무너짐 시작 시점 코드 (level 3·4에서만). */
  functionDropOnset?: string
  /** 몸 에너지·머릿속 여유·생활 맥락 직접 입력(비인덱스 optional). */
  bodyEnergyLevel?: BodyEnergyLevel
  mentalSpaceLevel?: MentalSpaceLevel
  dayContext?: DayContextCode
  /** 구체적인 몸 신호와 평소 리듬 예외(비인덱스 optional). */
  bodySignalCodes?: BodySignalCode[]
  rhythmExceptionCodes?: RhythmExceptionCode[]
  /**
   * 감정 안정감·두드러진 감정·영향 정도·집중력·사람 대할 여유 직접 입력
   * (비인덱스 optional — 스키마/인덱스 변경 없음). 옛 stateCodes와 의미를 합치지 않는다.
   */
  emotionalStabilityLevel?: EmotionalStabilityLevel
  emotionCodes?: EmotionCode[]
  emotionImpactLevel?: EmotionImpactLevel
  focusLevel?: FocusLevel
  socialCapacityLevel?: SocialCapacityLevel
  createdAt: string
  updatedAt: string
}

/** 일상 기능 단계 (1~4). */
export type FunctionLevel = 1 | 2 | 3 | 4

/** 지난밤 수면 입력값. issues 코드는 기존 sleep eventCode와 동일하게 유지(호환). */
export interface LastNightSleep {
  /** 대표 수면시간(시간). 구간 선택 → 대표값. */
  hours?: number
  /** 수면 만족도/질 0~10. */
  quality?: number
  /** 수면 이슈 코드: sleep_late/sleep_waking/sleep_nightmare/sleep_allnight/sleep_much/woke_late. */
  issues?: string[]
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
  /** timing='exact'일 때의 정확한 발생일 (비인덱스 optional — 스키마/마이그레이션 변경 없음). */
  occurredOn?: ISODate
  /** 여러 날 이어진 사건의 지속기간 (비인덱스 optional). 미입력=undefined. */
  durationDays?: EventDuration
  /**
   * 무너짐(기능 저하 큰 날)에서만, 이 사건이 상태 악화의 전/후 어디에 있었는지 (비인덱스 optional — 3단계).
   * today 사건에만 부여한다. 옛 기록/미분류는 undefined(=unknown으로 간주).
   */
  relationToShift?: EventRelationToShift
  createdAt: string
}

/** 사건의 상태 악화 대비 선후관계. */
export type EventRelationToShift = 'before' | 'after' | 'both' | 'unknown'

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
