/* =====================================================================
   MODE · 하루 상태 영역 해석 (순수 함수 · step2)
   저장된 "직접 입력값"을 상태·흐름 분석이 공유할 하나의 형태로 정리한다.
   전체 점수로 먼저 합친 뒤 다시 나누지 않는다 — 영역을 처음부터 분리해서 읽는다.

   각 영역 값 결정 우선순위(공통):
     1) step1에서 추가한 직접 입력값(level/코드)
     2) 기존 저장 숫자 필드
     3) 옛 stateCodes에서 가능한 fallback
     4) 아무 근거가 없으면 undefined (미입력을 정상·보통으로 채우지 않는다)

   double count 금지: 각 영역은 위 사슬에서 "먼저 맞은 한 출처"만 쓴다.
   같은 의미의 직접값과 옛 상태칩이 함께 있어도 직접값만 반영한다.

   상태와 사건 분리: 이 resolver는 dailyLog(사용자가 입력한 현재 상태)만 본다.
   업무 압박·갈등·약속 같은 eventLog는 여기서 상태 영역을 낮추거나 높이지 않는다.
   (몸 신호 bodySignalCodes는 사건이 아니라 현재 신체 증상이므로 몸의 불편에 쓴다.)

   감정은 두 축으로 분리해 보존한다:
     - emotionalStability: 하루 동안 감정이 얼마나 안정적으로 유지됐는지(수용력)
     - emotionalBurden:    예민·짜증·불안·가라앉음 등이 얼마나 영향을 줬는지(부담)
   가라앉았다는 이유로 안정감을 무조건 낮추지 않고, 안정감으로 부담을 덮어쓰지 않는다.
   ===================================================================== */
import type { DailyLog } from '../data/models'
import { bodyEnergyValue, bodySignalsLoad } from '../data/catalog/dailyCheckIn'
import { clamp, normalizeTo100, roundScore } from './guards'

/** 영역 값이 어느 출처에서 왔는지(우선순위 검증·이중계산 방지 확인용). */
export type DomainSource = 'direct' | 'stored' | 'legacy'

/**
 * 한 영역의 읽기 결과. value는 0~100.
 * kind='capacity' → 높을수록 여유·좋음(안정감·에너지·머릿속 여유·집중·사회 여유)
 * kind='strain'   → 높을수록 부담·나쁨(감정 부담·수면 문제·식욕 흔들림·몸 불편·생활기능 저하)
 */
export interface DomainReading {
  value: number
  source: DomainSource
  kind: 'capacity' | 'strain'
}

export interface DailyStateDomains {
  /** 감정 안정감(수용력). */
  emotionalStability?: DomainReading
  /** 감정 불편·부담(부담). 안정감과 별개 축. */
  emotionalBurden?: DomainReading
  /** 몸 에너지(수용력). */
  bodyEnergy?: DomainReading
  /** 머릿속 여유(수용력). */
  mentalSpace?: DomainReading
  /** 집중력(수용력). */
  focus?: DomainReading
  /** 수면 문제 정도(부담). 사건이 아니라 지난밤 수면·수면 숫자 입력만. */
  sleep?: DomainReading
  /** 식욕·단것 당김 흔들림(부담). 실제 먹은 사건이 아니라 상태 입력만. */
  appetite?: DomainReading
  /** 몸의 불편(부담). 몸 신호 + 몸 불편 숫자. */
  bodyDiscomfort?: DomainReading
  /** 생활기능 저하(부담). functionLevel 1~4 → 0(유지)~100(멈춤). */
  functionLevel?: DomainReading
  /** 사람을 대할 여유(수용력). */
  socialCapacity?: DomainReading
}

/* ---- level → 0~100 매핑 (직접 입력 우선) ---- */
const STABILITY_CAPACITY: Record<NonNullable<DailyLog['emotionalStabilityLevel']>, number> = {
  very_stable: 95,
  mostly_stable: 75,
  slightly_shaken: 50,
  quite_shaken: 25,
  mostly_shaken: 8,
}
const MENTAL_SPACE_CAPACITY: Record<NonNullable<DailyLog['mentalSpaceLevel']>, number> = {
  spacious: 90,
  okay: 65,
  busy: 35,
  overloaded: 10,
}
const FOCUS_CAPACITY: Record<NonNullable<DailyLog['focusLevel']>, number> = {
  well: 85,
  mostly: 65,
  often_scattered: 30,
  rarely: 10,
}
const SOCIAL_CAPACITY: Record<NonNullable<DailyLog['socialCapacityLevel']>, number> = {
  enough: 90,
  okay: 65,
  low: 30,
  rarely: 10,
}

const to100 = (v10: number) => clamp(roundScore(v10 * 10), 0, 100)
const cap = (value: number, source: DomainSource): DomainReading => ({ value: clamp(roundScore(value), 0, 100), source, kind: 'capacity' })
const strain = (value: number, source: DomainSource): DomainReading => ({ value: clamp(roundScore(value), 0, 100), source, kind: 'strain' })

const legacyCodes = (log: DailyLog): string[] => log.stateCodes ?? []
/** 감정 부담 숫자(0~100). calm은 빼지 않는다 — 안정감과 별개 축이므로 부담을 가리지 않는다. */
function burdenScore(log: DailyLog): number {
  const raw =
    log.moodLow * 1.2 +
    log.anxiety * 1.1 +
    log.irritability * 1.0 +
    log.sadness * 1.1 +
    log.heaviness * 1.3 +
    log.impulsivity * 0.8
  return roundScore(normalizeTo100(Math.max(0, raw), 64))
}
const anyBurdenField = (log: DailyLog): boolean =>
  log.moodLow > 0 || log.anxiety > 0 || log.irritability > 0 || log.sadness > 0 || log.heaviness > 0 || log.impulsivity > 0

/* ---- 개별 영역 resolver ---- */

function resolveStability(log: DailyLog): DomainReading | undefined {
  if (log.emotionalStabilityLevel != null) return cap(STABILITY_CAPACITY[log.emotionalStabilityLevel], 'direct')
  // 저장 숫자: calm은 상태칩/감정 입력이 있는 날에만 의미가 있다(빈 저장의 0은 근거 아님).
  if (log.calm > 0) return cap(to100(log.calm), 'stored')
  if (legacyCodes(log).includes('calm')) return cap(STABILITY_CAPACITY.mostly_stable, 'legacy')
  return undefined
}

function resolveBurden(log: DailyLog): DomainReading | undefined {
  const emotionChosen = (log.emotionCodes?.length ?? 0) > 0
  // 감정 UI를 실제로 쓴 날: 감정 부담을 직접값으로 본다(감정 없이 안정만 고른 날은 부담 0 = "부담 없음").
  if (emotionChosen) return strain(burdenScore(log), 'direct')
  if (log.emotionalStabilityLevel != null) return strain(anyBurdenField(log) ? burdenScore(log) : 0, 'direct')
  if (anyBurdenField(log)) return strain(burdenScore(log), 'stored')
  // 옛 기록: 숫자 없이 감정 상태칩만 있는 드문 경우
  const legacy = legacyCodes(log)
  if (legacy.some((c) => ['irritable', 'annoyed', 'angry', 'anxious', 'sad', 'tearful', 'lethargic'].includes(c)))
    return strain(50, 'legacy')
  return undefined
}

function resolveBodyEnergy(log: DailyLog): DomainReading | undefined {
  if (log.bodyEnergyLevel != null) return cap(to100(bodyEnergyValue(log.bodyEnergyLevel) ?? 0), 'direct')
  if (log.energy > 0) return cap(to100(log.energy), 'stored')
  if (legacyCodes(log).includes('drained')) return cap(20, 'legacy')
  return undefined
}

function resolveMentalSpace(log: DailyLog): DomainReading | undefined {
  if (log.mentalSpaceLevel != null) return cap(MENTAL_SPACE_CAPACITY[log.mentalSpaceLevel], 'direct')
  return undefined // 머릿속 여유 전용 숫자 필드는 없다(집중·감정으로 대체하지 않는다).
}

function resolveFocus(log: DailyLog): DomainReading | undefined {
  if (log.focusLevel != null) return cap(FOCUS_CAPACITY[log.focusLevel], 'direct')
  if (log.focus > 0) return cap(to100(log.focus), 'stored')
  if (legacyCodes(log).includes('unfocused')) return cap(30, 'legacy')
  return undefined
}

function resolveSocialCapacity(log: DailyLog): DomainReading | undefined {
  if (log.socialCapacityLevel != null) return cap(SOCIAL_CAPACITY[log.socialCapacityLevel], 'direct')
  if (legacyCodes(log).includes('social_fatigue')) return cap(30, 'legacy')
  return undefined
}

/** 지난밤 수면·수면 숫자만으로 계산(사건 제외 — 상태/사건 분리). */
function sleepStrainFrom(hours: number | undefined, quality: number | undefined, issueCount: number): number | undefined {
  if (hours === undefined && quality === undefined && issueCount === 0) return undefined
  let debt = 0
  if (hours === undefined) debt = 0
  else if (hours >= 7.5) debt = 0
  else if (hours >= 6.5) debt = 20
  else if (hours >= 5.5) debt = 45
  else if (hours >= 4.5) debt = 70
  else debt = 90
  const qualityPart = quality === undefined ? 0 : (10 - quality) * 4
  return roundScore(clamp(debt + qualityPart + issueCount * 8, 0, 100))
}

function resolveSleep(log: DailyLog): DomainReading | undefined {
  const ln = log.lastNightSleep
  if (ln) {
    const v = sleepStrainFrom(ln.hours, ln.quality, ln.issues?.length ?? 0)
    if (v !== undefined) return strain(v, 'direct')
  }
  const v = sleepStrainFrom(log.sleepHours, log.sleepQuality, 0)
  if (v !== undefined) return strain(v, 'stored')
  return undefined
}

function resolveAppetite(log: DailyLog): DomainReading | undefined {
  const direct = log.appetiteRatings && Object.values(log.appetiteRatings).some((v) => typeof v === 'number')
  const raw = log.appetite * 0.8 + log.sweetCraving * 1.1 + log.saltyCraving * 0.8 + log.bingeUrge * 1.5
  const anyField = log.appetite > 0 || log.sweetCraving > 0 || log.saltyCraving > 0 || log.bingeUrge > 0
  if (direct) return strain(normalizeTo100(Math.max(0, raw), 55), 'direct')
  if (anyField) return strain(normalizeTo100(Math.max(0, raw), 55), 'stored')
  return undefined
}

function resolveBodyDiscomfort(log: DailyLog): DomainReading | undefined {
  const signalLoad = bodySignalsLoad(log.bodySignalCodes)
  const hasSignals = (log.bodySignalCodes ?? []).some((c) => c !== 'none')
  const raw =
    log.bodyDiscomfort * 1.0 +
    log.pain * 1.2 +
    log.bloating * 1.0 +
    log.fatigue * 1.3 +
    log.headache * 0.9 +
    log.digestion * 0.8
  const presetScore = roundScore(normalizeTo100(Math.max(0, raw), 74))
  const anyField = raw > 0
  if (hasSignals) return strain(Math.max(signalLoad, presetScore), 'direct')
  if (anyField) return strain(presetScore, 'stored')
  return undefined
}

function resolveFunction(log: DailyLog): DomainReading | undefined {
  if (log.functionLevel == null) return undefined
  return strain(((log.functionLevel - 1) / 3) * 100, 'direct')
}

/**
 * 하루 상태를 영역별로 분리해 해석한다. 전체 점수를 먼저 만든 뒤 나누지 않는다.
 * 근거가 없는 영역은 undefined로 둔다(정상·보통 자동 채움 금지).
 */
export function resolveDailyStateDomains(log: DailyLog): DailyStateDomains {
  return {
    emotionalStability: resolveStability(log),
    emotionalBurden: resolveBurden(log),
    bodyEnergy: resolveBodyEnergy(log),
    mentalSpace: resolveMentalSpace(log),
    focus: resolveFocus(log),
    sleep: resolveSleep(log),
    appetite: resolveAppetite(log),
    bodyDiscomfort: resolveBodyDiscomfort(log),
    functionLevel: resolveFunction(log),
    socialCapacity: resolveSocialCapacity(log),
  }
}
