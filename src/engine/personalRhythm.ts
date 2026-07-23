/* =====================================================================
   MODE · 개인 반복 흐름 (순수 함수 · 9H)
   달력의 월이나 생리주기로 자르지 않고, 과거 FlowSegment의 "상태 순서"가
   여러 번 비슷하게 반복되는지 찾는다. flowSegments·recentFlow·flowDrivers를
   재사용한다. 모든 기록을 억지로 한 주기로 묶지 않으며, 반복 구조가 없으면
   결과를 반환하지 않는다. 다음 상태를 확정 예측하지 않는다.

   후보 선택:
   - 겹치지 않는(같은 FlowSegment 재사용 금지) 연속 반복 motif를 찾는다.
   - 긴 순서가 3회↑ 온전히 반복되면 그 부분(짧은) 순서는 대표로 쓰지 않는다.
   - 2상태 반복은 3상태↑ 안정 반복이 없을 때만, 그것도 4회↑일 때만 보조 허용.
   - mixed는 회차 안에 넣지 않고 구분자로 둔다(서로 다른 흐름이 합쳐지지 않게).
   - 우선순위: 반복 횟수 → 순서 길이 → 회차 길이 일관성 → 기록 점유 비율.
   ===================================================================== */
import type { ISODate } from '../data/models'
import type { FlowDomain, FlowStatus } from './recentFlow'
import type { FlowSegment } from './flowSegments'
import type { FlowDriver } from './flowDrivers'

export type FlowState = FlowStatus

export interface PersonalRhythm {
  /** 반복된 상태 순서(mixed는 흐림 요소라 제외됨). */
  sequence: FlowState[]
  /** 이 순서가 온전히 반복된 회차 수(겹치지 않음). */
  occurrenceCount: number
  /** 회차 길이(달력일) 범위. */
  typicalLengthMin: number
  typicalLengthMax: number
  /** 최근 흐름이 이 반복 순서의 앞(prefix)/뒤(suffix)와 실제로 이어질 때만. 아니면 null. */
  currentMatch: { matchedStates: FlowState[]; currentState: FlowState; daysInCurrentFlow: number } | null
  /** 회차의 소모 구간에서 자주 먼저 내려간 영역. */
  commonLeadingDomains: FlowDomain[]
  /** 회차 앞에 반복해 쌓인 사건 문구(flowDrivers 재사용). */
  commonDrivers: string[]
  /** 생리 시작일에 맞춰 도는 구조면 true(일반 개인 주기와 구분). */
  cycleRelated: boolean
}

export interface PersonalRhythmInput {
  periodStarts?: ISODate[]
  drivers?: FlowDriver[]
}

const MIN_RECORD_DAYS = 90 // 이만큼 기록이 없으면 분석하지 않음
const MIN_SEGMENTS = 8 // 유효 FlowSegment 최소 수
const MIN_OCCURRENCES = 3 // 3상태↑ 순서는 최소 이만큼 온전히 반복
const MIN_OCCURRENCES_2STATE = 4 // 2상태 순서는 최소 이만큼(보조 허용 조건)
const MIN_DISTINCT_STATES = 2 // 각 회차는 서로 다른 상태 2개↑
const BLOCK_GAP_MISSING = 3 // 연속 미기록 3일↑이면 블록 경계(회차가 넘지 않음)
const OUTLIER_LO = 0.5 // 회차 길이가 중앙값의 이 배 미만이면 제외
const OUTLIER_HI = 2 // 회차 길이가 중앙값의 이 배 초과면 제외
const CYCLE_ALIGN_TOL = 4 // 생리 시작일 ±이 일수 안이면 맞춤으로 봄
const CYCLE_ALIGN_FRACTION = 0.5 // 회차 절반 이상이 생리와 맞으면 cycleRelated
const MAX_MOTIF_LEN = 5 // 상태 순서 최대 길이
const WEEKLY_MAX_LEN = 10 // 회차 중앙 길이가 이 이하 + 같은 요일이면 요일 반복으로 제외

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
/** motif가 더 짧은 블록의 반복이면(예: [S,D,S,D]) 원시(primitive)가 아니다. */
function isPrimitive(m: FlowState[]): boolean {
  const n = m.length
  for (let d = 1; d < n; d++) {
    if (n % d !== 0) continue
    let ok = true
    for (let i = 0; i < n; i++)
      if (m[i] !== m[i % d]) {
        ok = false
        break
      }
    if (ok) return false
  }
  return true
}
/** short가 long의 순환(cyclic) 부분 순서인지(예: [S,D]는 [S,D,R]의 일부). */
function isCyclicSubstring(short: FlowState[], long: FlowState[]): boolean {
  if (short.length >= long.length) return false
  const dbl = [...long, ...long]
  for (let i = 0; i < long.length; i++) {
    let ok = true
    for (let j = 0; j < short.length; j++)
      if (dbl[i + j] !== short[j]) {
        ok = false
        break
      }
    if (ok) return true
  }
  return false
}

/** 회차 후보 단위: mixed를 뺀 연속 세그먼트. sepBefore=앞에 mixed/블록공백이 있었는지. */
interface Unit {
  status: FlowState
  startDate: ISODate
  endDate: ISODate
  lengthDays: number
  leading: FlowDomain[]
  sepBefore: boolean
}

function buildUnits(segments: FlowSegment[]): Unit[] {
  const units: Unit[] = []
  let pendingSep = false
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (i > 0 && daysBetween(segments[i - 1].endDate, s.startDate) - 1 >= BLOCK_GAP_MISSING) pendingSep = true
    if (s.status === 'mixed') {
      pendingSep = true // mixed는 회차에 넣지 않고 구분자로
      continue
    }
    units.push({ status: s.status, startDate: s.startDate, endDate: s.endDate, lengthDays: s.lengthDays, leading: s.leading, sepBefore: pendingSep })
    pendingSep = false
  }
  return units
}

/** [p, p+k) 안에 구분자가 없는지(회차가 mixed/공백을 넘지 않게). */
function internalSepFree(units: Unit[], p: number, k: number): boolean {
  for (let j = p + 1; j < p + k; j++) if (units[j].sepBefore) return false
  return true
}
function matchesMotif(units: Unit[], q: number, motif: FlowState[]): boolean {
  for (let i = 0; i < motif.length; i++) if (units[q + i].status !== motif[i]) return false
  return true
}

interface Candidate {
  motif: FlowState[]
  occStarts: number[] // 이상치 제외 후 남은 회차 시작 unit 인덱스(겹치지 않음)
  lens: number[] // 각 회차 달력 길이
  reps: number
  spread: number // 회차 길이 편차(작을수록 일관)
  coverage: number // 전체 기록 대비 점유 비율
}

/** 겹치지 않는 연속 반복 motif 후보를 모은다(motif별 최장 체인). */
function collectCandidates(units: Unit[], totalSpan: number): Candidate[] {
  const byMotif = new Map<string, { motif: FlowState[]; occStarts: number[] }>()
  for (let k = 2; k <= Math.min(MAX_MOTIF_LEN, units.length); k++) {
    for (let p = 0; p + k <= units.length; p++) {
      if (!internalSepFree(units, p, k)) continue
      const motif = units.slice(p, p + k).map((u) => u.status)
      if (!isPrimitive(motif)) continue
      const occStarts = [p]
      let q = p + k
      while (q + k <= units.length && internalSepFree(units, q, k) && matchesMotif(units, q, motif)) {
        occStarts.push(q)
        q += k
      }
      const key = motif.join('>')
      const prev = byMotif.get(key)
      if (!prev || occStarts.length > prev.occStarts.length) byMotif.set(key, { motif, occStarts })
    }
  }

  const cands: Candidate[] = []
  for (const { motif, occStarts } of byMotif.values()) {
    if (new Set(motif).size < MIN_DISTINCT_STATES) continue
    const lensAll = occStarts.map((os) => daysBetween(units[os].startDate, units[os + motif.length - 1].endDate) + 1)
    const med = median(lensAll)
    const keep: number[] = []
    const keepLens: number[] = []
    occStarts.forEach((os, i) => {
      if (lensAll[i] >= med * OUTLIER_LO && lensAll[i] <= med * OUTLIER_HI) {
        keep.push(os)
        keepLens.push(lensAll[i])
      }
    })
    const need = motif.length === 2 ? MIN_OCCURRENCES_2STATE : MIN_OCCURRENCES
    if (keep.length < need) continue
    // 단순 주말/요일 반복 제외: 짧은(주 단위) 주기가 늘 같은 요일에 시작하면 뺀다.
    if (median(keepLens) <= WEEKLY_MAX_LEN && new Set(keep.map((os) => weekday(units[os].startDate))).size <= 1) continue
    cands.push({
      motif,
      occStarts: keep,
      lens: keepLens,
      reps: keep.length,
      spread: Math.max(...keepLens) - Math.min(...keepLens),
      coverage: keepLens.reduce((a, b) => a + b, 0) / totalSpan,
    })
  }
  return cands
}

function computeCurrentMatch(units: Unit[], seq: FlowState[]): PersonalRhythm['currentMatch'] {
  // 최신 연속(구분자 없는) 세그먼트 run.
  let s = units.length - 1
  while (s > 0 && !units[s].sepBefore) s--
  const tail = units.slice(s).map((u) => u.status)
  const L = seq.length
  for (let m = Math.min(tail.length, L); m >= 1; m--) {
    const t = tail.slice(tail.length - m)
    const isPre = t.every((x, i) => x === seq[i])
    const isSuf = t.every((x, i) => x === seq[L - m + i])
    if (isPre || isSuf) {
      const startIdx = units.length - m
      return { matchedStates: t, currentState: t[m - 1], daysInCurrentFlow: daysBetween(units[startIdx].startDate, units[units.length - 1].endDate) + 1 }
    }
  }
  return null
}

/**
 * 개인 반복 흐름. segments=흐름 구간(시간순). 반복 구조가 없으면 null.
 * 최소 90일·유효 구간 8개 이상에서만 분석한다.
 */
export function buildPersonalRhythm(segments: FlowSegment[], input: PersonalRhythmInput = {}): PersonalRhythm | null {
  if (segments.length < MIN_SEGMENTS) return null
  const totalSpan = daysBetween(segments[0].startDate, segments[segments.length - 1].endDate) + 1
  if (totalSpan < MIN_RECORD_DAYS) return null

  const units = buildUnits(segments)
  if (units.length < 2) return null

  const cands = collectCandidates(units, totalSpan)
  if (cands.length === 0) return null

  // 긴 순서가 3회↑ 온전히 반복되면 그 부분(짧은) 순서는 대표로 쓰지 않는다.
  let pool = cands.filter(
    (c) => !cands.some((l) => l.motif.length > c.motif.length && l.reps >= MIN_OCCURRENCES && isCyclicSubstring(c.motif, l.motif)),
  )
  // 2상태 반복은 3상태↑ 안정 반복이 있으면 대표로 쓰지 않는다(보조로만).
  if (pool.some((c) => c.motif.length >= 3)) pool = pool.filter((c) => c.motif.length >= 3)
  if (pool.length === 0) return null

  // 우선순위: 반복 횟수 → 순서 길이 → 회차 길이 일관성(편차 작게) → 기록 점유 비율.
  // 완전 동률(같은 주기의 회전)이면 더 안정된 상태로 시작하는 순서를 골라 표현을 자연스럽게.
  const startRank: Record<FlowState, number> = { stable: 0, recovering: 1, depleting: 2, mixed: 3 }
  pool.sort(
    (a, b) =>
      b.reps - a.reps ||
      b.motif.length - a.motif.length ||
      a.spread - b.spread ||
      b.coverage - a.coverage ||
      startRank[a.motif[0]] - startRank[b.motif[0]],
  )
  const best = pool[0]

  const typicalLengthMin = Math.min(...best.lens)
  const typicalLengthMax = Math.max(...best.lens)

  const domCount = new Map<FlowDomain, number>()
  for (const os of best.occStarts) {
    for (let i = os; i < os + best.motif.length; i++) {
      if (units[i].status === 'depleting') for (const d of units[i].leading) domCount.set(d, (domCount.get(d) ?? 0) + 1)
    }
  }
  const commonLeadingDomains = [...domCount.entries()]
    .filter(([, n]) => n >= Math.ceil(best.reps / 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([d]) => d)

  const commonDrivers = (input.drivers ?? []).slice(0, 2).map((d) => d.label)

  const periodStarts = input.periodStarts ?? []
  let cycleRelated = false
  if (periodStarts.length > 0) {
    const aligned = best.occStarts.filter((os) => periodStarts.some((p) => Math.abs(daysBetween(p, units[os].startDate)) <= CYCLE_ALIGN_TOL)).length
    cycleRelated = aligned >= Math.ceil(best.reps * CYCLE_ALIGN_FRACTION)
  }

  return {
    sequence: best.motif,
    occurrenceCount: best.reps,
    typicalLengthMin,
    typicalLengthMax,
    currentMatch: computeCurrentMatch(units, best.motif),
    commonLeadingDomains,
    commonDrivers,
    cycleRelated,
  }
}
