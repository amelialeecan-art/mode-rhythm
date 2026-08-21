/* =====================================================================
   MODE · V2 저장 모델 (N-of-1 개인 건강 데이터셋)
   docs/N-OF-1-DATASET-PLAN.md 의 데이터 설계를 타입으로 확정한다.

   설계 원칙 (불변):
   - 0 / null / unknown 을 절대 섞지 않는다.
       · 0        = 측정했고 증상이 전혀 없음
       · null     = 측정 안 함 (필드 없음/미입력)
       · 'unknown'= 측정 시도했으나 판단 불가
   - "안 물어본 것"과 "물어봤는데 0"을 구분한다 (promptedMetrics).
   - 시각은 가능하면 absolute ISO datetime(recordedAt/*At)으로 저장하고,
     localDate + timezone provenance 를 함께 유지한다.
   - 이 파일은 순수 타입/상수만 — 계산/엔진/Dexie 로직 없음.

   ⚠️ 이 단계에서 V1(dailyLogs 등 7테이블)을 파괴하거나 StateMeasurement로
      자동 변환하지 않는다. V1의 애매한 0을 "실제 0"으로 재해석하지 않는다.
   ===================================================================== */
import type { ISODate } from './types'

/* ---------------------------------------------------------------------
   공통 V2 원시 타입
   --------------------------------------------------------------------- */

/** 데이터 출처(provenance). 분석기가 신뢰도/처리방식을 달리하기 위한 근거. */
export type DataSource =
  | 'manual' // 사용자가 직접 입력
  | 'healthkit' // 향후 iOS/native 자동 연동 (지금 웹 PWA는 직접 읽지 않음)
  | 'import' // 백업 JSON 복원
  | 'derived' // 앱이 다른 값에서 계산 (예: 수면시간)
  | 'legacy' // V1 기록에서 유래

/**
 * rating 값. 반드시 셋 중 하나:
 * - number: 0~10 정수 (validation은 v2Validation.ts)
 * - 'unknown': 측정했으나 모름
 * - null: 측정 안 함
 * 0으로 임의 보정하지 않는다.
 */
export type RatingValue = number | 'unknown' | null

/** boolean 사실값도 0/null/unknown과 같은 삼분 원칙을 따른다. */
export type TriBoolean = boolean | 'unknown' | null

/**
 * V2 레코드에 찍는 스키마 버전(레코드 형태 버전). DB_VERSION·EXPORT_FORMAT_VERSION과 별개.
 * 레코드 형태가 실제로 바뀔 때만 올린다.
 */
export const V2_SCHEMA_VERSION = 1

/* ---------------------------------------------------------------------
   코어 12 metric — core schema version 내에서 이름 불변
   --------------------------------------------------------------------- */

/**
 * 고정 코어 지표 12개. 이 이름들은 CORE_METRICS_SCHEMA_VERSION 내에서 바꾸지 않는다.
 * 순서도 입력/표시의 기준이 되므로 유지한다.
 */
export const CORE_METRICS = [
  'moodLow',
  'anxiety',
  'irritability',
  'energy',
  'focus',
  'impulsivity',
  'physicalHunger',
  'craving',
  'bingeUrge',
  'fatigueHeaviness',
  'bloating',
  'painDiscomfort',
] as const

export type CoreMetric = (typeof CORE_METRICS)[number]

/** 코어 metric 이름 스키마 버전. 이름 집합을 바꾸면 올린다(마이그레이션 신호). */
export const CORE_METRICS_SCHEMA_VERSION = 1

/** metric 값 묶음. 안 물어본 metric은 여기 존재하지 않는다(0으로 채우지 않는다). */
export type CoreMetricValues = Partial<Record<CoreMetric, RatingValue>>

/* ---------------------------------------------------------------------
   1) StateMeasurement — 하루 여러 번 상태 측정 (State)
   --------------------------------------------------------------------- */

/** 측정 시점 유형. morning/evening은 하루 1개씩 upsert, adhoc은 여러 개 공존. */
export type CheckInType = 'morning' | 'evening' | 'adhoc'

export interface StateMeasurement {
  id?: number
  /** 이 측정이 귀속되는 로컬 날짜(YYYY-MM-DD). */
  localDate: ISODate
  /** 실제 기록 시각 (absolute ISO datetime). */
  recordedAt: string
  /** timezone provenance — recordedAt 해석의 근거. UTC 대비 분(예: KST=+540). */
  timezoneOffsetMinutes: number
  checkInType: CheckInType
  /**
   * 이 체크인에서 실제로 "물어본" metric 목록.
   * metrics에 값이 없어도 여기 있으면 "물어봤는데 답 없음(null)",
   * 여기 없으면 "애초에 안 물어봄"으로 분석기가 구분한다.
   */
  promptedMetrics: CoreMetric[]
  /** 코어 metric 값(0/unknown/null). 안 물어본 metric은 키 자체가 없다. */
  metrics: CoreMetricValues
  /**
   * 자유 메모(선택). 남길 수 있으나 core statistical analysis 대상이 아니다.
   * 비인덱스 optional — 스키마/인덱스 변경 없음.
   */
  note?: string
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   2) SleepEpisode — 수면 (Exposure). 시각 3개 + 파생은 엔진이 계산.
   --------------------------------------------------------------------- */
export interface SleepEpisode {
  id?: number
  /** 깨어난 날짜(wakeDate)에 귀속. */
  localDate: ISODate
  /** 잠자리에 든 시각. */
  wentToBedAt?: string
  /** 실제 잠든 시각. */
  sleepOnsetAt?: string
  /** 최종 기상 시각. */
  wakeAt?: string
  /** 밤중 깬 횟수. */
  awakenings?: number | null
  /** 수면 만족도/질 0~10. */
  satisfaction?: RatingValue
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   3) MealEpisode — 한 끼/간식 = 하나의 episode (Exposure + 직전 State)
   --------------------------------------------------------------------- */
export type MealAmount = 'small' | 'normal' | 'large' | 'unknown' | null

export interface MealEpisode {
  id?: number
  localDate: ISODate
  startedAt: string
  endedAt?: string
  /** 먹기 직전 3축. */
  prePhysicalHunger?: RatingValue
  preCraving?: RatingValue
  preBingeUrge?: RatingValue
  amount?: MealAmount
  proteinIncluded?: TriBoolean
  sweetsIncluded?: TriBoolean
  ultraProcessedIncluded?: TriBoolean
  /** 술 양(단위 자유, 0 이상). 측정 안 함=null. */
  alcoholAmount?: number | null
  perceivedOvereating?: TriBoolean
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   4) ActivityEpisode — 운동 (Exposure). "운동함 Y/N" 금지, 구조화.
   --------------------------------------------------------------------- */
export type ActivityType = 'strength' | 'cardio' | 'walk' | 'other'

export interface ActivityEpisode {
  id?: number
  localDate: ISODate
  startedAt: string
  /** 운동 시간(분, 0 이상). */
  durationMinutes: number
  /** 주관적 강도 0~10. */
  rpe?: RatingValue
  activityType: ActivityType
  /** 자동 수집 가능 시. */
  steps?: number | null
  activeCalories?: number | null
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   5) MedicationProfile — 약 정의. 이름 text는 최초 등록 때만. 분석은 stable id.
   --------------------------------------------------------------------- */
export interface MedicationProfile {
  id?: number
  /** 표시 이름. 최초 등록 시에만 자유 입력. 분석은 이 name이 아니라 id로 한다. */
  name: string
  defaultDose?: number | null
  doseUnit?: string | null
  /** 현재 복용 중 여부(중단해도 과거 dose 타임라인은 보존). */
  active: boolean
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   6) MedicationDose — 복용/투여 1회. dose 변경도 타임라인으로 추적.
   --------------------------------------------------------------------- */
export interface MedicationDose {
  id?: number
  /** MedicationProfile.id 참조(stable id). */
  medicationId: number
  localDate: ISODate
  takenAt: string
  dose?: number | null
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   7) HealthException — 큰 건강 사건. 분석에는 category만 사용.
   --------------------------------------------------------------------- */
export type HealthExceptionCategory =
  | 'illness'
  | 'fever'
  | 'gi_illness'
  | 'travel'
  | 'all_nighter'
  | 'jet_lag'
  | 'vaccination'
  | 'procedure'
  | 'injury'
  | 'other'

export interface HealthException {
  id?: number
  localDate: ISODate
  occurredAt?: string
  category: HealthExceptionCategory
  intensity?: RatingValue
  /** 자유 메모는 허용하되 분석에는 쓰지 않는다(category만). */
  customLabel?: string
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   8) ScreenMetric — 화면 사용 (Exposure). 하루 1행 집계. 지금은 수동/미래 자동.
   ⚠️ 웹 PWA에서 Apple Screen Time을 직접 읽으려 시도하지 않는다.
   --------------------------------------------------------------------- */
export interface ScreenMetric {
  id?: number
  localDate: ISODate
  totalMinutes?: number | null
  socialMinutes?: number | null
  shortFormMinutes?: number | null
  /** 취침 전 2시간 화면 분 — 최우선 관심 변수. */
  preBed2hMinutes?: number | null
  lastScreenAt?: string
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   9) WeightMeasurement — 체중 값과 "봤는지"를 분리.
   --------------------------------------------------------------------- */
export interface WeightMeasurement {
  id?: number
  measuredAt: string
  localDate: ISODate
  weightKg: number
  /** 몸무게 숫자를 본 행위 자체가 심리적 exposure가 될 수 있어 별도 필드. */
  userSawWeight?: TriBoolean
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------
   13) Experiment — 개인 N-of-1 실험 (생활요인만, 한 번에 하나)
   ⚠️ 의료 치료 변경(약 중단/용량 변경)은 실험 과제로 제안/생성하지 않는다.
   ---------------------------------------------------------------------
   구조화된 interventionCode를 쓰고, 자유 텍스트(title/note)는 표시용 보조다. */
export type ExperimentInterventionCode =
  | 'reduce_prebed_screen' // 취침 전 화면 사용 줄이기
  | 'consistent_bedtime' // 일정한 취침 시각
  | 'morning_light' // 아침 빛 노출
  | 'protein_with_meals' // 식사에 단백질 포함
  | 'avoid_late_caffeine' // 특정 시간대 카페인 피하기
  | 'daily_walk' // 매일 걷기
  | 'custom_lifestyle' // 기타 생활 습관(표시용 title 사용)

export type ExperimentStatus = 'planned' | 'baseline' | 'intervention' | 'completed' | 'abandoned'

export interface Experiment {
  id?: number
  /** 표시용 제목(보조). 분석은 interventionCode/targetMetric으로 한다. */
  title: string
  /** 관찰할 결과 metric(코어 12 중 하나). */
  targetMetric: CoreMetric
  /** 구조화된 개입 코드(생활요인). */
  interventionCode: ExperimentInterventionCode
  baselineStart: ISODate
  baselineEnd: ISODate
  interventionStart: ISODate
  interventionEnd: ISODate
  status: ExperimentStatus
  /** 표시용 자유 메모(분석 제외). */
  note?: string
  source: DataSource
  schemaVersion: number
  createdAt: string
  updatedAt: string
}
export type ExperimentInput = Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>

/* ---------------------------------------------------------------------
   생리 관련 V2 확장값(기존 CycleLog에 optional 비인덱스로 추가 — models.ts).
   --------------------------------------------------------------------- */
export type LhTestResult = 'positive' | 'negative' | 'unknown'
export type CervicalMucusType = 'dry' | 'sticky' | 'creamy' | 'watery' | 'eggwhite' | 'unknown'

/* ---------------------------------------------------------------------
   Repository 입력 타입 — id/createdAt/updatedAt는 repository가 채운다.
   --------------------------------------------------------------------- */
export type StateMeasurementInput = Omit<StateMeasurement, 'id' | 'createdAt' | 'updatedAt'>
export type SleepEpisodeInput = Omit<SleepEpisode, 'id' | 'createdAt' | 'updatedAt'>
export type MealEpisodeInput = Omit<MealEpisode, 'id' | 'createdAt' | 'updatedAt'>
export type ActivityEpisodeInput = Omit<ActivityEpisode, 'id' | 'createdAt' | 'updatedAt'>
export type MedicationProfileInput = Omit<MedicationProfile, 'id' | 'createdAt' | 'updatedAt'>
export type MedicationDoseInput = Omit<MedicationDose, 'id' | 'createdAt' | 'updatedAt'>
export type HealthExceptionInput = Omit<HealthException, 'id' | 'createdAt' | 'updatedAt'>
export type ScreenMetricInput = Omit<ScreenMetric, 'id' | 'createdAt' | 'updatedAt'>
export type WeightMeasurementInput = Omit<WeightMeasurement, 'id' | 'createdAt' | 'updatedAt'>
