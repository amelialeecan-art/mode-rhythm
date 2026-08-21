/* =====================================================================
   MODE · V2 스트레스 사건 카탈로그 (canonical 6 category)
   - 매일 40개 사건을 훑지 않는다. 특별한 일이 있을 때만 + 이벤트를 누른다.
   - 각 사건은 개별 레코드: occurredAt + category + intensity(0~10) + localDate.
   - V2 사건은 eventLogs 테이블에 저장하되(레거시 호환) mappedFactorGroup을 canonical
     6개로 고정하고 schemaVersion=1, occurredAt을 가진다.
   ===================================================================== */
import type { EventLogCategory, EventLogInput, ISODate } from '../models'

/** canonical 스트레스 category 코드(6개). 분석의 기본 그룹 키. */
export const STRESS_CATEGORIES = [
  { code: 'work_study_pressure', label: '업무/학업 압박', eventLogCategory: 'work' },
  { code: 'interpersonal_conflict', label: '인간관계 갈등', eventLogCategory: 'relationship' },
  { code: 'anticipated_obligation', label: '예정된 일/약속 부담', eventLogCategory: 'control' },
  { code: 'loss_of_control_mistake', label: '통제감 상실/실수', eventLogCategory: 'control' },
  { code: 'appearance_body_concern', label: '외모·몸 스트레스', eventLogCategory: 'appearance' },
  { code: 'environmental_sensory_stress', label: '환경/감각 스트레스', eventLogCategory: 'environment' },
] as const satisfies ReadonlyArray<{ code: string; label: string; eventLogCategory: EventLogCategory }>

export type StressCategoryCode = (typeof STRESS_CATEGORIES)[number]['code']

export const STRESS_CATEGORY_META: Record<StressCategoryCode, { label: string; eventLogCategory: EventLogCategory }> =
  Object.fromEntries(STRESS_CATEGORIES.map((c) => [c.code, { label: c.label, eventLogCategory: c.eventLogCategory }])) as Record<
    StressCategoryCode,
    { label: string; eventLogCategory: EventLogCategory }
  >

export const STRESS_CATEGORY_CODES: StressCategoryCode[] = STRESS_CATEGORIES.map((c) => c.code)
const CANONICAL_SET: ReadonlySet<string> = new Set(STRESS_CATEGORY_CODES)

export interface BuildStressEventParams {
  localDate: ISODate
  category: StressCategoryCode
  intensity: number
  occurredAt: string
}

/**
 * canonical 스트레스 사건 1건 → eventLogs 저장형(V2).
 * - eventCode/mappedFactorGroup = canonical category(문자열 재해석 없이 그대로).
 * - timing='exact', occurredAt/occurredOn 보유 → 분석에서 상태 timestamp와 선후 계산.
 * - relationToShift는 묻지 않는다(undefined).
 * intensity는 0~10 정수여야 한다(호출부에서 검증).
 */
export function buildStressEventInput(p: BuildStressEventParams): EventLogInput {
  const meta = STRESS_CATEGORY_META[p.category]
  return {
    date: p.localDate,
    eventCode: p.category,
    eventLabel: meta.label,
    category: meta.eventLogCategory,
    timing: 'exact',
    intensity: p.intensity,
    isCustom: false,
    mappedFactorGroup: p.category,
    occurredAt: p.occurredAt,
    occurredOn: p.localDate,
    source: 'manual',
    schemaVersion: 1,
  }
}

/** eventLog가 V2 canonical 스트레스 사건인가(레거시 45종과 구분). */
export function isV2StressEvent(e: { schemaVersion?: number; occurredAt?: string; mappedFactorGroup?: string }): boolean {
  return e.schemaVersion === 1 && !!e.occurredAt && CANONICAL_SET.has(e.mappedFactorGroup ?? '')
}
