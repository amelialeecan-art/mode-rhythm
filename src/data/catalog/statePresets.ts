import type { DailyLogInput } from '../models'

/**
 * 오늘 상태 칩 → dailyLogs 숫자 필드(0~10) preset 매핑.
 * 주의: 이건 "원인"이 아니라 "상태/결과"를 숫자로 옮기는 변환표다.
 * 사용자가 여러 상태를 고르면 각 필드의 "최대값"으로 병합한다.
 */
export interface StatePreset {
  code: string
  label: string
  patch: Partial<DailyLogInput>
}

export const STATE_PRESETS: StatePreset[] = [
  { code: 'calm', label: '안정', patch: { calm: 7, energy: 6, focus: 5 } },
  { code: 'irritable', label: '예민', patch: { irritability: 7, anxiety: 4, moodLow: 4, calm: 2 } },
  { code: 'sad', label: '우울', patch: { sadness: 7, heaviness: 7, moodLow: 7, energy: 2, calm: 2 } },
  { code: 'anxious', label: '불안', patch: { anxiety: 8, focus: 3, calm: 1 } },
  { code: 'annoyed', label: '짜증', patch: { irritability: 7, moodLow: 3, calm: 2 } },
  { code: 'angry', label: '화냄', patch: { irritability: 9, impulsivity: 5, moodLow: 4, calm: 1 } },
  { code: 'tearful', label: '울컥/눈물', patch: { sadness: 6, moodLow: 5, heaviness: 4 } },
  { code: 'lethargic', label: '무기력', patch: { energy: 1, heaviness: 6, fatigue: 5, moodLow: 4 } },
  { code: 'unfocused', label: '집중 안 됨', patch: { focus: 1, energy: 3 } },
  // legacy: UI 칩에서는 제외됐지만 저장된 옛 stateCodes 재계산을 위해 preset은 유지
  { code: 'appetite_swing', label: '식욕 변동', patch: { appetite: 7, sweetCraving: 5, saltyCraving: 4, bingeUrge: 5 } },
  { code: 'drained', label: '방전', patch: { fatigue: 8, energy: 2, heaviness: 6, focus: 3 } },
  { code: 'body_discomfort', label: '몸 불편', patch: { bodyDiscomfort: 7, pain: 5, bloating: 5, fatigue: 5 } },
  { code: 'social_fatigue', label: '사회 피로', patch: { heaviness: 5, irritability: 4, energy: 3 } },
  { code: 'impulsive', label: '충동 증가', patch: { impulsivity: 7, anxiety: 4 } },
  { code: 'unknown', label: '이유 모름', patch: { moodLow: 5, heaviness: 5 } },
]

const STATE_PRESET_BY_CODE = new Map(STATE_PRESETS.map((p) => [p.code, p]))

/** 전체 강도 칩 → preset 보정 배수. (안정 등 capacity 필드에는 적용하지 않음) */
export const OVERALL_INTENSITY_MULTIPLIER: Record<string, number> = {
  little: 0.75, // 조금
  some: 1.0, // 보통
  much: 1.15, // 많이
  veryMuch: 1.3, // 매우 많이
}

/** 강도 배수가 적용되는 "부하성" 필드. calm/energy/focus 같은 capacity 필드는 제외. */
const LOAD_FIELDS: (keyof DailyLogInput)[] = [
  'moodLow',
  'anxiety',
  'irritability',
  'sadness',
  'heaviness',
  'selfCriticism',
  'impulsivity',
  'appetite',
  'sweetCraving',
  'saltyCraving',
  'bingeUrge',
  'bodyDiscomfort',
  'pain',
  'bloating',
  'fatigue',
  'headache',
  'digestion',
]

const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)))

/** 추론에 쓰는 숫자 필드들 (DailyLog가 구조적으로 할당 가능). */
type StateNumericFields = {
  moodLow?: number
  anxiety?: number
  irritability?: number
  sadness?: number
  heaviness?: number
  calm?: number
  energy?: number
  impulsivity?: number
  appetite?: number
  sweetCraving?: number
  saltyCraving?: number
  bingeUrge?: number
  bodyDiscomfort?: number
  pain?: number
  bloating?: number
  fatigue?: number
}

/** dailyLog 숫자값에서 상태 칩을 역추론한다 (메타데이터가 없는 옛 기록 복원용). */
export function inferStateCodes(f: StateNumericFields): string[] {
  const v = (k: keyof StateNumericFields) => (typeof f[k] === 'number' ? (f[k] as number) : 0)
  const codes: string[] = []
  if (v('irritability') >= 5) codes.push('irritable')
  if (v('anxiety') >= 6) codes.push('anxious')
  if (v('sadness') >= 5 || v('moodLow') >= 6 || v('heaviness') >= 6) codes.push('sad')
  if (v('appetite') >= 5 || v('sweetCraving') >= 5 || v('saltyCraving') >= 5 || v('bingeUrge') >= 5) codes.push('appetite_swing')
  if (v('fatigue') >= 6 || (v('energy') <= 2 && v('heaviness') >= 5)) codes.push('drained')
  if (v('bodyDiscomfort') >= 5 || v('pain') >= 5 || v('bloating') >= 5) codes.push('body_discomfort')
  if (v('impulsivity') >= 6) codes.push('impulsive')
  // 부하가 거의 없고 여유가 있으면 안정
  if (codes.length === 0 && v('calm') >= 5) codes.push('calm')
  return codes
}

/** dailyLogs의 모든 숫자 필드를 0으로 초기화한 base. */
function zeroNumericFields(): Record<string, number> {
  return {
    moodLow: 0,
    anxiety: 0,
    irritability: 0,
    sadness: 0,
    heaviness: 0,
    calm: 0,
    energy: 0,
    focus: 0,
    selfCriticism: 0,
    impulsivity: 0,
    appetite: 0,
    sweetCraving: 0,
    saltyCraving: 0,
    bingeUrge: 0,
    bodyDiscomfort: 0,
    pain: 0,
    bloating: 0,
    fatigue: 0,
    headache: 0,
    digestion: 0,
  }
}

/**
 * 선택된 상태 칩들 + 전체 강도 → dailyLogs 숫자 필드 묶음.
 * 1) 선택 preset들을 필드별 최대값으로 병합
 * 2) 부하성 필드에만 강도 배수 적용 (capacity 필드는 그대로)
 * 3) 0~10 clamp
 *
 * TODO(혼합 상태 재검토): calm/안정과 불안·짜증·슬픔을 동시에 고르면 preset 최대값 병합으로
 * calm이 높게 남아 calcEmotionalLoad의 `- calm*0.8` 상쇄가 감정 부하를 낮출 수 있다.
 * 혼합 감정은 실제로 가능하므로 이번 단계에서는 상호배타/공식을 바꾸지 않는다.
 * 실제 사용 데이터가 더 쌓인 뒤 별도 점수 보정 단계에서 calm 병합·상쇄 방식을 재검토한다.
 */
export function buildStateNumericFields(
  stateCodes: string[],
  intensityCode: string,
): Record<string, number> {
  const merged = zeroNumericFields()

  for (const code of stateCodes) {
    const preset = STATE_PRESET_BY_CODE.get(code)
    if (!preset) continue
    for (const [field, value] of Object.entries(preset.patch)) {
      if (typeof value === 'number') {
        merged[field] = Math.max(merged[field] ?? 0, value)
      }
    }
  }

  const multiplier = OVERALL_INTENSITY_MULTIPLIER[intensityCode] ?? 1.0
  for (const field of LOAD_FIELDS) {
    merged[field] = clamp10((merged[field] ?? 0) * multiplier)
  }
  for (const field of Object.keys(merged)) {
    merged[field] = clamp10(merged[field])
  }

  return merged
}
