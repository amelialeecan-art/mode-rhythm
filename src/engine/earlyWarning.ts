/* =====================================================================
   MODE · 조기경보 백테스트 엔진 (순수 함수 · 6단계)
   "과거 힘들었던 날을 그때 미리 알아차릴 수 있었는지"를 엄격히 되짚는다.
   확률을 만들지 않는다 — 과거 실제 횟수(맞춤/놓침/오경보/정상)만 센다.

   경고 시점 두 개 (컷오프):
   - 전날 밤(prev_night): D-1 밤까지 알 수 있던 정보만(발생 lag ≥ 1).
   - 당일 아침(morning): 위에 더해 D의 '지난밤 수면'만(아침에 이미 앎).
   금지 입력(누수): D 오후·저녁 사건(lag 0 비수면), functionLevel,
   무너진 뒤 행동, relationToShift='after'/result_side, 미래(lag<0) 사건.

   경고 기준: 새 블랙박스 점수/ML 없음. Phase 4의 plausible window 안에서,
   컷오프까지 알 수 있던 서로 다른 선행 신호가 WARNING_MIN_SIGNALS개 이상이면
   "그때 알아차릴 수 있었던 신호가 있었다"로 본다. 임계값은 고정 상수이며
   사례별로 튜닝하거나 여러 기준 중 사후 선택하지 않는다.
   engine은 React/Dexie를 모른다.
   ===================================================================== */
import type { EventRelationToShift, ISODate } from '../data/models'
import { parseISODate } from '../lib/date'
import { factorWindowFor, isLagWithinWindow } from '../data/catalog/events'
import type { EpisodeConfidence } from './episode'

/** 컷오프까지 알 수 있던 plausible 선행 신호가 이 개수 이상이면 경고(고정, 사후 튜닝 없음). */
export const WARNING_MIN_SIGNALS = 1
/** 핵심 백테스트 최소 표본(reported/mixed 에피소드 시작 수). 미만이면 결과를 확정 표시하지 않는다. */
export const MIN_REPORTED_EPISODES = 4

export type WarningCutoff = 'prev_night' | 'morning'

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}

/** 백테스트 입력 사건(발생 추정일 + 그룹 + 관계 + 지난밤수면 여부). */
export interface WarningEvent {
  date: ISODate
  factorGroup: string
  relationToShift?: EventRelationToShift
  /** 지난밤 수면에서 온 신호(=깨어난 날 아침에 이미 알 수 있음). */
  nightlySleep?: boolean
}

/**
 * outcome일(start) 기준으로, 컷오프까지 알 수 있던 plausible 선행 factorGroup(중복 제거).
 * 이 함수만 통과하면 D 이후·오후·저녁·결과쪽 정보는 절대 반영되지 않는다.
 */
export function warningSignalsAt(start: ISODate, events: WarningEvent[], cutoff: WarningCutoff): string[] {
  const groups = new Set<string>()
  for (const e of events) {
    if (e.relationToShift === 'after') continue // 나빠진 뒤(결과쪽) 제외
    if (factorWindowFor(e.factorGroup).mode === 'result_side') continue // 쇼츠/누움 등 결과쪽 제외
    const lag = daysBetween(e.date, start) // start − 발생일
    if (lag < 0) continue // 미래 사건 제외
    // 컷오프: 전날 밤 = lag≥1만. 당일 아침 = 그에 더해 D(lag 0)의 지난밤 수면만.
    const known = cutoff === 'prev_night' ? lag >= 1 : lag >= 1 || (lag === 0 && e.nightlySleep === true)
    if (!known) continue
    if (!isLagWithinWindow(e.factorGroup, lag)) continue
    groups.add(e.factorGroup)
  }
  return [...groups].sort()
}

/** 경고 발화 여부(고정 임계). */
export function warningFires(start: ISODate, events: WarningEvent[], cutoff: WarningCutoff): boolean {
  return warningSignalsAt(start, events, cutoff).length >= WARNING_MIN_SIGNALS
}

/** 4칸 혼동행렬(확률 아님 — 과거 실제 횟수). */
export interface ConfusionMatrix {
  hit: number // 힘들었던 날인데 신호가 있었음
  miss: number // 힘들었던 날인데 신호가 없었음(놓침)
  falseAlarm: number // 괜찮았는데 신호가 있었음(오경보)
  correctRejection: number // 괜찮았고 신호도 없었음
  positives: number // 평가한 힘들었던 날(에피소드 시작) 수
  negatives: number // 평가한 비에피소드 날 수
}

export interface BacktestInput {
  /** 평가 대상 비교일(유효 결과일). 에피소드 구간에 든 날은 음성에서 제외한다. */
  outcomeDays: ISODate[]
  /** 에피소드 시작일 + 신뢰도. estimated-only는 핵심 양성에서 제외한다. */
  episodeStarts: { date: ISODate; confidence: EpisodeConfidence }[]
  /** 에피소드 구간에 속한 모든 날짜(음성에서 제외). */
  episodeSpanDates: ISODate[]
  events: WarningEvent[]
}

export interface EarlyWarningReport {
  /** 표본 충분 여부(reportedEpisodeCount ≥ MIN_REPORTED_EPISODES). */
  eligible: boolean
  minRequired: number
  /** 핵심 양성(reported/mixed 에피소드 시작) 수. */
  reportedEpisodeCount: number
  /** estimated-only라서 핵심 표본에서 제외된 에피소드 수. */
  estimatedExcludedCount: number
  /** 부족할 때 더 필요한 표본 수. */
  neededMore: number
  prevNight: ConfusionMatrix
  morning: ConfusionMatrix
  /** 경고 계산에 실제로 쓰인 신호 그룹(접힘 근거 표시용). */
  signalGroupsUsed: string[]
}

function emptyMatrix(positives: number, negatives: number): ConfusionMatrix {
  return { hit: 0, miss: 0, falseAlarm: 0, correctRejection: 0, positives, negatives }
}

/**
 * 조기경보 백테스트. 에피소드 '시작'만 양성으로 세고(연속 무너짐의 각 날을 따로
 * 세지 않음), 같은 기간 비에피소드 날을 음성으로 넣어 오경보를 계산한다.
 * 두 컷오프(전날 밤·당일 아침)를 각각 평가한다.
 */
export function backtestEarlyWarning(input: BacktestInput): EarlyWarningReport {
  const spanSet = new Set(input.episodeSpanDates)
  const positives = input.episodeStarts.filter((e) => e.confidence !== 'estimated')
  const estimatedExcludedCount = input.episodeStarts.length - positives.length
  // 음성: 에피소드 구간에 들지 않은 유효 결과일
  const negatives = input.outcomeDays.filter((d) => !spanSet.has(d))

  const prevNight = emptyMatrix(positives.length, negatives.length)
  const morning = emptyMatrix(positives.length, negatives.length)
  const used = new Set<string>()

  const cutoffs: WarningCutoff[] = ['prev_night', 'morning']
  for (const cutoff of cutoffs) {
    const cm = cutoff === 'prev_night' ? prevNight : morning
    for (const p of positives) {
      const sigs = warningSignalsAt(p.date, input.events, cutoff)
      sigs.forEach((g) => used.add(g))
      if (sigs.length >= WARNING_MIN_SIGNALS) cm.hit++
      else cm.miss++
    }
    for (const d of negatives) {
      const sigs = warningSignalsAt(d, input.events, cutoff)
      if (sigs.length >= WARNING_MIN_SIGNALS) cm.falseAlarm++
      else cm.correctRejection++
    }
  }

  const reportedEpisodeCount = positives.length
  return {
    eligible: reportedEpisodeCount >= MIN_REPORTED_EPISODES,
    minRequired: MIN_REPORTED_EPISODES,
    reportedEpisodeCount,
    estimatedExcludedCount,
    neededMore: Math.max(0, MIN_REPORTED_EPISODES - reportedEpisodeCount),
    prevNight,
    morning,
    signalGroupsUsed: [...used].sort(),
  }
}
