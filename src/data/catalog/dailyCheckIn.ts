import type {
  BodyEnergyLevel,
  BodySignalCode,
  DayContextCode,
  MentalSpaceLevel,
  RhythmExceptionCode,
} from '../models'

export const BODY_ENERGY_OPTIONS: { code: BodyEnergyLevel; label: string }[] = [
  { code: 'charged', label: '충전됨' },
  { code: 'okay', label: '괜찮음' },
  { code: 'low', label: '떨어짐' },
  { code: 'empty', label: '방전' },
]

export const MENTAL_SPACE_OPTIONS: { code: MentalSpaceLevel; label: string }[] = [
  { code: 'spacious', label: '여유 있음' },
  { code: 'okay', label: '보통' },
  { code: 'busy', label: '복잡함' },
  { code: 'overloaded', label: '가득 참' },
]

export const DAY_CONTEXT_OPTIONS: { code: DayContextCode; label: string }[] = [
  { code: 'office', label: '출근' },
  { code: 'remote', label: '재택' },
  { code: 'off', label: '휴일' },
  { code: 'special', label: '특별일' },
]

export const BODY_SIGNAL_OPTIONS: { code: BodySignalCode; label: string }[] = [
  { code: 'heavy_body', label: '몸이 무거움' },
  { code: 'head_eye_fatigue', label: '두통·눈 피로' },
  { code: 'neck_shoulder_tension', label: '목·어깨 긴장' },
  { code: 'bloating_digestive', label: '복부팽만·소화 불편' },
  { code: 'period_cramps', label: '생리통' },
  { code: 'malaise', label: '몸살 느낌' },
  { code: 'none', label: '특별한 신호 없음' },
]

export const RHYTHM_EXCEPTION_OPTIONS: { code: RhythmExceptionCode; label: string }[] = [
  { code: 'illness', label: '감기·몸살' },
  { code: 'injury', label: '부상' },
  { code: 'medication_change', label: '약 복용·변경' },
  { code: 'vaccination', label: '예방접종' },
  { code: 'hangover', label: '숙취' },
  { code: 'none', label: '없음' },
]

const BODY_ENERGY_VALUE: Record<BodyEnergyLevel, number> = {
  charged: 9,
  okay: 6,
  low: 3,
  empty: 1,
}

const BODY_ENERGY_LOAD: Record<BodyEnergyLevel, number> = {
  charged: 0,
  okay: 18,
  low: 58,
  empty: 88,
}

const MENTAL_SPACE_LOAD: Record<MentalSpaceLevel, number> = {
  spacious: 0,
  okay: 18,
  busy: 55,
  overloaded: 85,
}

const MENTAL_SPACE_FOCUS: Record<MentalSpaceLevel, number> = {
  spacious: 8,
  okay: 6,
  busy: 3,
  overloaded: 1,
}

const BODY_SIGNAL_LOAD: Record<Exclude<BodySignalCode, 'none'>, number> = {
  heavy_body: 50,
  head_eye_fatigue: 45,
  neck_shoulder_tension: 40,
  bloating_digestive: 50,
  period_cramps: 55,
  malaise: 65,
}

export function bodyEnergyValue(level: BodyEnergyLevel | undefined): number | undefined {
  return level ? BODY_ENERGY_VALUE[level] : undefined
}

export function bodyEnergyLoad(level: BodyEnergyLevel | undefined): number {
  return level ? BODY_ENERGY_LOAD[level] : 0
}

export function mentalSpaceLoad(level: MentalSpaceLevel | undefined): number {
  return level ? MENTAL_SPACE_LOAD[level] : 0
}

export function mentalSpaceFocus(level: MentalSpaceLevel | undefined): number | undefined {
  return level ? MENTAL_SPACE_FOCUS[level] : undefined
}

/** 여러 몸 신호가 있으면 가장 큰 신호를 중심으로, 추가 신호는 소폭만 더한다. */
export function bodySignalsLoad(codes: BodySignalCode[] | undefined): number {
  const active = (codes ?? []).filter((c): c is Exclude<BodySignalCode, 'none'> => c !== 'none')
  if (active.length === 0) return 0
  const values = active.map((c) => BODY_SIGNAL_LOAD[c]).sort((a, b) => b - a)
  return Math.min(100, values[0] + Math.min(15, (values.length - 1) * 5))
}

export function hasRhythmException(codes: RhythmExceptionCode[] | undefined): boolean {
  return (codes ?? []).some((c) => c !== 'none')
}

export function rhythmExceptionLabels(codes: RhythmExceptionCode[] | undefined): string[] {
  const byCode = new Map(RHYTHM_EXCEPTION_OPTIONS.map((o) => [o.code, o.label]))
  return (codes ?? []).filter((c) => c !== 'none').map((c) => byCode.get(c) ?? c)
}
