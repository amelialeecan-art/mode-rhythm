/* =====================================================================
   MODE · 가벼운 리듬 참고(forecast) — 순수 함수, 규칙 기반
   "예측 확정"이 아니라 "현재 기록 기반 참고값"이다. DB에 저장하지 않는다.
   머신러닝 없음. classifyDay/calcRhythmLoad를 재사용한다.
   주의: 미래 사건·회복은 알 수 없으므로 낮게/약하게만 반영한다.
   ===================================================================== */
import type { DailyLog, DailyScore, DayTypeCode, ISODate } from '../data/models'
import { calcRhythmLoad } from './scoring'
import { classifyDay, type DayScores } from './classify'
import { buildTodayPlan } from './todayPlan'
import type { CycleContext } from './cycle'
import { clamp, roundScore } from './guards'

export interface RhythmForecastDay {
  date: ISODate
  dayOffset: number
  predictedScores: {
    emotionalLoad: number
    appetiteLoad: number
    sleepLoad: number
    bodyLoad: number
    cycleLoad: number
    eventLoad: number
    rhythmLoad: number
    recoveryScore: number
  }
  predictedDayType: DayTypeCode
  label: string
  subLabel: string
  confidence: number
  note: string
  /** 1줄짜리 참고 설계 힌트 (일정 · 식사). */
  planHint: string
}

export interface ForecastInput {
  targetDate: ISODate
  dayOffset: number
  /** targetDate 이전의 실제 dailyScores (오름차순). 미래값을 섞지 않는다. */
  recent: DailyScore[]
  /** targetDate의 주기 context (서비스가 날짜로 계산). */
  cycle: CycleContext
  /** targetDate의 주기 부하 (서비스가 calcCycleLoad로 계산). */
  cycleLoad: number
}

type ScoreField = 'emotionalLoad' | 'appetiteLoad' | 'sleepLoad' | 'bodyLoad' | 'eventLoad' | 'recoveryScore'

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function avgOf(scores: DailyScore[], field: ScoreField): number {
  return mean(scores.map((s) => (field === 'recoveryScore' ? (s.recoveryScore ?? 0) : s[field])))
}

function zeroLog(date: ISODate): DailyLog {
  return {
    date,
    moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0,
    calm: 0, energy: 0, focus: 0, selfCriticism: 0, impulsivity: 0,
    appetite: 0, sweetCraving: 0, saltyCraving: 0, bingeUrge: 0,
    bodyDiscomfort: 0, pain: 0, bloating: 0, fatigue: 0, headache: 0, digestion: 0,
    createdAt: '', updatedAt: '',
  }
}

/** 기록일수 기반 confidence band. cycle confidence가 낮으면 살짝 깎고, 멀수록 약간 감쇠. */
export function forecastConfidence(recordedDays: number, cycle: CycleContext, dayOffset: number): number {
  let base: number
  if (recordedDays < 3) base = 20
  else if (recordedDays <= 6) base = 35
  else if (recordedDays <= 13) base = 50
  else if (recordedDays <= 29) base = 65
  else base = 75
  if (cycle.confidence === 'low' || cycle.confidence === 'none') base -= 10
  base -= (dayOffset - 1) * 5 // 멀어질수록 참고도 감쇠
  return Math.round(clamp(base, 10, 100))
}

/** 단순 규칙 기반 리듬 참고값 1일. */
export function forecastRhythmDay(input: ForecastInput): RhythmForecastDay {
  const { recent, cycle, cycleLoad, targetDate, dayOffset } = input
  const last3 = recent.slice(-3)
  const last7 = recent.slice(-7)
  const lastActual = recent[recent.length - 1]
  const prevSleep = lastActual?.sleepLoad ?? 0
  const prevEvent = lastActual?.eventLoad ?? 0

  const a3 = (f: ScoreField) => avgOf(last3, f)
  const a7 = (f: ScoreField) => avgOf(last7, f)
  const c = clamp

  const emotionalLoad = roundScore(c(a3('emotionalLoad') * 0.4 + a7('emotionalLoad') * 0.2 + prevSleep * 0.2 + cycleLoad * 0.2, 0, 100))
  const appetiteLoad = roundScore(c(a3('appetiteLoad') * 0.35 + a7('appetiteLoad') * 0.2 + prevSleep * 0.2 + cycleLoad * 0.25, 0, 100))
  const sleepLoad = roundScore(c(a3('sleepLoad') * 0.55 + a7('sleepLoad') * 0.3 + prevEvent * 0.15, 0, 100))
  const bodyLoad = roundScore(c(a3('bodyLoad') * 0.35 + a7('bodyLoad') * 0.3 + cycleLoad * 0.35, 0, 100))
  // 미래 사건/회복은 알 수 없으므로 낮게/약하게만
  const eventLoad = roundScore(c(a7('eventLoad') * 0.3, 0, 100))
  const recoveryScore = roundScore(c(a7('recoveryScore') * 0.2, 0, 100))
  const cycleLoadOut = roundScore(c(cycleLoad, 0, 100))

  const rhythmLoad = calcRhythmLoad({ emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, cycleLoad: cycleLoadOut, eventLoad })

  const scores: DayScores = { emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, cycleLoad: cycleLoadOut, eventLoad, rhythmLoad }
  const log = zeroLog(targetDate)
  const classification = classifyDay({ scores, log, events: [], cycle, periodPain: 0 })
  const plan = buildTodayPlan({ scores, log, events: [] })

  const confidence = forecastConfidence(recent.length, cycle, dayOffset)
  const note =
    confidence <= 35
      ? '아직 기록이 적어 참고용으로만 봐주세요.'
      : '최근 기록과 주기 위치를 바탕으로 한 참고예요. 확정은 아니에요.'

  return {
    date: targetDate,
    dayOffset,
    predictedScores: {
      emotionalLoad,
      appetiteLoad,
      sleepLoad,
      bodyLoad,
      cycleLoad: cycleLoadOut,
      eventLoad,
      rhythmLoad,
      recoveryScore,
    },
    predictedDayType: classification.dayType,
    label: classification.label,
    subLabel: classification.subLabel,
    confidence,
    note,
    planHint: `${plan.schedule} · ${plan.food}`,
  }
}
