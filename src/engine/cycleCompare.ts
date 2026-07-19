/* =====================================================================
   MODE · 생리주기별 흐름 비교 (순수 함수 · 9B-2B)
   생리 시작일을 0일로 맞춰 상대 주기일(-14..+7)의 metric 흐름을 만든다.
   - 고정 28일로 억지 변환하지 않는다. 실제 기록된 시작일과 날짜 차이만 사용.
   - 최근 주기(단일) vs 그 이전 최대 3주기 평균, 두 선만.
   - 결측일은 0으로 세지 않고 실제 기록만 평균. 미래 날짜를 만들지 않는다.
   scoring/분석 공식은 건드리지 않는다 — 표시용 집계.
   ===================================================================== */
import type { ISODate } from '../data/models'
import { parseISODate, toISODate } from '../lib/date'

export const CYCLE_BEFORE = 14 // -14일
export const CYCLE_AFTER = 7 // +7일
export const MAX_PREV_CYCLES = 3
export const MIN_PERIOD_STARTS = 3
export const MIN_COMPARE_CYCLES = 2

export interface CyclePoint {
  rel: number
  /** 존재하는 값만 평균. 없으면 undefined(선 끊김). */
  mean?: number
  /** 최근 선: 기록 있으면 1. 이전 평균 선: 값이 있었던 주기 수. */
  n: number
}

export interface CycleCompareCurve {
  /** 가장 최근 주기(단일). */
  recent: CyclePoint[]
  /** 그 이전 최대 3주기 평균. */
  previous: CyclePoint[]
  baseline: number
  /** 이전 평균에 실제 기여한 주기 수. */
  compareCycles: number
}

function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}
function round(n: number): number {
  return Math.round(n)
}

/**
 * periodStarts = 생리 시작일들(정렬 무관), metricByDate = 날짜→metric(기록된 날만).
 * 최근 시작일을 0일로, 그 직전 최대 3주기를 평균과 비교한다.
 */
export function buildCycleCompare(periodStarts: ISODate[], metricByDate: Map<ISODate, number>): CycleCompareCurve {
  const starts = [...new Set(periodStarts)].sort()
  const baselineVals = [...metricByDate.values()]
  const baseline = baselineVals.length ? round(baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length) : 0

  if (starts.length === 0) {
    return { recent: [], previous: [], baseline, compareCycles: 0 }
  }

  const recentStart = starts[starts.length - 1]
  const prevStarts = starts.slice(Math.max(0, starts.length - 1 - MAX_PREV_CYCLES), starts.length - 1)

  const recent: CyclePoint[] = []
  const previous: CyclePoint[] = []
  const contributing = new Set<ISODate>()

  for (let rel = -CYCLE_BEFORE; rel <= CYCLE_AFTER; rel++) {
    // 최근 주기: 단일 값(미래/결측이면 undefined)
    const rv = metricByDate.get(addDays(recentStart, rel))
    recent.push({ rel, mean: rv, n: rv !== undefined ? 1 : 0 })

    // 이전 최대 3주기 평균
    const vals: number[] = []
    for (const s of prevStarts) {
      const v = metricByDate.get(addDays(s, rel))
      if (v !== undefined) {
        vals.push(v)
        contributing.add(s)
      }
    }
    previous.push({ rel, mean: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined, n: vals.length })
  }

  return { recent, previous, baseline, compareCycles: contributing.size }
}
