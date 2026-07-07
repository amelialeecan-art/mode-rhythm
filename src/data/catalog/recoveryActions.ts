import type { RecoveryCategory } from '../types'
import type { RecoveryEffectValue, RecoveryLogCategory } from '../models'

/**
 * 회복 행동 카탈로그. "뭐 했더니 좀 나아졌어?"의 선택지.
 * 회복 행동은 트리거만큼 중요 — 후속 단계에서 전후/다음날 효과를 분석한다.
 */
export interface RecoveryActionItem {
  code: string
  label: string
  category: RecoveryCategory
}

export const RECOVERY_ACTIONS: RecoveryActionItem[] = [
  { code: 'walk', label: '산책', category: 'movement' },
  { code: 'shower', label: '샤워', category: 'care' },
  { code: 'sleep', label: '잠', category: 'rest' },
  { code: 'nap', label: '낮잠', category: 'rest' },
  { code: 'exercise', label: '운동', category: 'movement' },
  { code: 'stretch', label: '스트레칭', category: 'movement' },
  { code: 'warm_food', label: '따뜻한 음식', category: 'food' },
  { code: 'protein', label: '단백질 식사', category: 'food' },
  { code: 'water', label: '물 마심', category: 'food' },
  { code: 'alone', label: '혼자 있기', category: 'solo' },
  { code: 'talk_friend', label: '친구와 대화', category: 'social' },
  { code: 'talk_family', label: '가족과 대화', category: 'social' },
  { code: 'talk_partner', label: '파트너와 대화', category: 'social' },
  { code: 'delay_reply', label: '답장 미루기', category: 'solo' },
  { code: 'cry', label: '울기', category: 'expression' },
  { code: 'journal', label: '일기', category: 'expression' },
  { code: 'clean', label: '청소', category: 'care' },
  { code: 'cancel_plan', label: '약속 취소', category: 'rest' },
  { code: 'rest', label: '휴식', category: 'rest' },
  // 같은 칩이 어떤 날은 "도움 된 것", 어떤 날은 "안 맞았던 것"에 갈 수 있다.
  { code: 'sns', label: 'SNS 보기', category: 'solo' },
  { code: 'late_snack', label: '야식', category: 'food' },
  { code: 'sweets', label: '단 음식', category: 'food' },
  { code: 'rumination', label: '계속 생각함', category: 'solo' },
  { code: 'lying_down', label: '누워있음', category: 'rest' },
  { code: 'not_yet', label: '아직 모름', category: 'unknown' },
  { code: 'none', label: '없었음', category: 'unknown' },
]

/** 효과 선택지 (저장값은 recoveryLogs.effect = RecoveryEffectValue). */
export interface RecoveryEffectOption {
  code: RecoveryEffectValue
  label: string
}

export const RECOVERY_EFFECTS: RecoveryEffectOption[] = [
  { code: 'much_better', label: '많이 나아짐' },
  { code: 'little_better', label: '조금 나아짐' },
  { code: 'same', label: '그대로' },
  { code: 'worse', label: '더 나빠짐' },
  { code: 'unknown', label: '아직 모름' },
]

/**
 * 회복 행동 카탈로그 카테고리(UI 그룹) → recoveryLogs.category(저장 모델) 매핑.
 * null이면 저장하지 않는 sentinel(아직 모름/없었음).
 */
export const RECOVERY_CATEGORY_TO_MODEL: Record<RecoveryCategory, RecoveryLogCategory | null> = {
  movement: 'body',
  food: 'body',
  care: 'body',
  rest: 'body',
  solo: 'reality',
  social: 'relationship',
  expression: 'emotional',
  unknown: null,
}

/** 회복 행동이 아니라 "행동 없음/모름" sentinel — recoveryLogs로 저장하지 않는다. */
export const NON_SAVED_RECOVERY_CODES = new Set(['none', 'not_yet'])
