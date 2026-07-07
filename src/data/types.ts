/* =====================================================================
   MODE · 가벼운 타입 정의 (Phase 1)
   주의: 여기는 화면/카탈로그가 공유하는 표시·구조용 타입만 둔다.
   실제 저장 모델(dailyLogs 등)과 Dexie 스키마는 2단계에서 data/models.ts로.
   ===================================================================== */

/** 'YYYY-MM-DD' 형식 날짜 키. */
export type ISODate = string

/**
 * 오늘 모드 코드(내부 키). 표시명은 ModeDisplay.name 사용.
 * 키는 안정적인 영문 코드, 한글명은 표시용 별칭(예: '식욕 변동일').
 */
export type DayType =
  | 'stable' // 안정일
  | 'focus' // 집중 가능일
  | 'emotional' // 감정 민감일
  | 'appetite' // 식욕 변동일
  | 'body' // 신체 부하일
  | 'social' // 사회 피로일
  | 'impulse' // 충동 경계일
  | 'recovery' // 회복 우선일
  | 'unexplained' // 원인 미상일
  | 'mixed' // 복합 흔들림일

/** "오늘 있었던 일" 사건의 분류. (원인 추측 아님 — 사건/상황 기록) */
export type EventCategory =
  | 'sleep'
  | 'food'
  | 'relationship'
  | 'work'
  | 'body'
  | 'appearance'
  | 'environment'
  | 'digital'
  | 'movement'
  | 'control' // 통제감/좌절 (계획 틀어짐, 내 뜻대로 안 됨, 예기 스트레스 등)
  | 'unknown'

/** 회복 행동 분류. */
export type RecoveryCategory =
  | 'movement'
  | 'rest'
  | 'food'
  | 'social'
  | 'solo'
  | 'expression'
  | 'care'
  | 'unknown'

/** 강도 칩 옵션. 내부적으로 0~10 숫자로 저장될 값을 함께 갖는다. */
export interface IntensityOption {
  code: 'none' | 'little' | 'some' | 'much' | 'veryMuch'
  label: string
  value: number // 0~10
}

/** 회복 행동 효과 선택지. */
export type RecoveryEffect = 'much_better' | 'a_bit_better' | 'same' | 'worse'

/**
 * 캘린더/분석에서 쓰는 mock 점수 형태 (Phase 1 표시용).
 * 실제 dailyScores 계산은 4단계 엔진에서.
 */
export interface MockDailyScore {
  date: ISODate
  dayType: DayType
  /** 0~4 색 단계 (히트맵용). */
  intensity: number
  /** 짧은 라벨. */
  label: string
}

/** 모드 표시 정보. */
export interface ModeDisplay {
  type: DayType
  /** 표시명 (예: '감정 민감일'). */
  name: string
  /** 짧은 캘린더 라벨 (예: '예민'). */
  shortLabel: string
  /** 기본 모찌 표정 키. */
  mascot: string
  /** 기본 그라데이션. */
  gradient: string
}
