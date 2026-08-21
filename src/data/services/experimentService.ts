/* =====================================================================
   MODE · N-of-1 실험 서비스 (DB → engine 경계)
   실험의 baseline/intervention 구간에서 targetMetric 관찰을 모아 분석한다.
   ⚠️ 생활요인 실험만. 의료 치료 변경 실험을 만들거나 제안하지 않는다.
   ===================================================================== */
import { parseISODate } from '../../lib/date'
import type { ISODate } from '../models'
import type { Experiment } from '../modelsV2'
import { analyzeExperiment, dailyMetricSeries, type ExperimentAnalysis } from '../../engine/v2'
import { experimentRepository, stateMeasurementRepository } from '../repositories'

function daysBetweenInclusive(a: ISODate, b: ISODate): number {
  return Math.max(0, Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000) + 1)
}

/** 실험 하나의 baseline vs intervention 분석(순수 engine 호출). */
export async function analyzeExperimentById(id: number): Promise<{ experiment: Experiment; analysis: ExperimentAnalysis } | null> {
  const experiment = await experimentRepository.getById(id)
  if (!experiment) return null

  const [baselineMs, interventionMs] = await Promise.all([
    stateMeasurementRepository.listByDateRange(experiment.baselineStart, experiment.baselineEnd),
    stateMeasurementRepository.listByDateRange(experiment.interventionStart, experiment.interventionEnd),
  ])
  const baselineValues = dailyMetricSeries(baselineMs, experiment.targetMetric, { prefer: 'mean' }).map((p) => p.value)
  const interventionValues = dailyMetricSeries(interventionMs, experiment.targetMetric, { prefer: 'mean' }).map((p) => p.value)

  const analysis = analyzeExperiment({
    baselineValues,
    interventionValues,
    plannedBaselineDays: daysBetweenInclusive(experiment.baselineStart, experiment.baselineEnd),
    plannedInterventionDays: daysBetweenInclusive(experiment.interventionStart, experiment.interventionEnd),
  })
  return { experiment, analysis }
}

/** 모든 실험 + 분석. UI 목록용. */
export async function getExperimentsWithAnalysis(): Promise<{ experiment: Experiment; analysis: ExperimentAnalysis }[]> {
  const experiments = await experimentRepository.list()
  const out: { experiment: Experiment; analysis: ExperimentAnalysis }[] = []
  for (const experiment of experiments) {
    const r = await analyzeExperimentById(experiment.id!)
    if (r) out.push(r)
  }
  return out
}
