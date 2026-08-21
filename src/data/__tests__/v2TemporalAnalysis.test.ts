/* =====================================================================
   MODE · V2 temporal 분석 서비스 (P1-B / P2-A)
   getV2AnalysisBundle의 실제 consumer가 존재하고, 품질 gate가 노출을 제어하는지.
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { stateMeasurementRepository } from '..'
import { getTodayISODate, parseISODate, toISODate } from '../../lib/date'
import {
  buildV2TemporalInsights,
  getV2TemporalInsights,
} from '../services/v2TemporalAnalysisService'
import type { V2AnalysisBundle } from '../services/analysisDatasetService'
import type { CoreMetric, StateMeasurement } from '../modelsV2'

/* -------- 합성 bundle 유틸 -------- */
function sm(
  date: string,
  at: string,
  checkInType: StateMeasurement['checkInType'],
  metrics: Partial<Record<CoreMetric, number>>,
): StateMeasurement {
  const prompted = Object.keys(metrics) as CoreMetric[]
  return {
    localDate: date,
    recordedAt: at,
    timezoneOffsetMinutes: 540,
    checkInType,
    promptedMetrics: prompted,
    metrics: metrics as StateMeasurement['metrics'],
    source: 'manual',
    schemaVersion: 1,
    createdAt: at,
    updatedAt: at,
  }
}

function emptyBundle(measurements: StateMeasurement[]): V2AnalysisBundle {
  return {
    rangeDays: 120,
    start: '2026-07-01',
    end: '2026-07-31',
    measurements,
    meals: [],
    sleeps: [],
    activities: [],
    healthExceptions: [],
    stressEvents: [],
  }
}

const dISO = (i: number) => `2026-07-${String(i + 1).padStart(2, '0')}`

describe('buildV2TemporalInsights — 아침→저녁 (deterministic)', () => {
  it('아침보다 저녁 anxiety가 일관되게 높으면 morningEvening insight가 나타난다', () => {
    const ms: StateMeasurement[] = []
    for (let i = 0; i < 16; i++) {
      ms.push(sm(dISO(i), `${dISO(i)}T08:00:00.000Z`, 'morning', { anxiety: 3 }))
      ms.push(sm(dISO(i), `${dISO(i)}T21:00:00.000Z`, 'evening', { anxiety: 6 }))
    }
    const ins = buildV2TemporalInsights(emptyBundle(ms))
    expect(ins.available).toBe(true)
    const me = ins.morningEvening.find((m) => m.metric === 'anxiety')
    expect(me).toBeTruthy()
    expect(me!.summary.direction).toBe('increase')
    expect(me!.summary.meanDelta).toBeCloseTo(3, 6)
    expect(me!.summary.n).toBe(16)
  })

  it('쌍이 12 미만이면 노출하지 않는다(available false)', () => {
    const ms: StateMeasurement[] = []
    for (let i = 0; i < 5; i++) {
      ms.push(sm(dISO(i), `${dISO(i)}T08:00:00.000Z`, 'morning', { anxiety: 3 }))
      ms.push(sm(dISO(i), `${dISO(i)}T21:00:00.000Z`, 'evening', { anxiety: 6 }))
    }
    const ins = buildV2TemporalInsights(emptyBundle(ms))
    expect(ins.morningEvening).toHaveLength(0)
    expect(ins.available).toBe(false)
  })
})

describe('buildV2TemporalInsights — 사건 이후 같은 날 변화 (실제 timestamp 순서)', () => {
  it('사건 전 낮고 사건 후 높으면 eventResponse가 나타난다', () => {
    const ms: StateMeasurement[] = []
    const stressEvents: V2AnalysisBundle['stressEvents'] = []
    for (let i = 0; i < 6; i++) {
      // 사건 전(11:00) 낮음, 사건 후(15:00) 높음
      ms.push(sm(dISO(i), `${dISO(i)}T11:00:00.000Z`, 'adhoc', { anxiety: 2 }))
      ms.push(sm(dISO(i), `${dISO(i)}T15:00:00.000Z`, 'adhoc', { anxiety: 7 }))
      stressEvents.push({ localDate: dISO(i), category: 'interpersonal_conflict', intensity: 7, occurredAt: `${dISO(i)}T13:00:00.000Z` })
    }
    const ins = buildV2TemporalInsights({ ...emptyBundle(ms), stressEvents })
    const er = ins.eventResponses.find((e) => e.category === 'interpersonal_conflict')
    expect(er).toBeTruthy()
    expect(er!.eventCount).toBe(6)
    expect(er!.result.supportCount).toBe(6)
    expect(er!.result.meanDelta).toBeCloseTo(5, 6) // 7 - 2
  })

  it('사건 반복이 4회 미만이면 노출하지 않는다', () => {
    const ms: StateMeasurement[] = []
    const stressEvents: V2AnalysisBundle['stressEvents'] = []
    for (let i = 0; i < 2; i++) {
      ms.push(sm(dISO(i), `${dISO(i)}T11:00:00.000Z`, 'adhoc', { anxiety: 2 }))
      ms.push(sm(dISO(i), `${dISO(i)}T15:00:00.000Z`, 'adhoc', { anxiety: 7 }))
      stressEvents.push({ localDate: dISO(i), category: 'interpersonal_conflict', intensity: 7, occurredAt: `${dISO(i)}T13:00:00.000Z` })
    }
    const ins = buildV2TemporalInsights({ ...emptyBundle(ms), stressEvents })
    expect(ins.eventResponses).toHaveLength(0)
  })
})

describe('품질 gate — 미래 timestamp면 섹션 전체 숨김 (look-ahead 방어)', () => {
  it('future_timestamp error 플래그가 있으면 suppressedByQuality + 결과 없음', () => {
    const ms: StateMeasurement[] = []
    for (let i = 0; i < 16; i++) {
      ms.push(sm(dISO(i), `${dISO(i)}T08:00:00.000Z`, 'morning', { anxiety: 3 }))
      ms.push(sm(dISO(i), `${dISO(i)}T21:00:00.000Z`, 'evening', { anxiety: 6 }))
    }
    // 미래 시각 기록 1건 주입
    ms.push(sm('2099-01-01', '2099-01-01T08:00:00.000Z', 'morning', { anxiety: 5 }))
    const ins = buildV2TemporalInsights(emptyBundle(ms))
    expect(ins.suppressedByQuality).toBe(true)
    expect(ins.available).toBe(false)
    expect(ins.morningEvening).toHaveLength(0)
    expect(ins.qualityFlagCodes).toContain('future_timestamp')
  })
})

describe('데이터가 거의 없으면 available false (억지 insight 금지)', () => {
  it('소량 기록이면 아무 카테고리도 노출하지 않는다', () => {
    const ms = [
      sm(dISO(0), `${dISO(0)}T08:00:00.000Z`, 'morning', { anxiety: 3 }),
      sm(dISO(1), `${dISO(1)}T08:00:00.000Z`, 'morning', { anxiety: 4 }),
    ]
    const ins = buildV2TemporalInsights(emptyBundle(ms))
    expect(ins.available).toBe(false)
    expect(ins.lagged).toHaveLength(0)
    expect(ins.baselineShifts).toHaveLength(0)
  })
})

describe('getV2TemporalInsights — getV2AnalysisBundle의 실제 runtime consumer', () => {
  beforeEach(async () => { await resetDatabase() })

  it('DB에 쌓인 기록을 bundle로 읽어 morningEvening insight를 만든다', async () => {
    const today = getTodayISODate()
    const daysAgo = (n: number) => {
      const d = parseISODate(today)
      d.setDate(d.getDate() - n)
      return toISODate(d)
    }
    // 최근 14일: 아침 anxiety 3 / 저녁 anxiety 6
    for (let n = 2; n <= 15; n++) {
      const date = daysAgo(n)
      await stateMeasurementRepository.upsertCheckIn({
        localDate: date, recordedAt: `${date}T08:00:00.000Z`, timezoneOffsetMinutes: 540,
        checkInType: 'morning', promptedMetrics: ['anxiety'], metrics: { anxiety: 3 }, source: 'manual', schemaVersion: 1,
      })
      await stateMeasurementRepository.upsertCheckIn({
        localDate: date, recordedAt: `${date}T21:00:00.000Z`, timezoneOffsetMinutes: 540,
        checkInType: 'evening', promptedMetrics: ['anxiety'], metrics: { anxiety: 6 }, source: 'manual', schemaVersion: 1,
      })
    }
    const ins = await getV2TemporalInsights(120)
    expect(ins.available).toBe(true)
    expect(ins.morningEvening.some((m) => m.metric === 'anxiety' && m.summary.direction === 'increase')).toBe(true)
  })
})
