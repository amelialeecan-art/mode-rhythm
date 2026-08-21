import { describe, expect, it } from 'vitest'
import {
  analysisReadiness,
  buildDataQualityReport,
  canAnalyzeMetric,
  canAnalyzePair,
  classifyProvenance,
  detectQualityFlags,
  hasEnoughRepeatedExposure,
} from '../dataQuality'
import type { CheckInType, CoreMetric, CoreMetricValues, DataSource, StateMeasurement } from '../../data/modelsV2'

let seq = 0
function sm(
  opts: {
    date?: string
    at?: string
    type?: CheckInType
    prompted: CoreMetric[]
    metrics: CoreMetricValues
    source?: DataSource
    schemaVersion?: number
  },
): StateMeasurement {
  const date = opts.date ?? '2026-08-01'
  return {
    id: ++seq,
    localDate: date,
    recordedAt: opts.at ?? `${date}T08:00:00.000Z`,
    timezoneOffsetMinutes: 540,
    checkInType: opts.type ?? 'morning',
    promptedMetrics: opts.prompted,
    metrics: opts.metrics,
    source: opts.source ?? 'manual',
    schemaVersion: opts.schemaVersion ?? 1,
    createdAt: opts.at ?? `${date}T08:00:00.000Z`,
    updatedAt: opts.at ?? `${date}T08:00:00.000Z`,
  }
}

describe('classifyProvenance (B)', () => {
  it('source/schemaVersion으로 cohort를 나눈다', () => {
    expect(classifyProvenance('manual', 1)).toBe('v2_core')
    expect(classifyProvenance('healthkit', 1)).toBe('v2_core')
    expect(classifyProvenance('legacy', 1)).toBe('legacy_display_only')
    expect(classifyProvenance('import', 1)).toBe('legacy_compatible')
    expect(classifyProvenance('manual', 0)).toBe('legacy_compatible')
  })
})

describe('buildDataQualityReport (C)', () => {
  it('0/null/unknown을 각각 numeric/missing/unknown으로 센다', () => {
    const r = buildDataQualityReport([
      sm({ prompted: ['moodLow', 'anxiety', 'energy'], metrics: { moodLow: 0, anxiety: 'unknown' } }), // energy=미응답
    ])
    const q = r.metrics.moodLow
    expect(q.promptedCount).toBe(1)
    expect(q.numericAnsweredCount).toBe(1) // 0은 numeric 응답
    expect(r.metrics.anxiety.unknownCount).toBe(1)
    expect(r.metrics.energy.missingCount).toBe(1) // 물어봤지만 미응답
    expect(r.metrics.energy.numericAnsweredCount).toBe(0)
  })

  it('prompted denominator가 정확하다 — 안 물어본 metric은 missing penalty에 안 들어간다', () => {
    // 아침 2회, craving은 아침에 안 물어봄
    const r = buildDataQualityReport([
      sm({ date: '2026-08-01', prompted: ['moodLow', 'energy'], metrics: { moodLow: 3, energy: 5 } }),
      sm({ date: '2026-08-02', prompted: ['moodLow', 'energy'], metrics: { moodLow: 4, energy: 6 } }),
    ])
    // craving은 한 번도 prompted 아님 → 분모 0, missing 0 (처벌 없음)
    expect(r.metrics.craving.promptedCount).toBe(0)
    expect(r.metrics.craving.missingCount).toBe(0)
    expect(r.metrics.craving.coverageRate).toBe(0)
    // moodLow는 2회 prompted, 2회 응답 → coverage 1
    expect(r.metrics.moodLow.promptedCount).toBe(2)
    expect(r.metrics.moodLow.coverageRate).toBe(1)
  })

  it('checkInType coverage / schema / source / cohort breakdown', () => {
    const r = buildDataQualityReport([
      sm({ type: 'morning', prompted: ['moodLow'], metrics: { moodLow: 1 }, schemaVersion: 1, source: 'manual' }),
      sm({ type: 'evening', prompted: ['moodLow'], metrics: { moodLow: 2 }, schemaVersion: 1, source: 'manual' }),
      sm({ type: 'evening', prompted: ['moodLow'], metrics: { moodLow: 3 }, schemaVersion: 2, source: 'import' }),
    ])
    expect(r.checkInCoverage.find((c) => c.checkInType === 'evening')?.count).toBe(2)
    expect(r.schemaVersionBreakdown).toEqual({ 1: 2, 2: 1 })
    expect(r.sourceBreakdown).toEqual({ manual: 2, import: 1 })
    expect(r.cohortBreakdown.v2_core).toBe(2)
    expect(r.cohortBreakdown.legacy_compatible).toBe(1)
  })
})

describe('detectQualityFlags (D)', () => {
  it('schema version이 기간 중 바뀌면 flag', () => {
    const flags = detectQualityFlags([
      sm({ date: '2026-08-01', prompted: ['moodLow'], metrics: { moodLow: 1 }, schemaVersion: 1 }),
      sm({ date: '2026-08-02', prompted: ['moodLow'], metrics: { moodLow: 2 }, schemaVersion: 2 }),
    ])
    expect(flags.some((f) => f.code === 'schema_version_changed')).toBe(true)
  })

  it('legacy ambiguous zero는 suspicious flag로만 표시(삭제/수정 안 함)', () => {
    const flags = detectQualityFlags([
      sm({ prompted: ['moodLow'], metrics: { moodLow: 0 }, source: 'legacy' }),
    ])
    const f = flags.find((x) => x.code === 'legacy_ambiguous_zero')
    expect(f?.severity).toBe('suspicious')
  })

  it('미래 timestamp는 error flag', () => {
    const now = Date.parse('2026-08-10T00:00:00.000Z')
    const flags = detectQualityFlags(
      [sm({ at: '2026-08-20T08:00:00.000Z', prompted: ['moodLow'], metrics: { moodLow: 1 } })],
      { now },
    )
    expect(flags.some((f) => f.code === 'future_timestamp' && f.severity === 'error')).toBe(true)
  })

  it('장기간 동일 값은 error가 아니라 suspicious로만', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      sm({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, prompted: ['moodLow'], metrics: { moodLow: 0 } }),
    )
    const flags = detectQualityFlags(rows)
    const f = flags.find((x) => x.code === 'long_constant_value')
    expect(f?.severity).toBe('suspicious')
  })
})

describe('canAnalyzePair (E)', () => {
  it('두 metric이 동시에 숫자로 있는 쌍만 센다', () => {
    const rows = [
      sm({ date: '2026-08-01', prompted: ['moodLow', 'energy'], metrics: { moodLow: 3, energy: 5 } }), // paired
      sm({ date: '2026-08-02', prompted: ['moodLow', 'energy'], metrics: { moodLow: 4 } }), // energy 없음 → 쌍 아님
      sm({ date: '2026-08-03', prompted: ['moodLow', 'energy'], metrics: { moodLow: 2, energy: 'unknown' } }), // unknown → 쌍 아님
    ]
    const r = canAnalyzePair(rows, 'moodLow', 'energy', { minPaired: 2 })
    expect(r.pairedObservations).toBe(1)
    expect(r.ready).toBe(false)
  })
})

describe('canAnalyzeMetric / analysisReadiness (E)', () => {
  it('날짜 수가 아니라 실제 숫자 관찰 수 + coverage로 판정한다', () => {
    // 30일에 걸쳐 있지만 실제 숫자 관찰은 5회뿐 → 관찰 부족으로 not ready
    const rows = Array.from({ length: 5 }, (_, i) =>
      sm({ date: `2026-08-${String(i * 6 + 1).padStart(2, '0')}`, prompted: ['moodLow'], metrics: { moodLow: 3 } }),
    )
    const r = canAnalyzeMetric(rows, 'moodLow', { minObservations: 20 })
    expect(r.numericObservations).toBe(5)
    expect(r.ready).toBe(false)
  })

  it('관찰이 충분하면 ready', () => {
    const rows = Array.from({ length: 22 }, (_, i) =>
      sm({ date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`, at: `2026-08-01T0${i % 9}:00:00.000Z`, prompted: ['moodLow'], metrics: { moodLow: (i % 10) } }),
    )
    const r = canAnalyzeMetric(rows, 'moodLow', { minObservations: 20, minCoverage: 0.5 })
    expect(r.ready).toBe(true)
    const readiness = analysisReadiness(rows, { minObservations: 20 })
    expect(readiness.anyMetricReady).toBe(true)
    expect(readiness.coreMeasurementCount).toBe(22) // 전부 v2_core
  })

  it('반복 노출 gate', () => {
    expect(hasEnoughRepeatedExposure(3, 4).ready).toBe(false)
    expect(hasEnoughRepeatedExposure(4, 4).ready).toBe(true)
  })
})
