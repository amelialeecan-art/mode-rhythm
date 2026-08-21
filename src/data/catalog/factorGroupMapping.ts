/* =====================================================================
   MODE · 레거시 factorGroup → canonical 스트레스 group 매핑 (읽기 전용 레이어)
   목적: 기존 eventLogs(45종 catalog)를 새 6개 canonical 스트레스 그룹으로
        "필요할 때" 묶어 볼 수 있게 한다.
   ⚠️ 원본 legacy eventCode/factorGroup은 절대 변형/삭제하지 않는다.
      이 매핑은 저장하지 않고 분석/표시 단계에서만 참조한다.
   스트레스가 아닌 factorGroup(수면/식사/카페인/운동/화면 등)은 매핑하지 않는다(null) —
      그것들은 V2에서 Sleep/Meal/Activity/Screen 등 다른 구조로 다룬다.
   ===================================================================== */
import type { StressCategoryCode } from './stressEvents'

/** 레거시 factorGroup → canonical 스트레스 category. 없으면 스트레스로 분류하지 않는다. */
export const LEGACY_FACTORGROUP_TO_CANONICAL_STRESS: Record<string, StressCategoryCode> = {
  // 업무/학업 압박
  workload: 'work_study_pressure',
  deadline_pressure: 'work_study_pressure',
  // 인간관계 갈등
  interpersonal_stress: 'interpersonal_conflict',
  reply_stress: 'interpersonal_conflict',
  // 예정된 일/약속 부담
  anticipatory_stress: 'anticipated_obligation',
  // 통제감 상실/실수/계획 틀어짐
  control_loss: 'loss_of_control_mistake',
  plan_disruption: 'loss_of_control_mistake',
  failure: 'loss_of_control_mistake',
  // 외모·몸
  body_image: 'appearance_body_concern',
  social_comparison: 'appearance_body_concern',
  // 환경/감각
  environment_stress: 'environmental_sensory_stress',
  cramped_space: 'environmental_sensory_stress',
  clutter: 'environmental_sensory_stress',
  crowd_exposure: 'environmental_sensory_stress',
  weather: 'environmental_sensory_stress',
}

/** 레거시 factorGroup을 canonical 스트레스 group으로 매핑(스트레스 아니면 null). */
export function legacyFactorGroupToCanonicalStress(factorGroup: string): StressCategoryCode | null {
  return LEGACY_FACTORGROUP_TO_CANONICAL_STRESS[factorGroup] ?? null
}
