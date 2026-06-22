/* =====================================================================
   MODE · Today ViewModel 생성 (순수 함수)
   화면이 쓰기 쉬운 형태로 점수/분류/요인후보/설계를 조립한다.
   요인 후보는 "상관관계로 밝혀진 원인"이 아니다 — 오늘 기록 기준 계산이다.
   ===================================================================== */
import type { CycleLog, DailyLog, EventLog, ISODate, RecoveryLog, UserSettings } from '../data/models'
import { buildCycleContext, calcCycleLoad, type CycleContext } from './cycle'
import {
  calcAppetiteLoad,
  calcBodyLoad,
  calcEmotionalLoad,
  calcEventLoad,
  calcRhythmLoad,
  calcSleepLoad,
} from './scoring'
import { classifyDay, type DayClassification, type DayScores } from './classify'
import { buildTodayPlan, type TodayPlan } from './todayPlan'

export type FactorTier = 'recorded' | 'calculated' | 'watch' | 'not_enough_data'

export interface FactorCandidate {
  label: string
  tier: FactorTier
  detail: string
}

export interface TodaySummary {
  date: ISODate
  hasEntry: boolean
  classification: DayClassification
  scores: DayScores
  cycleContext: CycleContext
  factorCandidates: FactorCandidate[]
  plan: TodayPlan
  /** 오늘 기록된 회복 행동 라벨(분석 추천 아님 — 단순 기록). */
  recordedRecovery: string[]
}

export interface TodaySummaryInput {
  date: ISODate
  dailyLog: DailyLog
  events: EventLog[]
  /** 주기 context 계산용 과거 포함 cycle 로그. */
  cycleLogs: CycleLog[]
  /** 오늘 날짜의 cycle 로그(있으면). */
  todayCycleLog?: CycleLog
  recoveryLogs: RecoveryLog[]
  settings?: UserSettings
}

const HIGH = 55

function buildFactorCandidates(
  scores: DayScores,
  cycle: CycleContext,
  events: EventLog[],
): FactorCandidate[] {
  const weighted: { c: FactorCandidate; w: number }[] = []

  if (scores.sleepLoad >= HIGH)
    weighted.push({ w: scores.sleepLoad, c: { label: '수면 부하', tier: 'calculated', detail: '오늘 기록에서 수면 관련 부하가 높게 계산됐어요.' } })
  if (scores.appetiteLoad >= HIGH)
    weighted.push({ w: scores.appetiteLoad, c: { label: '식욕 변동', tier: 'calculated', detail: '오늘 기록에서 식욕 관련 부하가 높게 계산됐어요.' } })
  if (scores.emotionalLoad >= HIGH)
    weighted.push({ w: scores.emotionalLoad, c: { label: '감정 부하', tier: 'calculated', detail: '오늘 기록에서 감정 관련 부하가 높게 계산됐어요.' } })
  if (scores.bodyLoad >= HIGH)
    weighted.push({ w: scores.bodyLoad, c: { label: '신체 부하', tier: 'calculated', detail: '오늘 기록에서 몸 관련 부하가 높게 계산됐어요.' } })

  if (cycle.isPeriod)
    weighted.push({ w: scores.cycleLoad, c: { label: '생리 구간', tier: 'calculated', detail: '날짜 기준으로 생리 구간일 가능성이 있어요.' } })
  else if (cycle.isPremenstrualWindow)
    weighted.push({ w: scores.cycleLoad, c: { label: '월경 전 구간', tier: 'calculated', detail: '날짜 기준으로 월경 전 구간일 가능성이 있어요.' } })

  // 강도 높은 오늘 있었던 일 (가장 센 것 1개)
  const topEvent = [...events].filter((e) => e.intensity >= 6).sort((a, b) => b.intensity - a.intensity)[0]
  if (topEvent)
    weighted.push({ w: topEvent.intensity * 8, c: { label: '오늘 있었던 일', tier: 'recorded', detail: `오늘 있었던 일에 '${topEvent.eventLabel}' 기록이 있어요.` } })

  const sorted = weighted.sort((a, b) => b.w - a.w).map((x) => x.c).slice(0, 4)

  if (sorted.length === 0) {
    sorted.push({ label: '설명되지 않은 부분', tier: 'not_enough_data', detail: '아직 장기 패턴 분석 전이라 일부는 설명하지 않아요.' })
  }
  return sorted
}

/** 오늘 기록 → Today ViewModel. dailyLog가 있다는 전제(없으면 service가 null 반환). */
export function buildTodaySummary(input: TodaySummaryInput): TodaySummary {
  const { date, dailyLog, events, cycleLogs, todayCycleLog, recoveryLogs, settings } = input

  const cycleContext = buildCycleContext(date, cycleLogs, settings)
  const periodPain = todayCycleLog?.periodPain ?? 0

  const emotionalLoad = calcEmotionalLoad(dailyLog)
  const appetiteLoad = calcAppetiteLoad(dailyLog, events)
  const sleepLoad = calcSleepLoad(dailyLog, events)
  const bodyLoad = calcBodyLoad(dailyLog, periodPain)
  const eventLoad = calcEventLoad(events)
  const cycleLoad = calcCycleLoad(cycleContext, todayCycleLog)
  const rhythmLoad = calcRhythmLoad({ emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, cycleLoad, eventLoad })

  const scores: DayScores = { emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, cycleLoad, eventLoad, rhythmLoad }

  const classification = classifyDay({ scores, log: dailyLog, events, cycle: cycleContext, periodPain })
  const plan = buildTodayPlan({ scores, log: dailyLog, events })
  const factorCandidates = buildFactorCandidates(scores, cycleContext, events)

  const recordedRecovery = Array.from(new Set(recoveryLogs.map((r) => r.actionLabel)))

  return {
    date,
    hasEntry: true,
    classification,
    scores,
    cycleContext,
    factorCandidates,
    plan,
    recordedRecovery,
  }
}
