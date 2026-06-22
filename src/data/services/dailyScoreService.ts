/* =====================================================================
   MODE · dailyScore 계산/저장 서비스 (Phase 4)
   service가 repository에서 데이터를 모아 engine(순수 함수)에 넣고,
   결과를 dailyScores에 upsert한다. engine은 DB를 모른다.

   주의: 여기는 "오늘 하루 점수화 + 모드 분류"까지만. 상관/공범/회복효과/예보 없음.
   ===================================================================== */
import { dailyLogRepository } from '../repositories/dailyLogRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { recoveryLogRepository } from '../repositories/recoveryLogRepository'
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { buildTodaySummary, type TodaySummary } from '../../engine'
import type { DailyScore, DailyScoreInput, ISODate } from '../models'

/** 주기 context 계산을 위해 과거 cycle 로그까지 포함해 불러올 하한 날짜. */
const CYCLE_HISTORY_FLOOR = '1900-01-01'

/** 해당 날짜의 저장 기록을 모아 engine으로 Today ViewModel을 만든다. 기록 없으면 null. */
async function buildSummaryFromDb(date: ISODate): Promise<TodaySummary | null> {
  const dailyLog = await dailyLogRepository.getByDate(date)
  if (!dailyLog) return null

  const [events, cycleLogs, recoveryLogs, settings] = await Promise.all([
    eventLogRepository.listByDate(date),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, date),
    recoveryLogRepository.listByDate(date),
    userSettingsRepository.get(),
  ])
  const todayCycleLog = cycleLogs.find((c) => c.date === date)

  return buildTodaySummary({ date, dailyLog, events, cycleLogs, todayCycleLog, recoveryLogs, settings })
}

/**
 * 이번 단계 confidence: "오늘 기록을 얼마나 점수화할 수 있었나" 수준.
 * (장기 상관분석 신뢰도와 혼동하지 말 것)
 * 기록+dailyLog: 60, cycle confidence medium/high: +10, events 있음: +10, 최대 80.
 */
function computeConfidence(summary: TodaySummary, hasEvents: boolean): number {
  let c = 60
  if (summary.cycleContext.confidence === 'medium' || summary.cycleContext.confidence === 'high') c += 10
  if (hasEvents) c += 10
  return Math.min(80, c)
}

/** 해당 날짜 점수를 다시 계산해 dailyScores에 upsert한다. 기록 없으면 null. */
export async function recalculateDailyScore(date: ISODate): Promise<DailyScore | null> {
  const summary = await buildSummaryFromDb(date)
  if (!summary) return null

  const events = await eventLogRepository.listByDate(date)
  const input: DailyScoreInput = {
    date,
    emotionalLoad: summary.scores.emotionalLoad,
    appetiteLoad: summary.scores.appetiteLoad,
    sleepLoad: summary.scores.sleepLoad,
    bodyLoad: summary.scores.bodyLoad,
    cycleLoad: summary.scores.cycleLoad,
    eventLoad: summary.scores.eventLoad,
    rhythmLoad: summary.scores.rhythmLoad,
    recoveryScore: 0, // 회복 효과 분석은 후속 단계
    dayType: summary.classification.dayType,
    dayTypeSubLabel: summary.classification.subLabel,
    confidence: computeConfidence(summary, events.length > 0),
  }
  await dailyScoreRepository.upsert(input)
  return (await dailyScoreRepository.getByDate(date)) ?? null
}

/** Today 화면용 ViewModel. 기록 없으면 null(빈 상태). 항상 최신 계산값을 반환. */
export async function getTodaySummary(date: ISODate): Promise<TodaySummary | null> {
  return buildSummaryFromDb(date)
}
