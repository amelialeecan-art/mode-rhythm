/* =====================================================================
   MODE · 체크인 폼 로직 (순수 함수 — React/DB 없음)
   화면 상태(사용자가 고른 값)와 StateMeasurement 저장형 사이를 변환한다.

   값 의미(삼분 + 미선택):
   - number 0~10 : 실제 응답
   - 'unknown'    : 모름
   - null/absent  : 미선택(미측정) — 절대 0으로 바꾸지 않는다

   저장 규칙:
   - metrics 에는 "응답한" metric(number 또는 'unknown')만 넣는다.
   - promptedMetrics 는 "물어본" 전체 목록 → 미응답(prompted인데 metrics에 없음)과
     "안 물어봄"(prompted에 없음)을 분석기가 구분할 수 있다.
   ===================================================================== */
import {
  V2_SCHEMA_VERSION,
  type CoreMetric,
  type CoreMetricValues,
  type DataSource,
  type StateMeasurement,
  type StateMeasurementInput,
} from '../../../data/modelsV2'

/** 화면에서 고른 값. 키가 없거나 null이면 미선택. */
export type CheckInValues = Partial<Record<CoreMetric, number | 'unknown'>>

export interface BuildMeasurementParams {
  localDate: string
  checkInType: 'morning' | 'evening' | 'adhoc'
  promptedMetrics: CoreMetric[]
  values: CheckInValues
  recordedAt: string
  timezoneOffsetMinutes: number
  note?: string
  source?: DataSource
}

/**
 * 화면 상태 → 저장형 StateMeasurementInput.
 * - metrics: promptedMetrics 중 응답값(number/'unknown')만 채운다. 미응답은 넣지 않는다.
 * - 미선택 metric을 0으로 채우지 않는다.
 */
export function buildMeasurementInput(params: BuildMeasurementParams): StateMeasurementInput {
  const { localDate, checkInType, promptedMetrics, values, recordedAt, timezoneOffsetMinutes } = params
  const metrics: CoreMetricValues = {}
  for (const m of promptedMetrics) {
    const v = values[m]
    if (v === undefined || v === null) continue // 미선택 → 저장 안 함(0 아님)
    metrics[m] = v
  }
  const note = params.note?.trim()
  return {
    localDate,
    recordedAt,
    timezoneOffsetMinutes,
    checkInType,
    promptedMetrics: [...promptedMetrics],
    metrics,
    // 항상 명시한다 — 편집으로 메모를 비우면 undefined가 기존 값을 덮어써야 한다.
    note: note ? note : undefined,
    source: params.source ?? 'manual',
    schemaVersion: V2_SCHEMA_VERSION,
  }
}

/**
 * 저장형 → 화면 값(복원용).
 * metrics의 number/'unknown'만 화면 값으로 되살린다. null/absent는 미선택으로 둔다.
 */
export function measurementToValues(measurement: Pick<StateMeasurement, 'metrics'>): CheckInValues {
  const values: CheckInValues = {}
  for (const [key, val] of Object.entries(measurement.metrics)) {
    if (typeof val === 'number' || val === 'unknown') {
      values[key as CoreMetric] = val
    }
  }
  return values
}

/** 로컬 타임존 오프셋(분). UTC 대비. KST면 540. */
export function currentTimezoneOffsetMinutes(now: Date = new Date()): number {
  // getTimezoneOffset은 "UTC - local"(분, 반대부호) → 부호를 뒤집어 KST=+540로 맞춘다.
  return -now.getTimezoneOffset()
}

/** dirty 판정용 직렬화. 값 + 메모를 안정적으로 문자열화(키 순서 무관). */
export function serializeCheckIn(values: CheckInValues, note: string): string {
  const sortedKeys = Object.keys(values).sort()
  const normalized = sortedKeys.map((k) => [k, values[k as CoreMetric]] as const)
  return JSON.stringify({ values: normalized, note })
}
