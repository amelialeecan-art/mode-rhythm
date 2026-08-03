/* =====================================================================
   MODE · Episode Insight 서비스 (읽기 전용 조립)
   저장 데이터를 한 번씩 읽어 순수 엔진(episode timeline + repeated motif)을
   정해진 순서로 호출하고, 화면이 한 번만 부르면 되는 snapshot으로 합친다.

   ⚠️ 읽기 전용 — repository write 없음, 새 저장/캐시 없음.
   ⚠️ 사용자 문장·점수·추천·예측을 만들지 않는다(구조 데이터만).
   ⚠️ 엔진을 복사/재구현하지 않는다 — engine 공개 API만 순서대로 호출한다.
   ===================================================================== */
import type { ISODate, DailyLog, EventLog, RecoveryLog } from '../models'
import { dailyLogRepository, eventLogRepository, recoveryLogRepository } from '../repositories'
import { getTodayISODate } from '../../lib/date'
import {
  buildEpisodeTimeline,
  deriveSequenceContext,
  buildTimelineRuns,
  buildTimelineTransitions,
  buildTimelineAftereffects,
  assembleEpisodeTimelines,
  selectMostRecentEpisode,
  detectRepeatedEpisodeMotifs,
  matchEpisodeToRepeatedMotifs,
  addDaysISO,
  type EpisodeTimeline,
  type RepeatedEpisodeMotif,
  type MotifMatch,
} from '../../engine'

/** 최근 실제 흐름 계산 범위(일). */
export const RECENT_EPISODE_DAYS = 90
/** 반복 motif 계산 범위(일). */
export const MOTIF_ANALYSIS_DAYS = 365
/** 90일 시작 직전, 흐름 onset 연결 확인용 소량 lookback(일). 반환은 최근 범위와 연결된 흐름만. */
export const RECENT_LOOKBACK_DAYS = 7

export interface EpisodeInsightSnapshot {
  /** 최근 실제 흐름 하나(completed 또는 진행 중). 없으면 null. 반복 패턴을 뜻하지 않는다. */
  recentEpisode: EpisodeTimeline | null
  /** 반복된 변화 순서(엔진 기준: completed 3+). 최대 5개(엔진 제한 유지). */
  repeatedMotifs: RepeatedEpisodeMotif[]
  /** recentEpisode가 ongoing일 때만, 기존 motif와 현재까지 겹치는 부분. 아니면 빈 배열. */
  currentMotifMatches: MotifMatch[]
  analysisRange: {
    /** 최근 흐름 범위 시작(today-89). */
    recentStartDate: ISODate
    /** motif 범위 시작(today-364). */
    motifStartDate: ISODate
    /** 분석 끝(today). */
    endDate: ISODate
  }
}

/** 메모리 데이터로만 순수 엔진을 순서대로 호출해 EpisodeTimeline[]로 조립한다(재조회 없음). */
function assembleFrom(dailyLogs: DailyLog[], eventLogs: EventLog[], recoveryLogs: RecoveryLog[], today: ISODate): EpisodeTimeline[] {
  const items = buildEpisodeTimeline({ dailyLogs, eventLogs }, today) // 1
  const ctx = deriveSequenceContext(dailyLogs, today) // 2
  const runs = buildTimelineRuns(items, ctx) // 3
  const transitions = buildTimelineTransitions(runs, ctx) // 4
  const aftereffects = buildTimelineAftereffects(runs, transitions) // 5
  return assembleEpisodeTimelines({
    runs,
    transitions,
    aftereffects,
    ctx,
    recoveryActions: recoveryLogs.map((r) => ({ date: r.date, actionCode: r.actionCode })), // recovery는 시간상 참조로만
  }) // 6
}

/**
 * 화면용 단일 진입점. today 이전 최대 365일 원본을 저장소에서 한 번씩만 읽고,
 * 90일(recent)·365일(motif) subset으로 나눠 순수 엔진에 넘긴다.
 * @param today 테스트 주입용(미지정 시 오늘). 미래 기록은 항상 제외한다.
 */
export async function getEpisodeInsightSnapshot(today: ISODate = getTodayISODate()): Promise<EpisodeInsightSnapshot> {
  const endDate = today
  const motifStartDate = addDaysISO(endDate, -(MOTIF_ANALYSIS_DAYS - 1))
  const recentStartDate = addDaysISO(endDate, -(RECENT_EPISODE_DAYS - 1))
  const recentReadStart = addDaysISO(recentStartDate, -RECENT_LOOKBACK_DAYS) // onset 연결 확인용 소량 lookback

  // 원본을 딱 한 번씩만 읽는다(365일 범위). 이후는 전부 메모리 subset.
  const [dailyRaw, eventRaw, recoveryRaw] = await Promise.all([
    dailyLogRepository.listByDateRange(motifStartDate, endDate),
    eventLogRepository.listByDateRange(motifStartDate, endDate),
    recoveryLogRepository.listByDateRange(motifStartDate, endDate),
  ])

  // 미래 방어: today 이후 기록은 사용하지 않는다.
  const dailyAll = dailyRaw.filter((l) => l.date <= endDate)
  const eventAll = eventRaw.filter((e) => e.date <= endDate)
  const recoveryAll = recoveryRaw.filter((r) => r.date <= endDate)

  // 최근 흐름용 subset(90일 + 소량 lookback).
  const dailyRecent = dailyAll.filter((l) => l.date >= recentReadStart)
  const eventRecent = eventAll.filter((e) => e.date >= recentReadStart)
  const recoveryRecent = recoveryAll.filter((r) => r.date >= recentReadStart)

  // recentEpisode: 90일 subset에서 조립 후 가장 최근 흐름 선택. 최근 범위와 실제로 연결된 것만 반환.
  const recentEpisodes = assembleFrom(dailyRecent, eventRecent, recoveryRecent, endDate)
  const candidate = selectMostRecentEpisode(recentEpisodes) // 7
  const recentEpisode = candidate && candidate.endDate >= recentStartDate ? candidate : null

  // repeatedMotifs: 365일 전체에서 조립 후 반복 순서 탐지(엔진 최대 5개 제한 유지, 미래 제외).
  const motifEpisodes = assembleFrom(dailyAll, eventAll, recoveryAll, endDate)
  const repeatedMotifs = detectRepeatedEpisodeMotifs(motifEpisodes, { today: endDate }) // 8

  // currentMotifMatches: recentEpisode가 ongoing일 때만. 예측 없이 현재까지 겹치는 key만.
  const currentMotifMatches: MotifMatch[] =
    recentEpisode && recentEpisode.status === 'ongoing' ? matchEpisodeToRepeatedMotifs(recentEpisode, repeatedMotifs) : [] // 9

  return {
    recentEpisode,
    repeatedMotifs,
    currentMotifMatches,
    analysisRange: { recentStartDate, motifStartDate, endDate },
  }
}
