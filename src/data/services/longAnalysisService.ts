/* =====================================================================
   MODE · V2 장기 분석 서비스 (DB → engine 경계)
   충분한 장기 데이터가 있을 때만 동작하는 분석 조립.
   engine은 DB를 모른다 — 이 서비스가 유일한 경계다. V1과 분리된 V2 경로.
   ===================================================================== */
import { getTodayISODate, parseISODate, toISODate } from '../../lib/date'
import type { ISODate } from '../models'
import type { CoreMetric } from '../modelsV2'
import { CORE_METRICS } from '../modelsV2'
import { CORE_STATE_META } from '../catalog/coreState'
import { cycleStartDates } from '../../engine/cycle'
import {
  cycleWindowAssociation,
  applyCycleFamilyFdr,
  completedCycleCount,
  clusterDays,
  dailyMetricSeries,
  PREMENSTRUAL_WINDOW,
  type ClusterResult,
  type CycleWindowResult,
  type ClusterDay,
} from '../../engine/v2'
import { cycleLogRepository, stateMeasurementRepository } from '../repositories'

function addDaysISO(date: ISODate, n: number): ISODate {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/* ---------------------------------------------------------------------
   A/B. Cycle-aligned retrospective (metric별 — 셋을 절대 합치지 않음)
   --------------------------------------------------------------------- */
/** 분석 대상 metric(식욕 3축을 각각 분리). sleep은 향후 확장. */
export const CYCLE_ALIGNED_METRICS: CoreMetric[] = [
  'physicalHunger',
  'craving',
  'bingeUrge',
  'moodLow',
  'anxiety',
  'irritability',
  'energy',
  'fatigueHeaviness',
  'bloating',
  'painDiscomfort',
]

export interface CycleAlignedEntry {
  metric: CoreMetric
  label: string
  result: CycleWindowResult
}

export interface CycleAlignedInsights {
  available: boolean
  completedCycles: number
  minCyclesRequired: number
  /** 4~6주기면 더 강한 자료라는 안내를 UI가 띄울지. */
  strongerWithMoreCycles: boolean
  entries: CycleAlignedEntry[]
}

/** 완료된 주기를 겹쳐 월경 전(D-7~D-1) window에서 metric별 변화를 본다. */
export async function getCycleAlignedInsights(rangeDays = 220, minCycles = 3): Promise<CycleAlignedInsights> {
  const end = getTodayISODate()
  const start = addDaysISO(end, -(rangeDays - 1))
  const [measurements, cycleLogs] = await Promise.all([
    stateMeasurementRepository.listByDateRange(start, end),
    cycleLogRepository.listByDateRange(start, end),
  ])
  const starts = cycleStartDates(cycleLogs) // 실제 periodStart (retrospective — 미래 미사용)
  const completedCycles = completedCycleCount(starts)

  if (completedCycles < minCycles) {
    return { available: false, completedCycles, minCyclesRequired: minCycles, strongerWithMoreCycles: completedCycles < 4, entries: [] }
  }

  const rawEntries: CycleAlignedEntry[] = CYCLE_ALIGNED_METRICS.map((metric) => {
    const series = dailyMetricSeries(measurements, metric, { prefer: 'mean' })
    const result = cycleWindowAssociation(series, starts, PREMENSTRUAL_WINDOW, { minCycles })
    return { metric, label: CORE_STATE_META[metric].label, result }
  })
  // metric family FDR 적용(다중비교 보정) + confidence 재계산
  const entries = applyCycleFamilyFdr(rawEntries)

  return {
    available: entries.some((e) => e.result.status === 'ok'),
    completedCycles,
    minCyclesRequired: minCycles,
    strongerWithMoreCycles: completedCycles < 4,
    entries,
  }
}

/* ---------------------------------------------------------------------
   C/D. 상태 군집 (충분+안정할 때만)
   --------------------------------------------------------------------- */
/** 하루를 core metric 평균으로 요약해 군집 입력을 만든다. */
export async function getStateClusters(rangeDays = 220): Promise<ClusterResult> {
  const end = getTodayISODate()
  const start = addDaysISO(end, -(rangeDays - 1))
  const measurements = await stateMeasurementRepository.listByDateRange(start, end)

  // 날짜별 metric 평균(숫자만). null/unknown 제외.
  const byDate = new Map<ISODate, Record<string, { sum: number; n: number }>>()
  for (const m of measurements) {
    const rec = byDate.get(m.localDate) ?? {}
    for (const metric of CORE_METRICS) {
      const v = m.metrics[metric]
      if (typeof v !== 'number') continue
      const cur = rec[metric] ?? { sum: 0, n: 0 }
      cur.sum += v
      cur.n += 1
      rec[metric] = cur
    }
    byDate.set(m.localDate, rec)
  }
  const days: ClusterDay[] = [...byDate.entries()].map(([date, rec]) => {
    const values: Record<string, number | undefined> = {}
    for (const metric of CORE_METRICS) {
      const agg = rec[metric]
      if (agg) values[metric] = agg.sum / agg.n
    }
    return { date, values }
  })

  return clusterDays(days, [...CORE_METRICS])
}
