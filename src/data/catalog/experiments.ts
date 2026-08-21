/* =====================================================================
   MODE · N-of-1 실험 개입 카탈로그 (생활요인만)
   ⚠️ 약 중단/용량 변경 등 의료 치료 변경은 목록에 없다(앱이 제안하지 않는다).
   ===================================================================== */
import type { CoreMetric, ExperimentInterventionCode } from '../modelsV2'

export interface InterventionMeta {
  code: ExperimentInterventionCode
  label: string
  /** 이 개입과 자연스럽게 연결되는 관찰 metric 추천(고정 아님, 사용자가 바꿀 수 있음). */
  suggestedMetrics: CoreMetric[]
}

export const EXPERIMENT_INTERVENTIONS: InterventionMeta[] = [
  { code: 'reduce_prebed_screen', label: '취침 전 화면 사용 줄이기', suggestedMetrics: ['energy', 'fatigueHeaviness'] },
  { code: 'consistent_bedtime', label: '일정한 취침 시각 지키기', suggestedMetrics: ['energy', 'moodLow'] },
  { code: 'morning_light', label: '아침 빛 쬐기', suggestedMetrics: ['energy', 'moodLow'] },
  { code: 'protein_with_meals', label: '식사에 단백질 포함', suggestedMetrics: ['craving', 'physicalHunger'] },
  { code: 'avoid_late_caffeine', label: '오후 늦게 카페인 피하기', suggestedMetrics: ['energy', 'anxiety'] },
  { code: 'daily_walk', label: '매일 걷기', suggestedMetrics: ['moodLow', 'energy'] },
  { code: 'custom_lifestyle', label: '직접 정한 생활 습관', suggestedMetrics: ['moodLow'] },
]

export const INTERVENTION_LABEL: Record<ExperimentInterventionCode, string> = Object.fromEntries(
  EXPERIMENT_INTERVENTIONS.map((i) => [i.code, i.label]),
) as Record<ExperimentInterventionCode, string>
