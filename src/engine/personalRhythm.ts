/* =====================================================================
   MODE · 개인 반복 흐름 (순수 함수 · 9H)
   달력의 월이나 생리주기로 자르지 않고, 과거 FlowSegment의 "상태 순서"가
   여러 번 비슷하게 반복되는지 찾는다. flowSegments·recentFlow·flowDrivers를
   재사용한다. 모든 기록을 억지로 한 주기로 묶지 않으며, 반복 구조가 없으면
   결과를 반환하지 않는다. 다음 상태를 확정 예측하지 않는다.
   ===================================================================== */
import type { ISODate } from '../data/models'
import type { FlowDomain, FlowStatus } from './recentFlow'
import type { FlowSegment } from './flowSegments'
import type { FlowDriver } from './flowDrivers'

export type FlowState = FlowStatus

export interface PersonalRhythm {
  /** 반복된 상태 순서(mixed는 흐림 요소라 제외됨). */
  sequence: FlowState[]
  /** 이 순서가 반복된 회차 수. */
  occurrenceCount: number
  /** 회차 길이(달력일) 범위. */
  typicalLengthMin: number
  typicalLengthMax: number
  /** 최근 흐름이 이 반복 순서와 실제로 이어질 때만. 아니면 null. */
  currentMatch: { matchedStates: FlowState[]; currentState: FlowState; daysInCurrentFlow: number } | null
  /** 회차의 소모 구간에서 자주 먼저 내려간 영역. */
  commonLeadingDomains: FlowDomain[]
  /** 회차 앞에 반복해 쌓인 사건 문구(flowDrivers 재사용). */
  commonDrivers: string[]
  /** 생리 시작일에 맞춰 도는 구조면 true(일반 개인 주기와 구분). */
  cycleRelated: boolean
}

export interface PersonalRhythmInput {
  /** 생리 시작일들(cycleRelated 판정용). */
  periodStarts?: ISODate[]
  /** 소모 흐름 선행 요인(commonDrivers용). */
  drivers?: FlowDriver[]
}

const MIN_RECORD_DAYS = 90 // 이만큼 기록이 없으면 분석하지 않음
const MIN_SEGMENTS = 8 // 유효 FlowSegment 최소 수
const MIN_OCCURRENCES = 3 // 같은 상태 순서가 최소 이만큼 반복
const MIN_DISTINCT_STATES = 2 // 각 회차는 서로 다른 상태 2개↑
const BLOCK_GAP_MISSING = 3 // 연속 미기록 3일↑이면 블록 경계(회차가 넘지 않음)
const OUTLIER_LO = 0.5 // 회차 길이가 중앙값의 이 배 미만이면 제외
const OUTLIER_HI = 2 // 회차 길이가 중앙값의 이 배 초과면 제외
const CYCLE_ALIGN_TOL = 4 // 생리 시작일 ±이 일수 안이면 맞춤으로 봄
const CYCLE_ALIGN_FRACTION = 0.5 // 회차 절반 이상이 생리와 맞으면 cycleRelated

const ANCHOR_STATES: FlowState[] = ['stable', 'recovering', 'depleting'] // mixed는 앵커로 쓰지 않음

function utc(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((utc(b) - utc(a)) / 86400000)
}
function weekday(iso: ISODate): number {
  return new Date(utc(iso)).getUTCDay()
}
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
/** short가 long의 앞부분(같은 것 포함)인지. */
function isPrefix(short: FlowState[], long: FlowState[]): boolean {
  if (short.length === 0 || short.length > long.length) return false
  return short.every((s, i) => s === long[i])
}

interface Occ {
  a: number
  end: number
  canon: FlowState[]
  lenDays: number
  startDate: ISODate
}

function detectForAnchor(
  segments: FlowSegment[],
  boundaryAfter: boolean[],
  anchor: FlowState,
  input: PersonalRhythmInput,
): PersonalRhythm | null {
  const anchorIdxs: number[] = []
  for (let i = 0; i < segments.length; i++) if (segments[i].status === anchor) anchorIdxs.push(i)
  if (anchorIdxs.length < 2) return null

  const crosses = (a: number, end: number): boolean => {
    for (let i = a; i < end; i++) if (boundaryAfter[i]) return true
    return false
  }
  const canonOf = (a: number, end: number): FlowState[] =>
    segments.slice(a, end + 1).map((s) => s.status).filter((s) => s !== 'mixed')

  // 앵커 사이 구간 + 마지막(진행 중일 수 있는) 꼬리 구간.
  const occs: Occ[] = []
  for (let j = 0; j < anchorIdxs.length; j++) {
    const a = anchorIdxs[j]
    const end = j < anchorIdxs.length - 1 ? anchorIdxs[j + 1] - 1 : segments.length - 1
    if (end < a) continue
    if (crosses(a, end)) continue // 블록 경계를 넘는 회차는 쓰지 않음(공백으로 분리)
    occs.push({ a, end, canon: canonOf(a, end), lenDays: daysBetween(segments[a].startDate, segments[end].endDate) + 1, startDate: segments[a].startDate })
  }

  // 상태 순서(canonical)별로 묶는다.
  const groups = new Map<string, Occ[]>()
  for (const o of occs) {
    const key = o.canon.join('>')
    const arr = groups.get(key)
    if (arr) arr.push(o)
    else groups.set(key, [o])
  }

  let bestSeq: FlowState[] | null = null
  let bestOccs: Occ[] = []
  for (const [key, list] of groups) {
    if (!key) continue
    const seq = key.split('>') as FlowState[]
    if (seq.length < 2 || new Set(seq).size < MIN_DISTINCT_STATES) continue // 회차마다 서로 다른 상태 2개↑
    const med = median(list.map((o) => o.lenDays))
    const kept = list.filter((o) => o.lenDays >= med * OUTLIER_LO && o.lenDays <= med * OUTLIER_HI) // 지나치게 길/짧은 회차 제외
    if (kept.length < MIN_OCCURRENCES) continue
    if (new Set(kept.map((o) => weekday(o.startDate))).size <= 1) continue // 단순 주말/요일 반복 제외
    if (kept.length > bestOccs.length || (kept.length === bestOccs.length && seq.length > (bestSeq?.length ?? 0))) {
      bestSeq = seq
      bestOccs = kept
    }
  }
  if (!bestSeq) return null

  const lens = bestOccs.map((o) => o.lenDays)
  const typicalLengthMin = Math.min(...lens)
  const typicalLengthMax = Math.max(...lens)

  // 소모 구간에서 먼저 내려간 영역(과반).
  const domCount = new Map<FlowDomain, number>()
  for (const o of bestOccs) {
    for (let i = o.a; i <= o.end; i++) {
      if (segments[i].status === 'depleting') for (const d of segments[i].leading) domCount.set(d, (domCount.get(d) ?? 0) + 1)
    }
  }
  const commonLeadingDomains = [...domCount.entries()]
    .filter(([, n]) => n >= Math.ceil(bestOccs.length / 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => d)

  const commonDrivers = (input.drivers ?? []).slice(0, 2).map((d) => d.label)

  // 생리 시작일에 맞춰 도는지.
  const periodStarts = input.periodStarts ?? []
  let cycleRelated = false
  if (periodStarts.length > 0) {
    const aligned = bestOccs.filter((o) => periodStarts.some((p) => Math.abs(daysBetween(p, o.startDate)) <= CYCLE_ALIGN_TOL)).length
    cycleRelated = aligned >= Math.ceil(bestOccs.length * CYCLE_ALIGN_FRACTION)
  }

  // 현재 위치: 마지막 앵커부터 끝까지가 반복 순서의 앞부분과 이어질 때만.
  const currentMatch = computeCurrentMatch(segments, boundaryAfter, anchorIdxs[anchorIdxs.length - 1], bestSeq)

  return { sequence: bestSeq, occurrenceCount: bestOccs.length, typicalLengthMin, typicalLengthMax, currentMatch, commonLeadingDomains, commonDrivers, cycleRelated }
}

function computeCurrentMatch(
  segments: FlowSegment[],
  boundaryAfter: boolean[],
  tailStart: number,
  seq: FlowState[],
): PersonalRhythm['currentMatch'] {
  const end = segments.length - 1
  for (let i = tailStart; i < end; i++) if (boundaryAfter[i]) return null // 현재 흐름이 공백으로 끊겼으면 표시 안 함
  const canon = segments.slice(tailStart, end + 1).map((s) => s.status).filter((s) => s !== 'mixed') as FlowState[]
  if (!isPrefix(canon, seq)) return null // 반복 구조 앞부분과 이어지지 않으면 표시 안 함
  const currentState = canon[canon.length - 1]
  // 현재 상태 구간의 시작(꼬리 안에서 그 상태의 마지막 구간)부터 최근 기록일까지.
  let curSegStart = segments[tailStart].startDate
  for (let i = tailStart; i <= end; i++) if (segments[i].status === currentState) curSegStart = segments[i].startDate
  return { matchedStates: canon, currentState, daysInCurrentFlow: daysBetween(curSegStart, segments[end].endDate) + 1 }
}

/**
 * 개인 반복 흐름. segments=흐름 구간(시간순). 반복 구조가 없으면 null.
 * 최소 90일·유효 구간 8개 이상에서만 분석한다.
 */
export function buildPersonalRhythm(segments: FlowSegment[], input: PersonalRhythmInput = {}): PersonalRhythm | null {
  if (segments.length < MIN_SEGMENTS) return null
  const span = daysBetween(segments[0].startDate, segments[segments.length - 1].endDate) + 1
  if (span < MIN_RECORD_DAYS) return null

  const boundaryAfter = segments.map(
    (s, i) => i < segments.length - 1 && daysBetween(s.endDate, segments[i + 1].startDate) - 1 >= BLOCK_GAP_MISSING,
  )

  let best: PersonalRhythm | null = null
  let bestScore = -1
  for (const anchor of ANCHOR_STATES) {
    const cand = detectForAnchor(segments, boundaryAfter, anchor, input)
    if (!cand) continue
    const score = cand.occurrenceCount * 100 + cand.sequence.length
    if (score > bestScore) {
      best = cand
      bestScore = score
    }
  }
  return best
}
