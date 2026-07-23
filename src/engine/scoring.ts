/* =====================================================================
   MODE · 점수 계산 엔진 (순수 함수). 모든 부하 0~100.
   입력은 저장 모델 타입(DailyLog/EventLog)이지만 DB는 모른다(타입만 사용).
   ===================================================================== */
import type { DailyLog, EventLog, EventLogCategory } from '../data/models'
import { bodyEnergyLoad, bodySignalsLoad, mentalSpaceLoad } from '../data/catalog/dailyCheckIn'
import { clamp, normalizeTo100, roundScore } from './guards'

/** 사건 카테고리별 기본 가중치 (사건 부하 계산용). */
export const EVENT_CATEGORY_WEIGHTS: Record<EventLogCategory, number> = {
  sleep: 1.0,
  food: 0.9,
  relationship: 1.2,
  work: 1.1,
  body: 1.0,
  appearance: 1.0,
  environment: 0.7,
  digital: 0.8,
  movement: -0.4, // 운동/산책 등은 부하를 살짝 낮추는 쪽 (단, 회복 분석 아님 — 과하게 낮추지 않음)
  control: 1.1, // 통제감/좌절 (계획 틀어짐, 예기 스트레스)
  unknown: 0.2,
  custom: 0.8,
}

function hasEvent(events: EventLog[], code: string): number {
  return events.some((e) => e.eventCode === code) ? 1 : 0
}

/**
 * 감정 부하. calm이 높으면 낮아진다.
 * 안정은 다른 감정과 함께 선택 가능하다(단독=전반적 안정, 복수=안정된 구간이 있었음).
 * TODO(calm 상쇄 강도 재검토): '안정'과 부정 감정을 동시에 기록하면 calm 상쇄로 감정 부하가
 * 낮게 계산될 수 있다. 선택 방식·공식은 유지하고, calm의 점수 상쇄 강도는
 * 실제 기록이 충분히 쌓인 뒤 재검토한다. (statePresets 최대값 병합과 함께 다룰 것)
 */
export function calcEmotionalLoad(log: DailyLog): number {
  const raw =
    log.moodLow * 1.2 +
    log.anxiety * 1.1 +
    log.irritability * 1.0 +
    log.sadness * 1.1 +
    log.heaviness * 1.3 +
    log.selfCriticism * 1.0 +
    log.impulsivity * 0.8 -
    log.calm * 0.8
  const presetScore = roundScore(normalizeTo100(Math.max(0, raw), 64))
  // 머릿속 여유 직접 입력이 있으면 상태 칩 추정보다 우선해 최소 부하선을 잡는다.
  return Math.max(presetScore, mentalSpaceLoad(log.mentalSpaceLevel))
}

/** 식욕 부하. 사건(식사 거름/야식/과식)이 있으면 가산. */
export function calcAppetiteLoad(log: DailyLog, events: EventLog[]): number {
  const mealSkipped = hasEvent(events, 'meal_skipped')
  const lateNightEating = hasEvent(events, 'meal_latenight')
  const overeating = hasEvent(events, 'meal_overeat')
  const raw =
    log.appetite * 0.8 +
    log.sweetCraving * 1.1 +
    log.saltyCraving * 0.8 +
    log.bingeUrge * 1.5 +
    mealSkipped * 6 +
    lateNightEating * 7 +
    overeating * 5
  return roundScore(normalizeTo100(Math.max(0, raw), 55))
}

/** 시간 미입력 시 '잠 부족'(sleep_short)을 수면 점수에 반영 (기존 누락 해결). */
const SLEEP_SHORT_LOAD = 30
/** '늦게 일어남'(woke_late) 반영. */
const SLEEP_WOKE_LATE_LOAD = 6

/**
 * 수면 부하. 지난밤 수면(log.lastNightSleep)을 **단일 출처**로 쓰고,
 * 없으면(옛 기록) 기존 sleep 사건에서 읽는다 → 이중 가산 방지.
 * 시간 구간(hours) + 만족도(quality) + 이슈 보정.
 *
 * ⚠️ 기존 결함 수정: 'sleep_short'(잠 부족)는 그동안 수면 점수에 전혀 반영되지
 * 않았다. 신규 기록은 수면시간 구간의 debt로, 옛 기록의 sleep_short 사건은
 * 아래 SLEEP_SHORT_LOAD로 반영한다(시간이 있으면 debt가 이미 부족을 반영하므로
 * 중복 가산하지 않는다).
 */
export function calcSleepLoad(log: DailyLog, events: EventLog[]): number {
  const ln = log.lastNightSleep
  // 단일 출처: lastNightSleep가 있으면 거기서만, 없으면 legacy sleep 사건에서.
  const hours = ln ? ln.hours : log.sleepHours
  const quality = ln ? ln.quality : log.sleepQuality
  const hasN = (code: string): number => {
    const present = ln ? (ln.issues?.includes(code) ?? false) : hasEvent(events, code) === 1
    return present ? 1 : 0
  }

  let debt = 0
  if (hours === undefined) debt = 0
  else if (hours >= 7.5) debt = 0
  else if (hours >= 6.5) debt = 20
  else if (hours >= 5.5) debt = 45
  else if (hours >= 4.5) debt = 70
  else debt = 90

  const qualityPart = quality === undefined ? 0 : (10 - quality) * 4

  const raw =
    debt +
    qualityPart +
    hasN('sleep_late') * 10 +
    hasN('sleep_waking') * 10 +
    hasN('sleep_nightmare') * 8 +
    hasN('sleep_allnight') * 20 +
    hasN('sleep_much') * 8 +
    // 시간이 입력된 경우 debt가 이미 부족을 반영하므로 sleep_short는 중복 가산하지 않는다.
    (hours === undefined ? hasN('sleep_short') * SLEEP_SHORT_LOAD : 0) +
    hasN('woke_late') * SLEEP_WOKE_LATE_LOAD
  return roundScore(clamp(raw, 0, 100))
}

/** 신체 부하. periodPain(오늘 cycleLog)이 있으면 반영. */
export function calcBodyLoad(log: DailyLog, periodPain = 0): number {
  const raw =
    log.bodyDiscomfort * 1.0 +
    log.pain * 1.2 +
    log.bloating * 1.0 +
    log.fatigue * 1.3 +
    log.headache * 0.9 +
    log.digestion * 0.8 +
    periodPain * 1.2
  const presetScore = roundScore(normalizeTo100(Math.max(0, raw), 74))
  // 직접 입력한 몸 에너지와 구체적 몸 신호는 넓은 '몸 불편' 칩보다 우선한다.
  return Math.max(
    presetScore,
    bodyEnergyLoad(log.bodyEnergyLevel),
    bodySignalsLoad(log.bodySignalCodes),
  )
}

/** 사건 부하. category 가중치 × intensity 합. */
export function calcEventLoad(events: EventLog[]): number {
  let raw = 0
  for (const e of events) {
    raw += e.intensity * (EVENT_CATEGORY_WEIGHTS[e.category] ?? 0.2)
  }
  return roundScore(normalizeTo100(Math.max(0, raw), 35))
}

export interface RhythmParts {
  emotionalLoad: number
  appetiteLoad: number
  sleepLoad: number
  bodyLoad: number
  cycleLoad: number
  eventLoad: number
}

/**
 * 전체 리듬 부하 (가중 평균).
 * 역할 3분할: 상태 = 결과 / 사건 = 설명 후보 / 회복 = 완충 후보.
 * 사건은 당일 단정용이 아니라 패턴 분석의 설명 후보라 가중치를 낮게 둔다(15%→8%).
 * 낮춘 몫은 상태 점수(감정 +5%, 수면 +2%)로 재배분 — 합계 1.0 유지.
 */
export function calcRhythmLoad(p: RhythmParts): number {
  const r =
    p.emotionalLoad * 0.35 +
    p.appetiteLoad * 0.15 +
    p.sleepLoad * 0.17 +
    p.bodyLoad * 0.15 +
    p.cycleLoad * 0.1 +
    p.eventLoad * 0.08
  return roundScore(clamp(r, 0, 100))
}
