/* =====================================================================
   MODE · V2 분석 · canonical dataset 조립 (순수 함수)
   V2 원자료(StateMeasurement/MealEpisode/EventLog 등)에서 분석용 시계열을 만든다.
   ⚠️ null/unknown은 numeric analysis에서 제외한다.
   ⚠️ 날짜 정렬/lag는 미래 데이터를 당겨 쓰지 않는다(no look-ahead).
   ===================================================================== */
import type { ISODate } from '../../data/models'
import type { CheckInType, CoreMetric, DataSource, MealEpisode, StateMeasurement } from '../../data/modelsV2'
import { parseISODate, toISODate } from '../../lib/date'

/** metric 관찰 1건 — 분석 입력의 최소 단위. */
export interface AnalysisObservation {
  date: ISODate
  at?: string
  metric: string
  value: number
  source: DataSource
  schemaVersion: number
}

/** 날짜별 단일 수치 시계열(오름차순). */
export interface DailyPoint {
  date: ISODate
  value: number
}
export type DailyValueSeries = DailyPoint[]

export function shiftDate(date: ISODate, days: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** DailyValueSeries → Map<date, value>. */
export function toDateMap(series: DailyValueSeries): Map<ISODate, number> {
  return new Map(series.map((p) => [p.date, p.value]))
}

export interface DailySeriesOptions {
  checkInType?: CheckInType // 특정 체크인만
  prefer?: 'mean' | 'morning' | 'evening' | 'latest' // 하루 여러 측정 처리(기본 mean)
}

/**
 * StateMeasurement[] → 특정 metric의 날짜별 수치 시계열.
 * null/unknown은 제외. 하루 여러 측정은 prefer 규칙으로 하나로.
 */
export function dailyMetricSeries(
  measurements: StateMeasurement[],
  metric: CoreMetric,
  opts: DailySeriesOptions = {},
): DailyValueSeries {
  const prefer = opts.prefer ?? 'mean'
  // date → 관찰 목록(값, 시각, 유형)
  const byDate = new Map<ISODate, { value: number; at: string; type: CheckInType }[]>()
  for (const m of measurements) {
    if (opts.checkInType && m.checkInType !== opts.checkInType) continue
    const v = m.metrics[metric]
    if (typeof v !== 'number') continue // null/unknown/미측정 제외
    const arr = byDate.get(m.localDate) ?? []
    arr.push({ value: v, at: m.recordedAt, type: m.checkInType })
    byDate.set(m.localDate, arr)
  }
  const out: DailyValueSeries = []
  for (const [date, arr] of byDate) {
    let value: number
    if (prefer === 'morning' || prefer === 'evening') {
      const picked = arr.find((a) => a.type === prefer)
      if (!picked) continue
      value = picked.value
    } else if (prefer === 'latest') {
      value = [...arr].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0].value
    } else {
      value = arr.reduce((s, a) => s + a.value, 0) / arr.length
    }
    out.push({ date, value })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/* ---------------------------------------------------------------------
   C. Morning → Evening 변화
   --------------------------------------------------------------------- */
export interface MorningEveningPair {
  date: ISODate
  morning: number
  evening: number
  delta: number // evening - morning
}

/** 같은 날 morning/evening 둘 다 숫자로 있는 metric의 (아침, 저녁, 변화). */
export function morningEveningPairs(measurements: StateMeasurement[], metric: CoreMetric): MorningEveningPair[] {
  const morning = toDateMap(dailyMetricSeries(measurements, metric, { checkInType: 'morning', prefer: 'morning' }))
  const evening = toDateMap(dailyMetricSeries(measurements, metric, { checkInType: 'evening', prefer: 'evening' }))
  const out: MorningEveningPair[] = []
  for (const [date, m] of morning) {
    const e = evening.get(date)
    if (e === undefined) continue
    out.push({ date, morning: m, evening: e, delta: e - m })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/* ---------------------------------------------------------------------
   Lag 정렬 (no look-ahead) + 이전 outcome 포함
   --------------------------------------------------------------------- */
export interface AlignedLag {
  dates: ISODate[]
  x: number[] // 노출/predictor at (date - lag)
  y: number[] // 결과 at date
}

/**
 * y(date) ~ x(date - lag) 정렬. lag>=0. 미래를 당겨 쓰지 않는다.
 * 두 시계열 모두 해당 날짜에 값이 있어야 쌍으로 포함.
 */
export function alignLagged(xSeries: DailyValueSeries, ySeries: DailyValueSeries, lag: number): AlignedLag {
  const xMap = toDateMap(xSeries)
  const dates: ISODate[] = []
  const x: number[] = []
  const y: number[] = []
  for (const yp of ySeries) {
    const xv = xMap.get(shiftDate(yp.date, -lag))
    if (xv === undefined) continue
    dates.push(yp.date)
    x.push(xv)
    y.push(yp.value)
  }
  return { dates, x, y }
}

export interface AlignedTable {
  dates: ISODate[]
  y: number[]
  /** predictor 행렬(행=관측). columnNames와 순서 일치. */
  X: number[][]
  columnNames: string[]
}

export interface PredictorSpec {
  name: string
  series: DailyValueSeries
  /** 이 predictor를 date-lag에서 가져온다(기본 0=같은 날). */
  lag?: number
}

/**
 * 결과 ySeries 기준으로 여러 predictor를 날짜 정렬해 회귀용 테이블을 만든다.
 * - includePrevY=true면 y(t-1)을 predictor로 추가(이전 outcome 보정).
 * - 어느 한 열이라도 결측인 날짜는 제외(listwise). 미래 미사용.
 */
export function buildAlignedTable(
  ySeries: DailyValueSeries,
  predictors: PredictorSpec[],
  opts: { includePrevY?: boolean } = {},
): AlignedTable {
  const yMap = toDateMap(ySeries)
  const maps = predictors.map((p) => ({ name: p.name, lag: p.lag ?? 0, map: toDateMap(p.series) }))
  const columnNames = [...predictors.map((p) => p.name)]
  if (opts.includePrevY) columnNames.push('prevY')

  const dates: ISODate[] = []
  const y: number[] = []
  const X: number[][] = []
  for (const yp of ySeries) {
    const row: number[] = []
    let ok = true
    for (const m of maps) {
      const v = m.map.get(shiftDate(yp.date, -m.lag))
      if (v === undefined) {
        ok = false
        break
      }
      row.push(v)
    }
    if (!ok) continue
    if (opts.includePrevY) {
      const prev = yMap.get(shiftDate(yp.date, -1))
      if (prev === undefined) continue
      row.push(prev)
    }
    dates.push(yp.date)
    y.push(yp.value)
    X.push(row)
  }
  return { dates, y, X, columnNames }
}

/* ---------------------------------------------------------------------
   노출(사건/식사) → 날짜별 시계열
   --------------------------------------------------------------------- */
/** 날짜별 노출 강도(같은 날 여러 건이면 최대). 값 없는 날은 0. */
export function exposureIntensityByDate(items: { localDate: ISODate; intensity: number }[]): Map<ISODate, number> {
  const map = new Map<ISODate, number>()
  for (const it of items) {
    map.set(it.localDate, Math.max(map.get(it.localDate) ?? 0, it.intensity))
  }
  return map
}

/**
 * 주어진 날짜 범위(anchorDates)에 대해 노출 강도 시계열을 만든다.
 * 노출이 없는 날은 0(=노출 없음)으로 채워 회귀에서 대조군이 되게 한다.
 */
export function exposureSeriesForDates(anchorDates: ISODate[], intensityByDate: Map<ISODate, number>): DailyValueSeries {
  return anchorDates
    .map((date) => ({ date, value: intensityByDate.get(date) ?? 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/* ---------------------------------------------------------------------
   G/H. confounder 시계열 (사전 정의된 작은 세트용)
   --------------------------------------------------------------------- */
/** 주말 여부(토/일=1). weekday confounder 대용(범주형 대신 0/1로 단순화). */
export function weekendSeries(dates: ISODate[]): DailyValueSeries {
  return dates.map((date) => {
    const day = parseISODate(date).getDay()
    return { date, value: day === 0 || day === 6 ? 1 : 0 }
  })
}

/** 시간 추세(linear date trend) confounder — 날짜 오름차순 0,1,2,…. */
export function timeTrendSeries(dates: ISODate[]): DailyValueSeries {
  const sorted = [...dates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return sorted.map((date, i) => ({ date, value: i }))
}

/** 식사 직전 hunger/craving/bingeUrge를 날짜별 최대 강도 시계열로. */
export function mealPreSeries(meals: MealEpisode[], field: 'prePhysicalHunger' | 'preCraving' | 'preBingeUrge'): DailyValueSeries {
  const byDate = new Map<ISODate, number>()
  for (const m of meals) {
    const v = m[field]
    if (typeof v !== 'number') continue
    byDate.set(m.localDate, Math.max(byDate.get(m.localDate) ?? -Infinity, v))
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1))
}
