import type { DayType, ModeDisplay } from '../types'
import { MASCOT_GRADIENTS } from '../../design/mascot/Mascot'

/**
 * 오늘 모드 카탈로그: 코드 → 표시명/짧은라벨/모찌/그라데이션.
 *
 * 주의: 모드 이름은 명확하게(예: '식욕 변동일'). "단짠" 같은 모호한 표현을
 * 타입명으로 쓰지 않는다. 모드 옆 괄호 보조문구(subLabel)는 여기에 두지 않는다
 * — 그것은 후속 단계에서 점수/상황으로 동적 생성되며 절대 고정하지 않는다.
 */
export const MODES: Record<DayType, ModeDisplay> = {
  stable: { type: 'stable', name: '안정일', shortLabel: '안정', mascot: 'happy', gradient: MASCOT_GRADIENTS.happy },
  focus: { type: 'focus', name: '집중 가능일', shortLabel: '집중', mascot: 'focus', gradient: MASCOT_GRADIENTS.focus },
  emotional: { type: 'emotional', name: '감정 민감일', shortLabel: '예민', mascot: 'teary', gradient: MASCOT_GRADIENTS.teary },
  appetite: { type: 'appetite', name: '식욕 변동일', shortLabel: '식욕', mascot: 'hungry', gradient: MASCOT_GRADIENTS.hungry },
  body: { type: 'body', name: '신체 부하일', shortLabel: '몸', mascot: 'sleepy', gradient: MASCOT_GRADIENTS.sleepy },
  social: { type: 'social', name: '사회 피로일', shortLabel: '인간피로', mascot: 'confused', gradient: MASCOT_GRADIENTS.confused },
  impulse: { type: 'impulse', name: '충동 경계일', shortLabel: '충동', mascot: 'hungry', gradient: MASCOT_GRADIENTS.hungry },
  recovery: { type: 'recovery', name: '회복 우선일', shortLabel: '회복', mascot: 'sleepy', gradient: MASCOT_GRADIENTS.sleepy },
  unexplained: { type: 'unexplained', name: '원인 미상일', shortLabel: '미제', mascot: 'confused', gradient: MASCOT_GRADIENTS.confused },
  mixed: { type: 'mixed', name: '복합 흔들림일', shortLabel: '복합', mascot: 'teary', gradient: MASCOT_GRADIENTS.teary },
}

/** 오늘 상태 칩 (기록 화면 1번 질문). 표준 라벨. */
export const STATE_CHIPS: { code: string; label: string }[] = [
  { code: 'calm', label: '안정' },
  { code: 'irritable', label: '예민' },
  { code: 'sad', label: '우울' },
  { code: 'anxious', label: '불안' },
  { code: 'appetite_swing', label: '식욕 변동' },
  { code: 'drained', label: '방전' },
  { code: 'body_discomfort', label: '몸 불편' },
  { code: 'social_fatigue', label: '사회 피로' },
  { code: 'impulsive', label: '충동 증가' },
  { code: 'unknown', label: '이유 모름' },
]
