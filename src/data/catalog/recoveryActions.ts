import type { RecoveryCategory, RecoveryEffect } from '../types'

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
  { code: 'not_yet', label: '아직 모름', category: 'unknown' },
  { code: 'none', label: '없었음', category: 'unknown' },
]

/** 효과 선택지. */
export interface RecoveryEffectOption {
  code: RecoveryEffect
  label: string
}

export const RECOVERY_EFFECTS: RecoveryEffectOption[] = [
  { code: 'much_better', label: '많이 나아짐' },
  { code: 'a_bit_better', label: '조금 나아짐' },
  { code: 'same', label: '그대로' },
  { code: 'worse', label: '더 나빠짐' },
]
