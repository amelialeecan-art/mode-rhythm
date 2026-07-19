/* =====================================================================
   MODE · 가벼운 타입 정의 (Phase 1)
   주의: 여기는 화면/카탈로그가 공유하는 표시·구조용 타입만 둔다.
   실제 저장 모델(dailyLogs 등)과 Dexie 스키마는 2단계에서 data/models.ts로.
   ===================================================================== */

/** 'YYYY-MM-DD' 형식 날짜 키. */
export type ISODate = string

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

