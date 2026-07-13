import './components.css'

/**
 * 자료 충분도 등급. 통계적 신뢰도/인과가 아니라 "앱이 얼마나 많은 기록으로 비교했는지"를
 * 보여주는 내부 지표. 확신을 주는 표현(유력 후보/반복 패턴 강함 등)은 쓰지 않는다.
 */
export type ConfidenceTier = 'reference' | 'possible' | 'likely' | 'strong'

export const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  reference: '참고 수준',
  possible: '초기 관찰',
  likely: '반복 관찰',
  strong: '자료 충분',
}

export interface ConfidenceBadgeProps {
  tier: ConfidenceTier
}

/** 요인 후보 옆에 붙는 신뢰도 배지. (점수→등급 변환은 후속 단계 엔진에서) */
export function ConfidenceBadge({ tier }: ConfidenceBadgeProps) {
  return <span className={`confidence confidence--${tier}`}>{CONFIDENCE_LABEL[tier]}</span>
}
