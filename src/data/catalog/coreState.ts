/* =====================================================================
   MODE · 코어 상태(State) 12 metric 카탈로그
   - 표시명(한국어)과 아침/저녁 기본 질문 목록만 담는다(순수 데이터).
   - metric 이름/집합은 modelsV2.CORE_METRICS(core schema version 1)와 일치해야 한다.
   - "식욕"을 하나로 합치지 않는다:
       physicalHunger / craving / bingeUrge 는 서로 다른 질문으로 유지한다.
   ===================================================================== */
import { CORE_METRICS, type CoreMetric } from '../modelsV2'

export interface CoreStateMeta {
  metric: CoreMetric
  /** 직관적 한국어 표시명. */
  label: string
  /** 0 = 전혀 없음 / 낮음, 10 = 매우 강함 / 높음의 양극 짧은 설명(접근성/힌트용). */
  lowLabel: string
  highLabel: string
}

/**
 * 코어 12 metric 메타. 순서는 CORE_METRICS 순서를 따른다.
 * energy/focus는 "높을수록 좋음"이지만 0~10 척도 자체는 동일하게 다룬다
 * (0=매우 낮음, 10=매우 높음). 방향 해석은 분석 단계의 몫으로 둔다.
 */
export const CORE_STATE_META: Record<CoreMetric, CoreStateMeta> = {
  moodLow: { metric: 'moodLow', label: '기분 저하', lowLabel: '없음', highLabel: '매우 심함' },
  anxiety: { metric: 'anxiety', label: '불안', lowLabel: '없음', highLabel: '매우 심함' },
  irritability: { metric: 'irritability', label: '짜증/분노', lowLabel: '없음', highLabel: '매우 심함' },
  energy: { metric: 'energy', label: '에너지', lowLabel: '매우 낮음', highLabel: '매우 높음' },
  focus: { metric: 'focus', label: '집중', lowLabel: '매우 낮음', highLabel: '매우 높음' },
  impulsivity: { metric: 'impulsivity', label: '충동성', lowLabel: '없음', highLabel: '매우 강함' },
  physicalHunger: { metric: 'physicalHunger', label: '신체적 배고픔', lowLabel: '없음', highLabel: '매우 강함' },
  craving: { metric: 'craving', label: '음식 craving', lowLabel: '없음', highLabel: '매우 강함' },
  bingeUrge: { metric: 'bingeUrge', label: '폭식 충동', lowLabel: '없음', highLabel: '매우 강함' },
  fatigueHeaviness: { metric: 'fatigueHeaviness', label: '피로/몸 무거움', lowLabel: '없음', highLabel: '매우 심함' },
  bloating: { metric: 'bloating', label: '복부팽만', lowLabel: '없음', highLabel: '매우 심함' },
  painDiscomfort: { metric: 'painDiscomfort', label: '통증/몸 불편감', lowLabel: '없음', highLabel: '매우 심함' },
}

/** 표시 순서(CORE_METRICS와 동일). */
export const CORE_STATE_ORDER: CoreMetric[] = [...CORE_METRICS]

/**
 * 아침 체크인 기본 질문(8개). 여기 없는 metric은 아침에 "안 물어봄" — 0으로 채우지 않는다.
 * 아침은 기상 직후 상태라 craving/bingeUrge/impulsivity/painDiscomfort는 기본에서 뺀다.
 */
export const MORNING_PROMPTED: CoreMetric[] = [
  'moodLow',
  'anxiety',
  'irritability',
  'energy',
  'focus',
  'physicalHunger',
  'fatigueHeaviness',
  'bloating',
]

/** 저녁 체크인 기본 질문(12개 전체). 하루를 마무리하며 코어 전체를 남긴다. */
export const EVENING_PROMPTED: CoreMetric[] = [...CORE_METRICS]

/** checkInType별 기본 prompted metric 목록. */
export function promptedMetricsFor(checkInType: 'morning' | 'evening'): CoreMetric[] {
  return checkInType === 'morning' ? [...MORNING_PROMPTED] : [...EVENING_PROMPTED]
}
