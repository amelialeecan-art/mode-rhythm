/**
 * 오늘 상태 칩 (기록 화면 1번 질문). 원인 금지 — 몸/감정의 "결과값"만.
 * 예민 ≠ 짜증: 예민은 자극에 민감한 상태, 짜증/화냄은 이미 반응이 터진 상태.
 * '식욕 변동'은 식욕 카드와, '방전/몸 불편'은 몸 직접 입력과 중복이라 UI에서 제외한다.
 * legacy preset은 옛 기록 재계산을 위해 유지한다.
 */
export const STATE_CHIPS: { code: string; label: string }[] = [
  { code: 'calm', label: '안정' },
  { code: 'irritable', label: '예민' },
  { code: 'sad', label: '우울' },
  { code: 'anxious', label: '불안' },
  { code: 'annoyed', label: '짜증' },
  { code: 'angry', label: '화냄' },
  { code: 'tearful', label: '울컥/눈물' },
  { code: 'lethargic', label: '무기력' },
  { code: 'unfocused', label: '집중 안 됨' },
  { code: 'social_fatigue', label: '사회 피로' },
  { code: 'impulsive', label: '충동 증가' },
  { code: 'unknown', label: '이유 모름' },
]
