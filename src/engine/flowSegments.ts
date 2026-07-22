/* =====================================================================
   MODE · 흐름 구간 분할 (순수 함수 · 9E)
   전체 기록을 영역별(감정·식욕·수면·몸·생활기능) 방향이 일관된 "흐름 구간"
   으로 나눈다. recentFlow.ts의 영역별 판정 원칙(개인 기준선 대비 차이 + 기울기)
   을 그대로 재사용한다. 개인 주기·생리주기 해석은 하지 않으며, 고정된 상승기/
   저하기 단계도 만들지 않는다 — 관측된 방향이 이어지는 구간만 표시한다.
   새 저장 필드/모델/DB 변경 없음.
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate } from '../lib/date'
import { worseningSlope, type DaySeries } from './episodeTime'
import { FLOW_DOMAINS, type FlowDomain, type FlowStatus, type RecentFlowDay } from './recentFlow'

const FLOW_DIFF = 8 // 영역 변화로 볼 최소 폭(개인 기준선 대비) — recentFlow와 동일
const MIN_VALID_TOTAL = 4 // 전체 유효 기록이 이만큼도 없으면 구간을 만들지 않음
const MIN_SEG_VALID = 2 // 구간 하나의 최소 유효 기록일 수
const GAP_SPLIT_DAYS = 7 // 연속 기록 사이 공백이 이보다 크면 구간을 분리
const LABEL_RECENT = 3 // 일별 방향 라벨: 최근 창(유효일)
const LABEL_BASE = 4 // 일별 방향 라벨: 직전 기준 창(유효일)
const SMOOTH = 1 // 3점 중앙값 평활 반경(하루 이상치 완충)

export interface FlowSegment {
  /** 구간 시작일. */
  startDate: ISODate
  /** 구간 종료일. */
  endDate: ISODate
  /** 지속 일수(startDate~endDate, 양끝 포함). */
  lengthDays: number
  status: FlowStatus
  /** 먼저 변한 영역(최대 2, onset 이른 순). */
  leading: FlowDomain[]
  /** 주요 변화 영역(악화·호전 모두). */
  changing: FlowDomain[]
  /** 평소 범위를 유지한 영역. */
  holding: FlowDomain[]
  /** 구간에 포함된 유효 기록일 수. */
  validDays: number
}

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}
function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** 영역 값(생활기능 1~4 → 0~100 저하 척도). */
function domainValue(d: RecentFlowDay, dom: FlowDomain): number | undefined {
  if (dom === 'function') return d.functionLevel === undefined ? undefined : ((d.functionLevel - 1) / 3) * 100
  return d[dom]
}

interface ValidDay {
  date: ISODate
  /** 영역별 원본 값(결측은 undefined). */
  raw: Partial<Record<FlowDomain, number>>
  /** 영역별 3점 중앙값 평활 값(하루 이상치 완충). */
  smooth: Partial<Record<FlowDomain, number>>
}

/** 유효 기록일만 뽑아 날짜순 정렬 + 영역별 평활. */
function toValidDays(days: RecentFlowDay[]): ValidDay[] {
  const raws = days
    .map((d) => {
      const raw: Partial<Record<FlowDomain, number>> = {}
      let any = false
      for (const dom of FLOW_DOMAINS) {
        const v = domainValue(d, dom)
        if (v !== undefined) {
          raw[dom] = v
          any = true
        }
      }
      return any ? { date: d.date, raw } : null
    })
    .filter((x): x is { date: ISODate; raw: Partial<Record<FlowDomain, number>> } => x !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  return raws.map((d, i) => {
    const smooth: Partial<Record<FlowDomain, number>> = {}
    for (const dom of FLOW_DOMAINS) {
      if (d.raw[dom] === undefined) continue
      const window: number[] = []
      for (let k = -SMOOTH; k <= SMOOTH; k++) {
        const nb = raws[i + k]
        if (nb && nb.raw[dom] !== undefined) window.push(nb.raw[dom] as number)
      }
      smooth[dom] = window.length ? median(window) : (d.raw[dom] as number)
    }
    return { date: d.date, raw: d.raw, smooth }
  })
}

/** 큰 기록 공백을 기준으로 블록을 나눈다(공백이 길면 이전 구간과 분리). */
function splitBlocks(vd: ValidDay[]): ValidDay[][] {
  const blocks: ValidDay[][] = []
  let cur: ValidDay[] = []
  for (const d of vd) {
    if (cur.length && daysBetween(cur[cur.length - 1].date, d.date) > GAP_SPLIT_DAYS) {
      blocks.push(cur)
      cur = []
    }
    cur.push(d)
  }
  if (cur.length) blocks.push(cur)
  return blocks
}

function statusFromCounts(worse: number, better: number): FlowStatus {
  if (worse >= 2 && better === 0) return 'depleting'
  if (better >= 2 && worse === 0) return 'recovering'
  if (worse >= 1 && better >= 1) return 'mixed'
  return 'stable'
}

/** 일별 방향 라벨(경계 탐지용). 판단 가능한 영역이 2개 미만이면 null. */
function dayStatus(block: ValidDay[], i: number): FlowStatus | null {
  let worse = 0
  let better = 0
  let judged = 0
  for (const dom of FLOW_DOMAINS) {
    const recent: number[] = []
    for (let k = i - LABEL_RECENT + 1; k <= i; k++) {
      const v = block[k]?.smooth[dom]
      if (v !== undefined) recent.push(v)
    }
    const base: number[] = []
    for (let k = i - LABEL_RECENT - LABEL_BASE + 1; k <= i - LABEL_RECENT; k++) {
      const v = block[k]?.smooth[dom]
      if (v !== undefined) base.push(v)
    }
    if (recent.length < 2 || base.length < 2) continue
    judged++
    const delta = mean(recent) - mean(base)
    if (delta >= FLOW_DIFF) worse++
    else if (delta <= -FLOW_DIFF) better++
  }
  if (judged < 2) return null
  return statusFromCounts(worse, better)
}

interface Run {
  from: number
  to: number
}

/** 라벨 배열을 같은 상태 구간(run)으로 묶는다. 앞쪽 null은 첫 판정 상태로 채운다. */
function toRuns(labels: (FlowStatus | null)[]): Run[] {
  const firstKnown = labels.find((l) => l !== null) ?? 'stable'
  const filled = labels.map((l) => l ?? firstKnown)
  const runs: Run[] = []
  let prev: FlowStatus | null = null
  for (let i = 0; i < filled.length; i++) {
    if (runs.length && filled[i] === prev) {
      runs[runs.length - 1].to = i
    } else {
      runs.push({ from: i, to: i })
      prev = filled[i]
    }
  }
  return runs
}

interface DomainVerdict {
  domain: FlowDomain
  dir: 'worse' | 'better' | 'flat'
  onset?: ISODate
  judgeable: boolean
}

/** 구간 전체의 영역별 판정(recentFlow.assess와 같은 원칙: 초반 기준선 vs 후반 + 기울기). */
function assessSegment(days: ValidDay[], dom: FlowDomain): DomainVerdict {
  const pts = days
    .filter((d) => d.raw[dom] !== undefined)
    .map((d) => ({ date: d.date, v: d.raw[dom] as number }))
  if (pts.length < 2) return { domain: dom, dir: 'flat', judgeable: false }

  const third = Math.max(1, Math.floor(pts.length / 3))
  const baseline = mean(pts.slice(0, third).map((p) => p.v))
  const recentMean = mean(pts.slice(-third).map((p) => p.v))
  const delta = recentMean - baseline

  const series: DaySeries = new Map(pts.map((p) => [p.date, p.v]))
  const endDate = pts[pts.length - 1].date
  const span = daysBetween(pts[0].date, endDate) + 1
  const slope = worseningSlope(series, endDate, span)

  let dir: 'worse' | 'better' | 'flat' = 'flat'
  if (delta >= FLOW_DIFF && slope >= 0) dir = 'worse'
  else if (delta <= -FLOW_DIFF && slope <= 0) dir = 'better'
  if (dir === 'flat') return { domain: dom, dir, judgeable: true }

  const sign = dir === 'worse' ? 1 : -1
  let onset: ISODate | undefined
  for (let i = 0; i < pts.length; i++) {
    const rest = pts.slice(i)
    const crossed = rest.filter((p) => (p.v - baseline) * sign >= FLOW_DIFF).length
    if ((pts[i].v - baseline) * sign >= FLOW_DIFF && crossed >= Math.ceil(rest.length / 2)) {
      onset = pts[i].date
      break
    }
  }
  return { domain: dom, dir, onset, judgeable: true }
}

function summarize(days: ValidDay[]): Omit<FlowSegment, 'startDate' | 'endDate' | 'lengthDays' | 'validDays'> {
  const verdicts = FLOW_DOMAINS.map((dom) => assessSegment(days, dom))
  const worse = verdicts.filter((v) => v.dir === 'worse')
  const better = verdicts.filter((v) => v.dir === 'better')
  const changingV = [...worse, ...better].sort((a, b) => {
    const oa = a.onset ?? days[days.length - 1].date
    const ob = b.onset ?? days[days.length - 1].date
    if (oa !== ob) return oa < ob ? -1 : 1
    return FLOW_DOMAINS.indexOf(a.domain) - FLOW_DOMAINS.indexOf(b.domain)
  })
  const status = statusFromCounts(worse.length, better.length)
  const changing = changingV.map((v) => v.domain)
  const leading = changingV.slice(0, 2).map((v) => v.domain)
  const holding = verdicts.filter((v) => v.judgeable && v.dir === 'flat').map((v) => v.domain)
  return { status, leading, changing, holding }
}

function makeSegment(days: ValidDay[]): FlowSegment {
  const startDate = days[0].date
  const endDate = days[days.length - 1].date
  return {
    startDate,
    endDate,
    lengthDays: daysBetween(startDate, endDate) + 1,
    validDays: days.length,
    ...summarize(days),
  }
}

const len = (r: Run) => r.to - r.from + 1

/** 한 블록(공백으로 분리된 연속 기록)을 흐름 구간들로 나눈다. */
function segmentBlock(block: ValidDay[]): FlowSegment[] {
  if (block.length < MIN_SEG_VALID) return []

  const labels = block.map((_, i) => dayStatus(block, i))
  let ranges = toRuns(labels)

  // 경계 후보(ranges)를 구간 전체 기준 상태로 다시 보며 정리한다:
  //  (1) 인접 구간의 재계산 상태가 같으면 병합 — 달이 바뀌어도 끊지 않는다.
  //  (2) 유효일이 너무 적은 조각은 이웃에 흡수 — 하루 급변으로 새 구간을 만들지 않는다.
  // 각 연산은 구간 수를 1씩 줄이므로 반복은 반드시 끝난다.
  for (;;) {
    const status = ranges.map((r) => makeSegment(block.slice(r.from, r.to + 1)).status)

    let merged = false
    for (let i = 0; i + 1 < ranges.length; i++) {
      if (status[i] === status[i + 1]) {
        ranges[i] = { from: ranges[i].from, to: ranges[i + 1].to }
        ranges.splice(i + 1, 1)
        merged = true
        break
      }
    }
    if (merged) continue

    let absorbed = false
    for (let i = 0; i < ranges.length; i++) {
      if (len(ranges[i]) >= MIN_SEG_VALID || ranges.length === 1) continue
      const prevLen = i > 0 ? len(ranges[i - 1]) : -1
      const nextLen = i + 1 < ranges.length ? len(ranges[i + 1]) : -1
      if (prevLen >= nextLen && i > 0) {
        ranges[i - 1] = { from: ranges[i - 1].from, to: ranges[i].to }
      } else if (i + 1 < ranges.length) {
        ranges[i + 1] = { from: ranges[i].from, to: ranges[i + 1].to }
      } else {
        ranges[i - 1] = { from: ranges[i - 1].from, to: ranges[i].to }
      }
      ranges.splice(i, 1)
      absorbed = true
      break
    }
    if (!absorbed) break
  }

  ranges = ranges.filter((r) => len(r) >= MIN_SEG_VALID)
  return ranges
    .map((r) => makeSegment(block.slice(r.from, r.to + 1)))
    .filter((s) => s.lengthDays >= 2)
}

/**
 * 전체 기록을 흐름 구간으로 나눈다. 유효 기록이 너무 적으면 빈 배열.
 * 구간은 날짜순이며, 큰 공백에서만 분리된다(달 경계로는 끊지 않음).
 */
export function buildFlowSegments(days: RecentFlowDay[]): FlowSegment[] {
  const vd = toValidDays(days)
  if (vd.length < MIN_VALID_TOTAL) return []
  return splitBlocks(vd).flatMap((block) => segmentBlock(block))
}
