import './components.css'

/**
 * 신뢰도 등급. 0단계 명세의 4단계 표현.
 * 단정이 아니라 "기록상 함께 나타난 정도"를 보여주는 라벨.
 */
export type ConfidenceTier = 'reference' | 'possible' | 'likely' | 'strong'

export const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  reference: '참고 기록',
  possible: '가능성 있음',
  likely: '유력 후보',
  strong: '반복 패턴 강함',
}

export interface ConfidenceBadgeProps {
  tier: ConfidenceTier
}

/** 요인 후보 옆에 붙는 신뢰도 배지. (점수→등급 변환은 후속 단계 엔진에서) */
export function ConfidenceBadge({ tier }: ConfidenceBadgeProps) {
  return <span className={`confidence confidence--${tier}`}>{CONFIDENCE_LABEL[tier]}</span>
}
