/* =====================================================================
   MODE · V2 입력 검증 (순수 함수)
   정책 (불변):
   - 잘못된 입력을 임의로 0으로 보정하지 않는다.
   - 0 / null / 'unknown'을 서로 바꾸지 않는다.
   - 검증 실패는 error(코드)로 알린다. 값을 조용히 고치지 않는다.
   이 파일은 Dexie/React를 모른다 — repository가 저장 전에 호출한다.
   ===================================================================== */
import { CORE_METRICS, type CoreMetric, type CoreMetricValues, type RatingValue } from './modelsV2'

/** 검증 실패 코드 — 사용자 메시지는 UI에서 매핑한다(원문 미노출). */
export type V2ValidationCode =
  | 'rating-range' // 0~10 정수가 아님
  | 'rating-type' // number/'unknown'/null 이 아님
  | 'timestamp-invalid' // 파싱 불가능한 시각
  | 'duration-negative' // 음수 시간
  | 'sleep-chronology' // 취침→잠듦→기상 순서 위반
  | 'meal-chronology' // 시작→종료 순서 위반
  | 'unknown-metric' // CORE_METRICS 밖의 metric 키
  | 'metric-not-prompted' // metrics에 값이 있는데 promptedMetrics에 없음
  | 'missing-reference' // 참조하는 레코드가 존재하지 않음(예: medicationId)

export class V2ValidationError extends Error {
  code: V2ValidationCode
  constructor(code: V2ValidationCode, message?: string) {
    super(message ?? code)
    this.name = 'V2ValidationError'
    this.code = code
  }
}

const CORE_METRIC_SET: ReadonlySet<string> = new Set(CORE_METRICS)

/* ---------------------------------------------------------------------
   원자 검증기 (boolean 반환 — 값을 바꾸지 않는다)
   --------------------------------------------------------------------- */

/** rating: 0~10 정수 | 'unknown' | null 이면 유효. 그 외(소수/범위밖/문자열/undefined)는 무효. */
export function isValidRating(v: unknown): v is RatingValue {
  if (v === null || v === 'unknown') return true
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10
}

/** number rating(0~10 정수)만 좁혀 판단할 때. */
export function isNumericRating(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10
}

/** 시각 문자열: 비어있지 않고 Date.parse 가능. undefined/null은 "없음"이므로 여기서 판단하지 않는다. */
export function isValidTimestamp(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}

/** 시간(분/걸음/칼로리 등): 0 이상 유한수 또는 null. */
export function isNonNegativeOrNull(v: unknown): boolean {
  if (v === null || v === undefined) return true
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/* ---------------------------------------------------------------------
   레코드 단위 검증 — 오류 코드 배열을 반환(빈 배열 = 통과)
   --------------------------------------------------------------------- */

/**
 * StateMeasurement의 metrics + promptedMetrics 정합성 검증.
 * - metrics의 모든 키는 CORE_METRICS 안이어야 한다.
 * - metrics의 모든 값은 유효한 rating이어야 한다(0은 유효, null/unknown도 유효).
 * - metrics에 값이 있으면 그 metric은 promptedMetrics에 포함돼야 한다
 *   ("안 물어봤는데 값이 있다"는 provenance 모순).
 * ⚠️ 안 물어본 metric을 0으로 채우지 않는다 — 검증도 그것을 요구하지 않는다.
 */
export function validateStateMetrics(
  metrics: CoreMetricValues,
  promptedMetrics: readonly CoreMetric[],
): V2ValidationCode[] {
  const errors: V2ValidationCode[] = []
  const prompted = new Set<string>(promptedMetrics)
  for (const [key, value] of Object.entries(metrics)) {
    if (!CORE_METRIC_SET.has(key)) {
      errors.push('unknown-metric')
      continue
    }
    if (!isValidRating(value)) {
      errors.push(value === null || typeof value === 'number' ? 'rating-range' : 'rating-type')
    }
    if (!prompted.has(key)) errors.push('metric-not-prompted')
  }
  for (const m of promptedMetrics) {
    if (!CORE_METRIC_SET.has(m)) errors.push('unknown-metric')
  }
  return errors
}

/** 수면 시각 순서: 존재하는 값들끼리만 취침 ≤ 잠듦 ≤ 기상. 없는 값은 검사 대상 아님. */
export function validateSleepChronology(ep: {
  wentToBedAt?: string
  sleepOnsetAt?: string
  wakeAt?: string
}): V2ValidationCode[] {
  const errors: V2ValidationCode[] = []
  const present = [ep.wentToBedAt, ep.sleepOnsetAt, ep.wakeAt].filter((t): t is string => t !== undefined)
  for (const t of present) {
    if (!isValidTimestamp(t)) errors.push('timestamp-invalid')
  }
  if (errors.length > 0) return errors // 시각이 깨졌으면 순서 판단은 무의미
  const bed = ep.wentToBedAt ? Date.parse(ep.wentToBedAt) : undefined
  const onset = ep.sleepOnsetAt ? Date.parse(ep.sleepOnsetAt) : undefined
  const wake = ep.wakeAt ? Date.parse(ep.wakeAt) : undefined
  if (bed !== undefined && onset !== undefined && onset < bed) errors.push('sleep-chronology')
  if (onset !== undefined && wake !== undefined && wake < onset) errors.push('sleep-chronology')
  if (bed !== undefined && wake !== undefined && onset === undefined && wake < bed) errors.push('sleep-chronology')
  return errors
}

/** 식사 시각 순서: 시작 필수, 종료 있으면 종료 ≥ 시작. */
export function validateMealChronology(ep: { startedAt?: string; endedAt?: string }): V2ValidationCode[] {
  const errors: V2ValidationCode[] = []
  if (!isValidTimestamp(ep.startedAt)) {
    errors.push('timestamp-invalid')
    return errors
  }
  if (ep.endedAt !== undefined) {
    if (!isValidTimestamp(ep.endedAt)) {
      errors.push('timestamp-invalid')
    } else if (Date.parse(ep.endedAt) < Date.parse(ep.startedAt)) {
      errors.push('meal-chronology')
    }
  }
  return errors
}

/** 여러 검증기의 결과를 모아 하나라도 실패하면 첫 코드로 throw. */
export function assertNoErrors(errors: V2ValidationCode[]): void {
  if (errors.length > 0) throw new V2ValidationError(errors[0])
}
