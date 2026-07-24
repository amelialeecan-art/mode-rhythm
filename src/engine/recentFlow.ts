/* =====================================================================
   MODE · 최근 흐름 판정 (순수 함수 · 9D)
   최근 최대 14일의 영역별(감정·식욕·수면·몸·생활기능) 변화를 개인 기준선과
   기울기로 비교해 흐름을 판정한다. 단일 rhythmLoad/dayType나 하루 급변으로
   선언하지 않는다. 새 저장 필드/모델을 만들지 않는다 — 표시용 판정.
   개인 주기(월 넘어 반복) 탐지는 이 흐름이 여러 번 쌓인 뒤 다음 단계에서.
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate } from '../lib/date'
import { worseningSlope, type DaySeries } from './episodeTime'

export type FlowDomain = 'emotional' | 'appetite' | 'sleep' | 'body' | 'function'
export type FlowStatus = 'stable' | 'depleting' | 'recovering' | 'mixed'

export const FLOW_DOMAINS: FlowDomain[] = ['emotional', 'appetite', 'sleep', 'body', 'function']
const WINDOW = 14
const FLOW_DIFF = 8 // 기존 분석 최소 효과와 동일 기준(개인 기준선 대비)
const MIN_SCORED_DAYS = 4 // 이만큼 기록 없으면 흐름 판정 안 함
const MIN_JUDGEABLE = 3 // 방향을 판단할 수 있는 영역 수 최소
const PERSIST_MIN = 2 // 하루 급변 배제 — 변화가 최소 2일 이어져야 함

export interface RecentFlowDay {
  date: ISODate
  emotional?: number
  appetite?: number
  sleep?: number
  body?: number
  /** 생활기능 1~4 (4=가장 저하). 내부에서 0~100로 환산. */
  functionLevel?: number
  /** 질병·부상 등 평소 리듬과 분리할 예외일. */
  excluded?: boolean
}

export interface RecentFlow {
  status: FlowStatus
  /** 흐름 시작일. */
  startDate: ISODate
  /** 지속 일수(startDate~마지막 기록일). */
  lengthDays: number
  /** 먼저 변한 영역(최대 2). */
  leading: FlowDomain[]
  /** 평소 범위를 유지 중인 영역. */
  holding: FlowDomain[]
  /** 카드 표시 가능 여부(약하거나 불명확이면 false). */
  displayable: boolean
}

function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}
function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

/** 영역 값 추출(생활기능은 1~4 → 0~100 저하 척도). */
function domainValue(d: RecentFlowDay, dom: FlowDomain): number | undefined {
  if (dom === 'function') return d.functionLevel === undefined ? undefined : ((d.functionLevel - 1) / 3) * 100
  return d[dom]
}

type Dir = 'worse' | 'better' | 'flat'
interface DomainVerdict {
  domain: FlowDomain
  dir: Dir
  onset?: ISODate
  judgeable: boolean
}

function assess(dom: FlowDomain, days: RecentFlowDay[], endDate: ISODate, windowStart: ISODate): DomainVerdict {
  const series: DaySeries = new Map()
  for (const d of days) {
    const v = domainValue(d, dom)
    if (v !== undefined) series.set(d.date, v)
  }
  const windowPts = days
    .filter((d) => d.date >= windowStart && d.date <= endDate && domainValue(d, dom) !== undefined)
    .map((d) => ({ date: d.date, v: domainValue(d, dom) as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  if (windowPts.length < 2) return { domain: dom, dir: 'flat', judgeable: false }

  const preVals = days.filter((d) => d.date < windowStart && domainValue(d, dom) !== undefined).map((d) => domainValue(d, dom) as number)
  const baseline = preVals.length >= 3 ? mean(preVals) : mean(windowPts.slice(0, Math.max(1, Math.floor(windowPts.length / 2))).map((p) => p.v))
  const recentMean = mean(windowPts.map((p) => p.v))
  const delta = recentMean - baseline
  const slope = worseningSlope(series, endDate, WINDOW)

  let dir: Dir = 'flat'
  if (delta >= FLOW_DIFF && slope >= 0) dir = 'worse'
  else if (delta <= -FLOW_DIFF && slope <= 0) dir = 'better'
  if (dir === 'flat') return { domain: dom, dir, judgeable: true }

  // onset: 기준선을 방향대로 넘어서 끝까지 유지되기 시작한 첫 날
  const sign = dir === 'worse' ? 1 : -1
  let onset: ISODate | undefined
  for (let i = 0; i < windowPts.length; i++) {
    const rest = windowPts.slice(i)
    const crossed = rest.filter((p) => (p.v - baseline) * sign >= FLOW_DIFF).length
    if ((windowPts[i].v - baseline) * sign >= FLOW_DIFF && crossed >= Math.ceil(rest.length / 2)) {
      onset = windowPts[i].date
      break
    }
  }
  // 하루 급변(마지막 하루만) 배제
  if (!onset || daysBetween(onset, endDate) + 1 < PERSIST_MIN) return { domain: dom, dir: 'flat', judgeable: true }
  return { domain: dom, dir, onset, judgeable: true }
}

export function buildRecentFlow(days: RecentFlowDay[]): RecentFlow {
  const empty: RecentFlow = { status: 'stable', startDate: '', lengthDays: 0, leading: [], holding: [], displayable: false }
  const lastExcludedDate = days.filter((d) => d.excluded).map((d) => d.date).sort().at(-1)
  // 예외일은 단순히 한 점만 빼는 것이 아니라 흐름 경계다. 예외 전 기록과 이후 기록을 이어 붙이지 않는다.
  const usableDays = days.filter((d) => !d.excluded && (!lastExcludedDate || d.date > lastExcludedDate))
  const withAny = usableDays.filter((d) => FLOW_DOMAINS.some((dom) => domainValue(d, dom) !== undefined))
  if (withAny.length === 0) return empty
  const endDate = withAny.reduce((a, b) => (b.date > a ? b.date : a), withAny[0].date)
  const windowStart = addDays(endDate, -(WINDOW - 1))
  const firstUsableDate = withAny.reduce((a, b) => (b.date < a ? b.date : a), withAny[0].date)
  const analysisStart = firstUsableDate > windowStart ? firstUsableDate : windowStart

  const scoredDays = new Set(withAny.filter((d) => d.date >= windowStart).map((d) => d.date)).size

  const verdicts = FLOW_DOMAINS.map((dom) => assess(dom, usableDays, endDate, windowStart))
  const judgeable = verdicts.filter((v) => v.judgeable)
  const worse = verdicts.filter((v) => v.dir === 'worse')
  const better = verdicts.filter((v) => v.dir === 'better')
  const changing = [...worse, ...better]

  let status: FlowStatus
  if (worse.length >= 2 && better.length === 0) status = 'depleting'
  else if (better.length >= 2 && worse.length === 0) status = 'recovering'
  else if (worse.length >= 1 && better.length >= 1) status = 'mixed'
  else status = 'stable'

  const leading = [...changing]
    .sort((a, b) => {
      const oa = a.onset ?? endDate
      const ob = b.onset ?? endDate
      if (oa !== ob) return oa < ob ? -1 : 1
      return FLOW_DOMAINS.indexOf(a.domain) - FLOW_DOMAINS.indexOf(b.domain)
    })
    .slice(0, 2)
    .map((v) => v.domain)

  const holding = judgeable.filter((v) => v.dir === 'flat').map((v) => v.domain)

  const onsets = changing.map((v) => v.onset).filter((x): x is ISODate => !!x)
  const startDate = onsets.length ? onsets.reduce((a, b) => (b < a ? b : a)) : analysisStart
  const lengthDays = daysBetween(startDate, endDate) + 1

  const displayable = judgeable.length >= MIN_JUDGEABLE && scoredDays >= MIN_SCORED_DAYS

  return { status, startDate, lengthDays, leading, holding, displayable }
}
