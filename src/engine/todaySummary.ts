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
import { resolveDailyStateDomains, type DailyStateDomains } from './stateDomains'
import { describeTodayState } from './todayDecision'
import { rhythmExceptionLabels } from '../data/catalog/dailyCheckIn'

export type FactorTier = 'recorded' | 'calculated' | 'watch' | 'not_enough_data'

export interface FactorCandidate {
  label: string
  tier: FactorTier
  detail: string
}

/** 오늘 있었던 일 요약 (0~100 사건 점수 대신 개수·주요 사건으로 표시). */
export interface EventSummary {
  count: number
  top: { label: string; intensity: number }[]
}

export interface TodaySummary {
  date: ISODate
  hasEntry: boolean
  classification: DayClassification
  scores: DayScores
  /**
   * 영역별로 분리해 읽은 상태(감정 안정감/부담 두 축 포함). 전체 점수를 나눈 게 아니라
   * 직접 입력값을 우선순위대로 해석한 값. Today 문장은 이걸 쓴다(원본 보존).
   */
  stateDomains: DailyStateDomains
  /** stateDomains 대비로 만든 오늘 상태 설명(1~2문장). 입력이 거의 없으면 빈 배열. */
  stateNarrative: string[]
  cycleContext: CycleContext
  factorCandidates: FactorCandidate[]
  /** 오늘 있었던 일 개수 + 주요 사건 (사건 부하 숫자 노출 대체). */
  eventSummary: EventSummary
  plan: TodayPlan
  /** 오늘 기록된 회복 행동 라벨(분석 추천 아님 — 단순 기록). */
  recordedRecovery: string[]
  /** 질병·부상 등 평소 리듬과 분리해 볼 예외 기록. */
  rhythmExceptions: string[]
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
    weighted.push({ w: scores.sleepLoad, c: { label: '수면 문제 정도', tier: 'calculated', detail: '오늘 기록에서 수면 문제 정도가 높게 계산됐어요.' } })
  if (scores.appetiteLoad >= HIGH)
    weighted.push({ w: scores.appetiteLoad, c: { label: '식욕 흔들림', tier: 'calculated', detail: '오늘 기록에서 식욕 흔들림이 높게 계산됐어요.' } })
  if (scores.emotionalLoad >= HIGH)
    weighted.push({ w: scores.emotionalLoad, c: { label: '감정 흔들림', tier: 'calculated', detail: '오늘 기록에서 감정 흔들림이 높게 계산됐어요.' } })
  if (scores.bodyLoad >= HIGH)
    weighted.push({ w: scores.bodyLoad, c: { label: '몸 불편', tier: 'calculated', detail: '오늘 기록에서 몸 불편이 높게 계산됐어요.' } })

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
  const stateDomains = resolveDailyStateDomains(dailyLog)
  const stateNarrative = describeTodayState(stateDomains, dailyLog)

  const classification = classifyDay({ scores, log: dailyLog, events, cycle: cycleContext, periodPain })
  const plan = buildTodayPlan({ scores, log: dailyLog, events })
  const factorCandidates = buildFactorCandidates(scores, cycleContext, events)

  const recordedRecovery = Array.from(new Set(recoveryLogs.map((r) => r.actionLabel)))

  const eventSummary: EventSummary = {
    count: events.length,
    top: [...events]
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 3)
      .map((e) => ({ label: e.eventLabel, intensity: e.intensity })),
  }

  return {
    date,
    hasEntry: true,
    classification,
    scores,
    stateDomains,
    stateNarrative,
    cycleContext,
    factorCandidates,
    eventSummary,
    plan,
    recordedRecovery,
    rhythmExceptions: rhythmExceptionLabels(dailyLog.rhythmExceptionCodes),
  }
}
