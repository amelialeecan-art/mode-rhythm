/* =====================================================================
   MODE · 데이터 품질/분석 가능성 판정 (순수 엔진 — DB 미접촉)
   "분석하기 전에 데이터가 믿을 만한지" 판정하는 계층.

   원칙:
   - engine은 DB를 모른다. 서비스가 레코드 배열을 넘긴다.
   - metric 분모는 "물어본 횟수(promptedCount)"다. 아침에 안 물어본 metric을
     missing으로 처벌하지 않는다.
   - "장기간 동일 값/0"을 자동으로 틀렸다고 하지 않는다 — suspicious flag만 붙인다.
   - V1 legacy(생성/애매한 0)를 V2 직접 rating과 동등한 측정으로 취급하지 않는다.
   ===================================================================== */
import type { CoreMetric, CheckInType, DataSource, StateMeasurement } from '../data/modelsV2'
import { CORE_METRICS } from '../data/modelsV2'

/* ---------------------------------------------------------------------
   B. provenance cohort — 분석에서 데이터를 어떻게 취급할지
   --------------------------------------------------------------------- */
export type ProvenanceCohort = 'v2_core' | 'legacy_compatible' | 'legacy_display_only'

/**
 * source/schemaVersion으로 cohort를 분류한다.
 * - manual/healthkit + schemaVersion>=1 → v2_core (직접 측정)
 * - import/derived → legacy_compatible (값은 신뢰하되 provenance 약함)
 * - legacy(V1 유래) → legacy_display_only (표시/열람용, core numeric 분석 제외)
 */
export function classifyProvenance(source: DataSource | undefined, schemaVersion: number | undefined): ProvenanceCohort {
  if (source === 'legacy') return 'legacy_display_only'
  if ((source === 'manual' || source === 'healthkit') && (schemaVersion ?? 0) >= 1) return 'v2_core'
  return 'legacy_compatible'
}

/* ---------------------------------------------------------------------
   C. 데이터 품질 리포트
   --------------------------------------------------------------------- */
export interface MetricQuality {
  metric: CoreMetric
  promptedCount: number // 이 metric을 실제로 "물어본" 체크인 수 = 분모
  numericAnsweredCount: number // 0~10 숫자 응답 수
  unknownCount: number // 'unknown' 응답 수
  missingCount: number // 물어봤지만 응답 없음 (prompted - numeric - unknown)
  coverageRate: number // numericAnswered / prompted (prompted=0이면 0)
  firstObservedAt?: string // 처음 숫자 응답한 recordedAt
  lastObservedAt?: string
}

export interface CheckInCoverage {
  checkInType: CheckInType
  count: number
}

export interface DataQualityReport {
  totalMeasurements: number
  rangeStart?: string
  rangeEnd?: string
  metrics: Record<CoreMetric, MetricQuality>
  checkInCoverage: CheckInCoverage[]
  schemaVersionBreakdown: Record<number, number>
  sourceBreakdown: Partial<Record<DataSource, number>>
  cohortBreakdown: Record<ProvenanceCohort, number>
}

function emptyMetricQuality(metric: CoreMetric): MetricQuality {
  return {
    metric,
    promptedCount: 0,
    numericAnsweredCount: 0,
    unknownCount: 0,
    missingCount: 0,
    coverageRate: 0,
  }
}

/**
 * StateMeasurement 배열 → 품질 리포트.
 * 분모는 promptedMetrics 기준 — 안 물어본 metric은 분모/분자에 넣지 않는다.
 */
export function buildDataQualityReport(measurements: StateMeasurement[]): DataQualityReport {
  const metrics = Object.fromEntries(CORE_METRICS.map((m) => [m, emptyMetricQuality(m)])) as Record<CoreMetric, MetricQuality>
  const checkInCounts = new Map<CheckInType, number>()
  const schemaVersionBreakdown: Record<number, number> = {}
  const sourceBreakdown: Partial<Record<DataSource, number>> = {}
  const cohortBreakdown: Record<ProvenanceCohort, number> = { v2_core: 0, legacy_compatible: 0, legacy_display_only: 0 }

  const sorted = [...measurements].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))

  for (const m of sorted) {
    checkInCounts.set(m.checkInType, (checkInCounts.get(m.checkInType) ?? 0) + 1)
    schemaVersionBreakdown[m.schemaVersion] = (schemaVersionBreakdown[m.schemaVersion] ?? 0) + 1
    sourceBreakdown[m.source] = (sourceBreakdown[m.source] ?? 0) + 1
    cohortBreakdown[classifyProvenance(m.source, m.schemaVersion)] += 1

    for (const metric of m.promptedMetrics) {
      const q = metrics[metric]
      if (!q) continue // 알 수 없는 metric은 무시
      q.promptedCount += 1
      const v = m.metrics[metric]
      if (typeof v === 'number') {
        q.numericAnsweredCount += 1
        if (!q.firstObservedAt) q.firstObservedAt = m.recordedAt
        q.lastObservedAt = m.recordedAt
      } else if (v === 'unknown') {
        q.unknownCount += 1
      }
      // v === null/undefined → 물어봤지만 미응답 (missing은 마지막에 계산)
    }
  }

  for (const metric of CORE_METRICS) {
    const q = metrics[metric]
    q.missingCount = q.promptedCount - q.numericAnsweredCount - q.unknownCount
    q.coverageRate = q.promptedCount > 0 ? q.numericAnsweredCount / q.promptedCount : 0
  }

  return {
    totalMeasurements: sorted.length,
    rangeStart: sorted[0]?.recordedAt,
    rangeEnd: sorted[sorted.length - 1]?.recordedAt,
    metrics,
    checkInCoverage: [...checkInCounts.entries()].map(([checkInType, count]) => ({ checkInType, count })),
    schemaVersionBreakdown,
    sourceBreakdown,
    cohortBreakdown,
  }
}

/* ---------------------------------------------------------------------
   D. 품질 플래그
   --------------------------------------------------------------------- */
export type QualityFlagCode =
  | 'high_missing_rate'
  | 'late_metric_onset'
  | 'schema_version_changed'
  | 'legacy_ambiguous_zero'
  | 'future_timestamp'
  | 'chronology_error'
  | 'duplicate_measurement'
  | 'impossible_numeric'
  | 'outlier'
  | 'long_constant_value'
  | 'sampling_time_bias'

export type QualitySeverity = 'info' | 'suspicious' | 'error'

export interface QualityFlag {
  code: QualityFlagCode
  severity: QualitySeverity
  metric?: CoreMetric
  detail: string
}

export interface QualityFlagOptions {
  now?: number // 현재 시각(ms) — 미래 timestamp 판정용
  highMissingThreshold?: number // 기본 0.6
  lateOnsetRatio?: number // 첫 관찰이 전체 기간의 이 비율 이후면 late (기본 0.5)
  longConstantRun?: number // 같은 값이 이만큼 연속이면 suspicious (기본 10)
}

/**
 * 품질 검사 → 플래그 목록. 값을 고치거나 삭제하지 않는다.
 * ⚠️ "장기간 동일 값/0"은 error가 아니라 suspicious로만 표시한다.
 */
export function detectQualityFlags(measurements: StateMeasurement[], opts: QualityFlagOptions = {}): QualityFlag[] {
  const now = opts.now ?? Date.now()
  const highMissing = opts.highMissingThreshold ?? 0.6
  const lateRatio = opts.lateOnsetRatio ?? 0.5
  const longRun = opts.longConstantRun ?? 10
  const flags: QualityFlag[] = []

  const sorted = [...measurements].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))

  // 5. future timestamp / invalid
  for (const m of sorted) {
    const t = Date.parse(m.recordedAt)
    if (Number.isNaN(t)) {
      flags.push({ code: 'chronology_error', severity: 'error', detail: `기록 시각을 해석할 수 없어요.` })
    } else if (t > now) {
      flags.push({ code: 'future_timestamp', severity: 'error', detail: `미래 시각으로 기록된 항목이 있어요.` })
    }
  }

  // 6. chronology: createdAt ≤ updatedAt 위반
  for (const m of sorted) {
    if (m.createdAt && m.updatedAt && Date.parse(m.updatedAt) < Date.parse(m.createdAt)) {
      flags.push({ code: 'chronology_error', severity: 'error', detail: `수정 시각이 생성 시각보다 앞서요.` })
    }
  }

  // 7. duplicate: 같은 (localDate, checkInType)에 morning/evening이 2개 이상
  const seen = new Map<string, number>()
  for (const m of sorted) {
    if (m.checkInType === 'adhoc') continue
    const key = `${m.localDate}|${m.checkInType}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) flags.push({ code: 'duplicate_measurement', severity: 'suspicious', detail: `${key} 체크인이 ${count}개 있어요.` })
  }

  // 3. schema version change within range
  const versions = new Set(sorted.map((m) => m.schemaVersion))
  if (versions.size > 1) {
    flags.push({ code: 'schema_version_changed', severity: 'info', detail: `기간 중 schemaVersion이 바뀌었어요(${[...versions].join(', ')}).` })
  }

  // 4. legacy ambiguous zero: legacy_display_only cohort의 0 값
  for (const m of sorted) {
    if (classifyProvenance(m.source, m.schemaVersion) !== 'legacy_display_only') continue
    for (const metric of CORE_METRICS) {
      if (m.metrics[metric] === 0) {
        flags.push({ code: 'legacy_ambiguous_zero', severity: 'suspicious', metric, detail: `legacy 기록의 0은 실제 0인지 불명확해요.` })
        break
      }
    }
  }

  // per-metric 검사
  const report = buildDataQualityReport(sorted)
  const spanMs = sorted.length >= 2 ? Date.parse(sorted[sorted.length - 1].recordedAt) - Date.parse(sorted[0].recordedAt) : 0

  for (const metric of CORE_METRICS) {
    const q = report.metrics[metric]
    if (q.promptedCount === 0) continue

    // 1. high missing rate
    const missingRate = q.missingCount / q.promptedCount
    if (missingRate >= highMissing) {
      flags.push({ code: 'high_missing_rate', severity: 'suspicious', metric, detail: `응답률이 낮아요(missing ${Math.round(missingRate * 100)}%).` })
    }

    // 2. late metric onset
    if (q.firstObservedAt && spanMs > 0) {
      const onsetOffset = Date.parse(q.firstObservedAt) - Date.parse(sorted[0].recordedAt)
      if (onsetOffset / spanMs > lateRatio) {
        flags.push({ code: 'late_metric_onset', severity: 'info', metric, detail: `이 metric은 기간 후반부터 기록되기 시작했어요.` })
      }
    }

    // 8. impossible numeric (0~10 정수 위반)
    // 9. outlier (|z|>3) / 10. long constant run
    const series: number[] = []
    for (const m of sorted) {
      const v = m.metrics[metric]
      if (typeof v === 'number') {
        if (!Number.isInteger(v) || v < 0 || v > 10) {
          flags.push({ code: 'impossible_numeric', severity: 'error', metric, detail: `0~10 범위 밖 값이 있어요.` })
        }
        series.push(v)
      }
    }
    if (series.length >= 5) {
      const mean = series.reduce((s, n) => s + n, 0) / series.length
      const sd = Math.sqrt(series.reduce((s, n) => s + (n - mean) ** 2, 0) / series.length)
      if (sd > 0) {
        for (const v of series) {
          if (Math.abs(v - mean) / sd > 3) {
            flags.push({ code: 'outlier', severity: 'suspicious', metric, detail: `평균에서 크게 벗어난 값이 있어요.` })
            break
          }
        }
      }
      // 10. long constant run (0 포함) — 틀렸다고 단정하지 않고 suspicious
      let run = 1
      let maxRun = 1
      for (let i = 1; i < series.length; i++) {
        run = series[i] === series[i - 1] ? run + 1 : 1
        maxRun = Math.max(maxRun, run)
      }
      if (maxRun >= longRun) {
        flags.push({ code: 'long_constant_value', severity: 'suspicious', metric, detail: `같은 값이 오래 이어졌어요(확인만 권장).` })
      }
    }
  }

  // 11. sampling time bias: 모든 기록이 좁은 시간대에만
  const hours = sorted.map((m) => new Date(m.recordedAt).getHours()).filter((h) => !Number.isNaN(h))
  if (hours.length >= 8) {
    const distinctBuckets = new Set(hours.map((h) => Math.floor(h / 4))) // 6개 4시간 버킷
    if (distinctBuckets.size <= 1) {
      flags.push({ code: 'sampling_time_bias', severity: 'info', detail: `특정 시간대에만 기록하는 경향이 있어요.` })
    }
  }

  return flags
}

/* ---------------------------------------------------------------------
   E. 분석 가능성 gate — 날짜 수만으로 신뢰도를 정하지 않는다
   --------------------------------------------------------------------- */
export interface MetricReadiness {
  metric: CoreMetric
  ready: boolean
  numericObservations: number
  coverageRate: number
  reason?: string
}

export interface AnalysisReadinessOptions {
  minObservations?: number // 실제 숫자 관찰 최소 수 (기본 20)
  minCoverage?: number // 최소 coverage (기본 0.5)
}

/** 단일 metric 분석 가능 여부 — 실제 숫자 관찰 수 + coverage 기반(날짜 수 아님). */
export function canAnalyzeMetric(
  measurements: StateMeasurement[],
  metric: CoreMetric,
  opts: AnalysisReadinessOptions = {},
): MetricReadiness {
  const minObs = opts.minObservations ?? 20
  const minCov = opts.minCoverage ?? 0.5
  const q = buildDataQualityReport(measurements).metrics[metric]
  const numericObservations = q.numericAnsweredCount
  const coverageRate = q.coverageRate
  let ready = true
  let reason: string | undefined
  if (numericObservations < minObs) {
    ready = false
    reason = `숫자 관찰이 ${numericObservations}회로 아직 부족해요(≥${minObs} 필요).`
  } else if (coverageRate < minCov) {
    ready = false
    reason = `응답률이 낮아요(${Math.round(coverageRate * 100)}%).`
  }
  return { metric, ready, numericObservations, coverageRate, reason }
}

export interface PairReadiness {
  ready: boolean
  pairedObservations: number
  reason?: string
}

export interface PairReadinessOptions {
  minPaired?: number // 두 metric이 동시에 관찰된 최소 쌍 수 (기본 15)
}

/**
 * 두 metric의 pairwise 분석 가능 여부.
 * 같은 측정에서 두 값이 모두 숫자로 존재한 "paired numeric observations" 수를 본다(날짜 아님).
 */
export function canAnalyzePair(
  measurements: StateMeasurement[],
  a: CoreMetric,
  b: CoreMetric,
  opts: PairReadinessOptions = {},
): PairReadiness {
  const minPaired = opts.minPaired ?? 15
  let paired = 0
  for (const m of measurements) {
    if (typeof m.metrics[a] === 'number' && typeof m.metrics[b] === 'number') paired += 1
  }
  const ready = paired >= minPaired
  return { ready, pairedObservations: paired, reason: ready ? undefined : `함께 기록된 쌍이 ${paired}개예요(≥${minPaired} 필요).` }
}

export interface ExposureReadiness {
  ready: boolean
  exposureCount: number
  reason?: string
}

/**
 * 노출(사건/식사 등) 반복 최소 횟수 gate. 같은 노출이 충분히 반복돼야 비교 가능.
 */
export function hasEnoughRepeatedExposure(exposureCount: number, minRepeats = 4): ExposureReadiness {
  const ready = exposureCount >= minRepeats
  return { ready, exposureCount, reason: ready ? undefined : `반복 노출이 ${exposureCount}회예요(≥${minRepeats} 필요).` }
}

export interface AnalysisReadiness {
  /** v2_core 측정 총 수(직접 측정만). */
  coreMeasurementCount: number
  /** 최소 하나의 metric이라도 분석 가능한가. */
  anyMetricReady: boolean
  perMetric: MetricReadiness[]
  /** source/schema가 일관적인가(섞임 경고용). */
  sourceConsistent: boolean
  schemaConsistent: boolean
}

/** 전체 분석 준비도 — 날짜 수가 아니라 실제 관찰/coverage/일관성을 종합. */
export function analysisReadiness(measurements: StateMeasurement[], opts: AnalysisReadinessOptions = {}): AnalysisReadiness {
  const report = buildDataQualityReport(measurements)
  const coreMeasurementCount = report.cohortBreakdown.v2_core
  const perMetric = CORE_METRICS.map((m) => canAnalyzeMetric(measurements, m, opts))
  return {
    coreMeasurementCount,
    anyMetricReady: perMetric.some((r) => r.ready),
    perMetric,
    sourceConsistent: Object.keys(report.sourceBreakdown).length <= 1,
    schemaConsistent: Object.keys(report.schemaVersionBreakdown).length <= 1,
  }
}
