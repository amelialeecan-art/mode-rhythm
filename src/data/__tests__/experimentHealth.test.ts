/* =====================================================================
   MODE · 실험 엔진 + provider 경계/충돌 해석 테스트
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import { analyzeExperiment } from '../../engine/v2'
import { containsAssertion } from '../../copy/tone'
import { EXPERIMENT_INTERVENTIONS } from '../catalog/experiments'
import { resolveBySourcePriority } from '../health/sourceResolver'
import { hasHealthProvider, registerHealthProvider, clearHealthProvider } from '../health/healthProvider'
import { ingestHealthBundle } from '../services/healthIngestService'
import { resolveDailySleep } from '../services/sleepResolveService'
import { sleepEpisodeRepository, screenMetricRepository } from '../repositories'

describe('analyzeExperiment (A)', () => {
  it('그룹 관측이 적으면 insufficient', () => {
    const r = analyzeExperiment({ baselineValues: [5, 6], interventionValues: [4], plannedBaselineDays: 14, plannedInterventionDays: 14 })
    expect(r.status).toBe('insufficient')
  })
  it('개입 후 낮아지면 effectDifference 음수 + 기록률/관측 반환 (adherence는 unavailable)', () => {
    const baseline = [7, 8, 7, 8, 7, 8]
    const intervention = [4, 5, 4, 5, 4, 5]
    const r = analyzeExperiment({ baselineValues: baseline, interventionValues: intervention, plannedBaselineDays: 6, plannedInterventionDays: 6 })
    expect(r.status).toBe('ok')
    expect(r.effectDifference).toBeLessThan(0) // intervention - baseline
    expect(r.usableObservations).toBe(12)
    // 기록률(logging coverage)은 12/12 = 1. 이것은 개입 준수율(adherence)이 아니다.
    expect(r.loggingCoverage).toBeCloseTo(1, 6)
    // 실제 행동 준수 데이터가 없으므로 adherence는 unavailable(null).
    expect(r.adherence).toBeNull()
    expect(r.ci).not.toBeNull()
  })
  it('"효과 입증" 같은 단정 문구를 만들지 않는다', () => {
    const r = analyzeExperiment({ baselineValues: [7, 8, 7, 8, 7], interventionValues: [4, 5, 4, 5, 4], plannedBaselineDays: 5, plannedInterventionDays: 5 })
    expect(r.note).not.toMatch(/입증|증명|효과가 있다|치료/)
    expect(containsAssertion(r.note)).toBe(false)
  })
  it('개입 카탈로그에 의료 변경(약 중단/용량)이 없다', () => {
    const codes = EXPERIMENT_INTERVENTIONS.map((i) => i.code)
    for (const c of codes) expect(c).not.toMatch(/med|dose|drug|약/)
  })
})

describe('source priority resolver (C)', () => {
  it('manual이 healthkit보다 우선, 원본은 모두 보존', () => {
    const res = resolveBySourcePriority([
      { source: 'healthkit', at: '2026-08-21T07:00:00Z', value: 'hk' },
      { source: 'manual', at: '2026-08-21T06:00:00Z', value: 'manual' },
    ])
    expect(res!.chosenSource).toBe('manual')
    expect(res!.chosen.value).toBe('manual')
    expect(res!.all).toHaveLength(2) // 양쪽 보존
  })
  it('같은 source면 최신 값', () => {
    const res = resolveBySourcePriority([
      { source: 'manual', at: '2026-08-21T06:00:00Z', value: 'old' },
      { source: 'manual', at: '2026-08-21T09:00:00Z', value: 'new' },
    ])
    expect(res!.chosen.value).toBe('new')
  })
})

describe('provider 경계 (B)', () => {
  it('provider가 없으면 hasHealthProvider false (PWA 정상)', () => {
    clearHealthProvider()
    expect(hasHealthProvider()).toBe(false)
  })
  it('provider 등록/해제', () => {
    registerHealthProvider({
      id: 'stub', source: 'healthkit',
      capabilities: () => ({ sleep: true, steps: false, workouts: false, restingHeartRate: false, hrv: false, weight: false, menstrual: false, screen: false }),
      fetch: async () => ({}),
    })
    expect(hasHealthProvider()).toBe(true)
    clearHealthProvider()
    expect(hasHealthProvider()).toBe(false)
  })
})

describe('healthkit ingest (C) — 원자료 overwrite 없음', () => {
  beforeEach(async () => { await resetDatabase() })

  it('healthkit sleep을 add하면 manual과 공존하고, resolver가 manual을 canonical로 선택', async () => {
    // 수동 수면(사용자 수정)
    await sleepEpisodeRepository.add({
      localDate: '2026-08-21', sleepOnsetAt: '2026-08-20T23:30:00.000Z', wakeAt: '2026-08-21T07:00:00.000Z',
      source: 'manual', schemaVersion: 1,
    })
    // healthkit ingest (다른 값)
    await ingestHealthBundle({
      sleep: [{ localDate: '2026-08-21', sleepOnsetAt: '2026-08-20T23:00:00.000Z', wakeAt: '2026-08-21T06:30:00.000Z' }],
    })
    // 두 원본 모두 보존
    expect(await db.sleepEpisodes.where('localDate').equals('2026-08-21').count()).toBe(2)
    // canonical은 manual
    const resolved = await resolveDailySleep('2026-08-21')
    expect(resolved.episode?.source).toBe('manual')
    expect(resolved.durationMinutes).toBe(450) // manual 07:00-23:30 = 7.5h
  })

  it('하루 1행형(screen)은 기존 manual을 덮어쓰지 않는다', async () => {
    await screenMetricRepository.upsertByDate({ localDate: '2026-08-21', preBed2hMinutes: 90, source: 'manual', schemaVersion: 1 })
    await ingestHealthBundle({ screen: [{ localDate: '2026-08-21', preBed2hMinutes: 200 }] })
    const row = await screenMetricRepository.getByDate('2026-08-21')
    expect(row?.preBed2hMinutes).toBe(90) // manual 보존
    expect(row?.source).toBe('manual')
  })
})
