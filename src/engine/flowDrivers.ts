/* =====================================================================
   MODE · 흐름을 바꾼 누적 요인 (순수 함수 · 9G)
   flowSegments(흐름 구간)와 exposureRuns(사건 노출 구간)를 연결해,
   "소모(depleting) 흐름이 시작되기 전에 반복적으로 쌓인 사건"을 찾는다.
   - 각 소모 구간의 실제 시작일 기준 이전 1~3일 + 시작 당일의 노출만 본다
     (흐름 시작 이후 사건은 선행 요인으로 쓰지 않는다).
   - 안정·회복 구간의 대응 시점과 비교해, 소모 앞에서만 반복되는 사건만 남긴다.
   - 같은 사건의 연속 run은 exposureRuns에서 이미 한 노출로 묶여 있다.
   - 단순 요일 반복/단발성/생리주기 요인은 제외한다.
   개인 주기 탐지는 하지 않는다. 새 저장 필드도 없다.
   ===================================================================== */
import type { ISODate } from '../data/models'
import type { FlowDomain } from './recentFlow'
import type { FlowSegment } from './flowSegments'
import type { ExposureRun } from './exposureRuns'

export interface FlowDriver {
  eventKey: string
  factorGroup: string
  label: string
  /** 소모 구간에서 실제로 먼저 악화된(leading) 영역과 겹치는 영역만. */
  affectedDomains: FlowDomain[]
  /** 이 사건이 선행한 소모 시작 사례 수. */
  onsetCount: number
  /** 안정·회복 구간의 대응 시점에서 이 사건이 선행한 수(비교군). */
  comparisonCount: number
  /** 소모 시작까지의 대표 선행 일수(0=당일). */
  typicalLeadDays: number
  /** 다일(2일↑) 연속 노출이 주로 관여했는지. */
  cumulative: boolean
  /** 같은 소모 시작들에서 반복해 함께 겹친 다른 사건 key(3회↑). */
  overlapEventKeys: string[]
}

const PRE_WINDOW = 3 // 시작 이전 최대 3일 + 시작 당일
const MIN_ONSETS = 3 // 같은 사건이 소모 시작 앞에서 최소 이만큼 반복
const MIN_OVERLAP_REPEAT = 3 // 두 사건 겹침 조합 최소 반복 수
const MIN_RATE_EXCESS = 0.34 // 소모 앞 비율이 비교군보다 이만큼은 높아야 함
export const MAX_FLOW_DRIVERS = 2

/** ISO(YYYY-MM-DD)를 TZ 무관하게 UTC epoch(ms)로. */
function utc(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((utc(b) - utc(a)) / 86400000)
}
function addDays(iso: ISODate, n: number): ISODate {
  return new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10)
}
/** 요일(0=일). TZ 무관. */
function weekday(iso: ISODate): number {
  return new Date(utc(iso)).getUTCDay()
}
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)] // 하위 중앙값(결정론적)
}

/** 시작일 기준 [start-3, start] 창에 걸치는 run(선행 노출). 없으면 null. */
function qualifyingRun(keyRuns: ExposureRun[], start: ISODate): { run: ExposureRun; windowDates: ISODate[] } | null {
  const lo = addDays(start, -PRE_WINDOW)
  let best: { run: ExposureRun; windowDates: ISODate[] } | null = null
  for (const run of keyRuns) {
    const windowDates = run.dates.filter((d) => d >= lo && d <= start) // ISO 문자열 비교 = 시간순
    if (windowDates.length === 0) continue
    // 시작에 더 가깝게(늦게) 걸친 run을 우선 — 시작 직전 노출이 선행 요인에 더 가깝다.
    if (!best || windowDates[windowDates.length - 1] > best.windowDates[best.windowDates.length - 1]) {
      best = { run, windowDates }
    }
  }
  return best
}

/**
 * 소모 흐름의 반복 선행 요인. segments=흐름 구간(leading 포함), runs=사건 노출 구간.
 * labelByKey=event key→표시 문구. 최대 2개, 가장 반복적인 것만.
 */
export function buildFlowDrivers(
  segments: FlowSegment[],
  runs: ExposureRun[],
  labelByKey: Map<string, string> = new Map(),
): FlowDriver[] {
  const depleting = segments.filter((s) => s.status === 'depleting')
  const references = segments.filter((s) => s.status === 'stable' || s.status === 'recovering')
  if (depleting.length < MIN_ONSETS) return []

  const runsByKey = new Map<string, ExposureRun[]>()
  for (const r of runs) {
    const arr = runsByKey.get(r.key)
    if (arr) arr.push(r)
    else runsByKey.set(r.key, [r])
  }

  // key별로, 이 사건이 선행한 소모 구간들(겹침 계산에도 재사용).
  const onsetSegsByKey = new Map<string, FlowSegment[]>()
  for (const [key, keyRuns] of runsByKey) {
    onsetSegsByKey.set(
      key,
      depleting.filter((s) => qualifyingRun(keyRuns, s.startDate) !== null),
    )
  }

  const drivers: FlowDriver[] = []
  for (const [key, keyRuns] of runsByKey) {
    const factorGroup = keyRuns[0].factorGroup
    // 생리주기 요인은 생활요인과 분리 — 여기서는 다루지 않는다.
    if (factorGroup.startsWith('cycle_')) continue

    const onsetSegs = onsetSegsByKey.get(key) ?? []
    const onsetCount = onsetSegs.length
    if (onsetCount < MIN_ONSETS) continue // 단발성·근거 부족 제외

    // 단순 요일 반복 제외: 소모 시작이 전부 같은 요일이면 요일 패턴으로 의심.
    if (new Set(onsetSegs.map((s) => weekday(s.startDate))).size <= 1) continue

    // 안정·회복 대응 시점 비교: 소모 앞에서 확실히 더 흔해야 함.
    const comparisonCount = references.filter((s) => qualifyingRun(keyRuns, s.startDate) !== null).length
    const onsetRate = onsetCount / depleting.length
    const refRate = references.length ? comparisonCount / references.length : 0
    if (onsetRate - refRate < MIN_RATE_EXCESS) continue

    // 선행 일수 + 누적 여부
    const leads: number[] = []
    let multiOnsets = 0
    for (const s of onsetSegs) {
      const q = qualifyingRun(keyRuns, s.startDate)!
      leads.push(daysBetween(q.windowDates[0], s.startDate))
      if (q.run.days >= 2) multiOnsets++
    }
    const typicalLeadDays = median(leads)
    const cumulative = multiOnsets >= Math.ceil(onsetCount / 2)

    // affectedDomains: 이 사건이 선행한 소모 구간들의 leading 영역 중 과반.
    const domainCount = new Map<FlowDomain, number>()
    for (const s of onsetSegs) for (const d of s.leading) domainCount.set(d, (domainCount.get(d) ?? 0) + 1)
    const affectedDomains = [...domainCount.entries()]
      .filter(([, n]) => n >= Math.ceil(onsetCount / 2))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([d]) => d)

    // 반복 겹침: 같은 소모 시작들에서 3회↑ 함께 걸친 다른 사건.
    const onsetDates = new Set(onsetSegs.map((s) => s.startDate))
    const overlapEventKeys: string[] = []
    for (const [k2, segs2] of onsetSegsByKey) {
      if (k2 === key) continue
      if (segs2.filter((s) => onsetDates.has(s.startDate)).length >= MIN_OVERLAP_REPEAT) overlapEventKeys.push(k2)
    }

    drivers.push({
      eventKey: key,
      factorGroup,
      label: labelByKey.get(key) ?? key,
      affectedDomains,
      onsetCount,
      comparisonCount,
      typicalLeadDays,
      cumulative,
      overlapEventKeys,
    })
  }

  // 가장 반복적인 것 우선(소모-비교 초과분 → 소모 횟수 → key).
  drivers.sort(
    (a, b) =>
      b.onsetCount - b.comparisonCount - (a.onsetCount - a.comparisonCount) ||
      b.onsetCount - a.onsetCount ||
      (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0),
  )
  return drivers.slice(0, MAX_FLOW_DRIVERS)
}
