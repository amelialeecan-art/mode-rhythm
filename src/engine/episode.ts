/* =====================================================================
   MODE · 무너짐 에피소드 분석 엔진 (순수 함수 · 4단계)
   연속된 기능 저하 구간을 하나의 "에피소드"로 묶고(J), 각 에피소드에
   대해 선행신호/누적조건/전날 경고/당일 동반/이후 행동/주기 위치(I)를
   조립한다. 화면·조기경보·회복추천은 이 단계에서 만들지 않는다.

   판정 원칙 (§16 하이브리드 C):
   - 우선 자기보고 functionLevel≥3 을 '무너짐'으로 확정한다.
   - functionLevel 미기록 날은 rhythmLoad + 개인 기준선으로 '보조 추정'하되
     신뢰도를 낮게 표시한다(estimated). 옛 기록도 커버.
   - 사이 휴지(비무너짐) 1일은 같은 에피소드로 잇고(gap tolerance),
     연속 2일 안정 회복이면 종료한다.

   누수 방지 (§12): 선행신호/누적/전날/당일 신호는 에피소드 시작일 S '이전
   또는 당일' 정보만 쓴다. S 이후 사건은 선행신호에 절대 들어가지 않는다.
   relationToShift='after' 사건과 result_side 그룹도 선행신호에서 제외한다.
   engine은 React/Dexie를 모른다. 입력(배열) → 결과 객체.
   ===================================================================== */
import type { EventRelationToShift, FunctionLevel, ISODate } from '../data/models'
import { parseISODate } from '../lib/date'
import { addDaysISO } from './correlation'
import { factorWindowFor, isLagWithinWindow } from '../data/catalog/events'
import type { CycleContext } from './cycle'

/* ---- 판정 파라미터 (§16) ---- */
export const EPISODE_FUNCTION_THRESHOLD: FunctionLevel = 3 // ≥3 = 무너짐
export const EPISODE_GAP_TOLERANCE_DAYS = 1 // 사이 휴지 허용
export const RECOVERY_CONFIRM_DAYS = 2 // 회복 확정에 필요한 연속 안정일
/* 성능 상한 (§17) */
export const MAX_EPISODE_LAG = 14 // 선행신호 최대 탐색 lag
export const MAX_ANALYSIS_WINDOW_DAYS = 365 // 분석창 상한
/* rhythmLoad 보조 추정(§16 C) — 개인 기준선 대비. */
export const RHYTHM_ESTIMATE_MARGIN = 15 // 기준선 + margin 이상이면 무너짐 추정
export const RHYTHM_ESTIMATE_FLOOR = 55 // 기준선이 낮아도 이 밑으론 추정 안 함

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}
function mean(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((x, y) => x + y, 0) / nums.length
}

/* =====================================================================
   입력 타입
   ===================================================================== */
export interface EpisodeDayInput {
  date: ISODate
  /** 자기보고 일상 기능(1~4). 없으면 rhythmLoad로 보조 추정. */
  functionLevel?: FunctionLevel
  /** 하루 종합 버거움(0~100). 보조 추정/피크 판정용. */
  rhythmLoad?: number
}

/** 요인 발생(이미 발생 추정일로 해석된 사건). timing→date 변환은 호출부 책임. */
export interface EpisodeEvent {
  date: ISODate
  factorGroup: string
  label: string
  relationToShift?: EventRelationToShift
}

export type DayState = 'collapse' | 'stable' | 'unknown'
export type CollapseSource = 'reported' | 'estimated'
export type EpisodeStatus = 'ongoing' | 'recovering' | 'recovered'
export type EpisodeConfidence = 'reported' | 'mixed' | 'estimated'

export interface EpisodeDay {
  date: ISODate
  state: DayState
  source?: CollapseSource
  functionLevel?: FunctionLevel
  rhythmLoad?: number
}

export interface Episode {
  startDate: ISODate
  /** 마지막 무너짐 날(회복 직전). */
  endDate: ISODate
  /** 기능 저하가 가장 심했던 날. */
  peakDate: ISODate
  peakFunctionLevel?: FunctionLevel
  /** startDate~endDate 달력 길이(일). */
  lengthDays: number
  status: EpisodeStatus
  recoveryStartDate?: ISODate
  /** 시작일 대비 회복 시작까지 일수(회복/회복중일 때). */
  daysToRecovery?: number
  /** 추정으로 채운 날이 하나라도 있으면 true. */
  estimated: boolean
  confidence: EpisodeConfidence
  days: EpisodeDay[]
}

/* =====================================================================
   1) 하루 상태 해석 (하이브리드 C)
   ===================================================================== */

/** 제공된 rhythmLoad들의 개인 기준선(평균) → 보조 추정 임계값. */
export function estimateCollapseThreshold(inputs: EpisodeDayInput[]): number {
  const loads = inputs.map((d) => d.rhythmLoad).filter((v): v is number => v !== undefined)
  const baseline = mean(loads)
  return Math.max(baseline + RHYTHM_ESTIMATE_MARGIN, RHYTHM_ESTIMATE_FLOOR)
}

function resolveDay(input: EpisodeDayInput, threshold: number): EpisodeDay {
  const { date, functionLevel, rhythmLoad } = input
  if (functionLevel !== undefined) {
    return {
      date,
      functionLevel,
      rhythmLoad,
      state: functionLevel >= EPISODE_FUNCTION_THRESHOLD ? 'collapse' : 'stable',
      source: 'reported',
    }
  }
  // 미기록: rhythmLoad로 보조 추정(신뢰도 낮음)
  if (rhythmLoad !== undefined) {
    return {
      date,
      rhythmLoad,
      state: rhythmLoad >= threshold ? 'collapse' : 'stable',
      source: 'estimated',
    }
  }
  return { date, state: 'unknown' }
}

/**
 * 입력을 startDate~endDate 달력으로 채워 하루 상태 시퀀스를 만든다.
 * 빠진 날짜는 'unknown'. 분석창 상한(MAX_ANALYSIS_WINDOW_DAYS)으로 자른다.
 */
export function buildDayTimeline(inputs: EpisodeDayInput[]): EpisodeDay[] {
  if (inputs.length === 0) return []
  const byDate = new Map<ISODate, EpisodeDayInput>()
  for (const d of inputs) byDate.set(d.date, d)
  const dates = [...byDate.keys()].sort()
  const threshold = estimateCollapseThreshold(inputs)

  let first = dates[0]
  const last = dates[dates.length - 1]
  // 분석창 상한 적용(끝에서 최대 365일)
  const windowStart = addDaysISO(last, -(MAX_ANALYSIS_WINDOW_DAYS - 1))
  if (first < windowStart) first = windowStart

  const out: EpisodeDay[] = []
  for (let cursor = first; cursor <= last; cursor = addDaysISO(cursor, 1)) {
    const input = byDate.get(cursor)
    out.push(input ? resolveDay(input, threshold) : { date: cursor, state: 'unknown' })
  }
  return out
}

/* =====================================================================
   2) 에피소드 묶기 (J · start/continuation/recovery)
   ===================================================================== */

function summarizeEpisode(days: EpisodeDay[], startIdx: number, lastCollapseIdx: number): Episode {
  const span = days.slice(startIdx, lastCollapseIdx + 1)
  const startDate = days[startIdx].date
  const endDate = days[lastCollapseIdx].date

  // peak: functionLevel 최대 → 없으면 rhythmLoad 최대
  let peak = span[0]
  let peakScore = -1
  for (const d of span) {
    const score = d.functionLevel !== undefined ? d.functionLevel * 100 : (d.rhythmLoad ?? 0)
    if (score > peakScore) {
      peakScore = score
      peak = d
    }
  }

  const anyEstimated = span.some((d) => d.source === 'estimated' || d.state === 'unknown')
  const anyReported = span.some((d) => d.source === 'reported' && d.state === 'collapse')
  const confidence: EpisodeConfidence = !anyReported ? 'estimated' : anyEstimated ? 'mixed' : 'reported'

  // 회복 판정: 마지막 무너짐 이후 연속 비무너짐 일수
  let trailing = 0
  let trailingStable = 0
  for (let k = lastCollapseIdx + 1; k < days.length && days[k].state !== 'collapse'; k++) {
    trailing++
    if (days[k].state === 'stable') trailingStable++
  }
  const recoveryStartDate = lastCollapseIdx + 1 < days.length ? days[lastCollapseIdx + 1].date : undefined

  let status: EpisodeStatus
  if (lastCollapseIdx === days.length - 1) status = 'ongoing'
  else if (trailing >= RECOVERY_CONFIRM_DAYS && trailingStable >= 1) status = 'recovered'
  else status = 'recovering'

  return {
    startDate,
    endDate,
    peakDate: peak.date,
    peakFunctionLevel: peak.functionLevel,
    lengthDays: daysBetween(startDate, endDate) + 1,
    status,
    recoveryStartDate: status === 'ongoing' ? undefined : recoveryStartDate,
    daysToRecovery: recoveryStartDate ? daysBetween(startDate, recoveryStartDate) : undefined,
    estimated: anyEstimated,
    confidence,
    days: span,
  }
}

/**
 * 무너짐 에피소드 목록(오름차순). 규칙:
 * - collapse 날에서 시작.
 * - 다음이 collapse면 계속. 비무너짐이 나오면, 그 뒤 GAP_TOLERANCE 이내에
 *   다시 collapse가 오면 잇고(휴지 허용), 아니면 종료.
 * - 종료 지점 이후는 회복(연속 안정)으로 별도 판정.
 */
export function detectEpisodes(inputs: EpisodeDayInput[]): Episode[] {
  const days = buildDayTimeline(inputs)
  const episodes: Episode[] = []
  const n = days.length
  let i = 0
  while (i < n) {
    if (days[i].state !== 'collapse') {
      i++
      continue
    }
    const startIdx = i
    let lastCollapse = i
    let j = i + 1
    while (j < n) {
      if (days[j].state === 'collapse') {
        lastCollapse = j
        j++
        continue
      }
      // 비무너짐 구간 길이 측정
      let k = j
      while (k < n && days[k].state !== 'collapse') k++
      const gap = k - j
      if (k < n && gap <= EPISODE_GAP_TOLERANCE_DAYS) {
        lastCollapse = k // 휴지 뛰어넘어 잇기
        j = k + 1
      } else {
        break // 회복 또는 데이터 끝
      }
    }
    episodes.push(summarizeEpisode(days, startIdx, lastCollapse))
    i = lastCollapse + 1
  }
  return episodes
}

/* =====================================================================
   3) 에피소드 선행/동반 신호 조립 (§G buckets + §12 누수 방지)
   ===================================================================== */
export interface EpisodeSignal {
  factorGroup: string
  label: string
  /** 결과일(에피소드 시작 S) − 사건 발생일. 0 = 당일. 배경 조건은 가장 가까운 발생 lag. */
  lagDays: number
  /** 배경(누적/연속) 조건일 때 허용 창 안 발생 횟수. 단발 신호는 undefined. */
  occurrences?: number
  relationToShift?: EventRelationToShift
}

export interface CyclePositionSignal {
  phase: 'period' | 'premenstrual' | 'ovulation' | 'other' | 'unknown'
  periodDay?: number
  daysUntilNextPeriod?: number
  confidence: CycleContext['confidence']
}

export interface EpisodeSignals {
  /** 먼저 쌓인 신호: S-2 이상 과거, 허용 창 안, 선행 성격. */
  earlyLeadUp: EpisodeSignal[]
  /** 가까운 경고: 전날(S-1). */
  dayBeforeWarning: EpisodeSignal[]
  /** 당일 동반: S 당일(어느 쪽이 먼저인지 단정하지 않음). */
  sameDayCompanion: EpisodeSignal[]
  /** 배경 조건: 누적/연속 노출(cumulative·trend 그룹). */
  backgroundConditions: EpisodeSignal[]
  /** 이후 행동/결과쪽: relationToShift='after' 또는 result_side. */
  afterShift: EpisodeSignal[]
  /** 주기 위치(I). context 없으면 undefined. */
  cyclePosition?: CyclePositionSignal
}

function cyclePositionFrom(ctx: CycleContext): CyclePositionSignal {
  let phase: CyclePositionSignal['phase']
  if (ctx.confidence === 'none') phase = 'unknown'
  else if (ctx.isPeriod) phase = 'period'
  else if (ctx.isPremenstrualWindow) phase = 'premenstrual'
  else if (ctx.isOvulationWindow) phase = 'ovulation'
  else phase = 'other'
  return {
    phase,
    periodDay: ctx.periodDay,
    daysUntilNextPeriod: ctx.daysUntilNextPeriod,
    confidence: ctx.confidence,
  }
}

/**
 * 에피소드 시작 S 기준으로 사건을 신호 버킷에 분류한다.
 * - S 이후(lag<0) 사건은 어떤 선행신호에도 들어가지 않는다(누수 방지).
 * - relationToShift='after' 또는 result_side 그룹은 afterShift로만 간다.
 * - 허용 창(§15) 밖 lag는 선행신호에서 제외(당일 동반은 창과 무관하게 별도 처리).
 */
export function assembleEpisodeSignals(
  episode: Episode,
  events: EpisodeEvent[],
  cycleContext?: CycleContext,
): EpisodeSignals {
  const S = episode.startDate
  const signals: EpisodeSignals = {
    earlyLeadUp: [],
    dayBeforeWarning: [],
    sameDayCompanion: [],
    backgroundConditions: [],
    afterShift: [],
    cyclePosition: cycleContext ? cyclePositionFrom(cycleContext) : undefined,
  }
  // 배경(누적/연속) 그룹의 창 내 발생 횟수 + 가장 가까운 lag 집계
  const backgroundCount = new Map<string, { label: string; count: number; minLag: number }>()

  for (const ev of events) {
    const lag = daysBetween(ev.date, S) // S − 발생일
    const win = factorWindowFor(ev.factorGroup)
    const item: EpisodeSignal = {
      factorGroup: ev.factorGroup,
      label: ev.label,
      lagDays: lag,
      relationToShift: ev.relationToShift,
    }

    // 결과쪽: after 관계 또는 result_side 모드는 선행신호에서 제외
    const isResultSide = ev.relationToShift === 'after' || win.mode === 'result_side'
    if (isResultSide) {
      if (lag >= 0) signals.afterShift.push(item) // 에피소드 기간 즈음의 이후 행동만
      continue
    }

    // 미래 사건(lag<0)은 어떤 선행신호에도 넣지 않는다(§12)
    if (lag < 0) continue

    // 누적/연속(배경) 그룹은 별도 집계
    if ((win.mode === 'cumulative' || win.mode === 'trend') && isLagWithinWindow(ev.factorGroup, lag)) {
      const cur = backgroundCount.get(ev.factorGroup) ?? { label: ev.label, count: 0, minLag: lag }
      cur.count++
      cur.minLag = Math.min(cur.minLag, lag)
      backgroundCount.set(ev.factorGroup, cur)
      continue
    }

    if (lag === 0) {
      signals.sameDayCompanion.push(item) // 당일 동반 — 창과 무관
      continue
    }
    // 선행: 허용 창 안일 때만
    if (!isLagWithinWindow(ev.factorGroup, lag)) continue
    if (lag === 1) signals.dayBeforeWarning.push(item)
    else signals.earlyLeadUp.push(item)
  }

  for (const [group, { label, count, minLag }] of backgroundCount) {
    signals.backgroundConditions.push({ factorGroup: group, label, lagDays: minLag, occurrences: count })
  }
  return signals
}
