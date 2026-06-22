import { describe, expect, it } from 'vitest'
import { buildCycleContext, calcCycleLoad, type CycleContext } from '../cycle'
import { makeCycle } from './factories'

describe('buildCycleContext', () => {
  it('periodStart 이후 1~6일이면 isPeriod true, periodDay 계산', () => {
    const logs = [makeCycle({ date: '2026-06-20', periodStart: true })]
    const ctx = buildCycleContext('2026-06-21', logs)
    expect(ctx.isPeriod).toBe(true)
    expect(ctx.periodDay).toBe(2)
  })

  it('periodEnd 이후면 isPeriod false', () => {
    const logs = [
      makeCycle({ date: '2026-06-20', periodStart: true }),
      makeCycle({ date: '2026-06-24', periodEnd: true }),
    ]
    const ctx = buildCycleContext('2026-06-26', logs)
    expect(ctx.isPeriod).toBe(false)
  })

  it('시작일 간격 중앙값으로 estimatedCycleLength + 다음 예정일 계산', () => {
    const logs = [
      makeCycle({ date: '2026-04-03', periodStart: true }),
      makeCycle({ date: '2026-05-01', periodStart: true }), // +28
      makeCycle({ date: '2026-05-31', periodStart: true }), // +30
    ]
    const ctx = buildCycleContext('2026-06-10', logs)
    expect(ctx.estimatedCycleLength).toBe(29) // median(28,30)
    expect(ctx.nextPeriodDate).toBe('2026-06-29') // 05-31 + 29
    expect(ctx.confidence).toBe('medium')
  })

  it('예정 1~7일 전이면 isPremenstrualWindow true', () => {
    const logs = [
      makeCycle({ date: '2026-05-04', periodStart: true }),
      makeCycle({ date: '2026-06-01', periodStart: true }), // +28 → next 06-29
    ]
    const ctx = buildCycleContext('2026-06-24', logs) // 5일 전
    expect(ctx.isPremenstrualWindow).toBe(true)
    expect(ctx.isPeriod).toBe(false)
  })

  it('데이터가 없으면 confidence none', () => {
    expect(buildCycleContext('2026-06-21', []).confidence).toBe('none')
  })

  it('시작일 1개면 confidence low', () => {
    const ctx = buildCycleContext('2026-06-21', [makeCycle({ date: '2026-06-20', periodStart: true })])
    expect(ctx.confidence).toBe('low')
  })
})

describe('calcCycleLoad', () => {
  const premenstrual = (confidence: CycleContext['confidence']): CycleContext => ({
    isPeriod: false,
    isPremenstrualWindow: true,
    isOvulationWindow: false,
    confidence,
  })

  it('confidence low면 cycleLoad가 낮게 보정된다', () => {
    const med = calcCycleLoad(premenstrual('medium'))
    const low = calcCycleLoad(premenstrual('low'))
    expect(low).toBeLessThan(med)
  })

  it('생리 1~2일차면 base가 높다', () => {
    const ctx: CycleContext = { isPeriod: true, periodDay: 1, isPremenstrualWindow: false, isOvulationWindow: false, confidence: 'high' }
    expect(calcCycleLoad(ctx)).toBeGreaterThanOrEqual(75)
  })

  it('생리통이 있으면 부하가 가산된다', () => {
    const ctx: CycleContext = { isPeriod: true, periodDay: 3, isPremenstrualWindow: false, isOvulationWindow: false, confidence: 'high' }
    const noPain = calcCycleLoad(ctx)
    const withPain = calcCycleLoad(ctx, makeCycle({ periodPain: 6 }))
    expect(withPain).toBeGreaterThan(noPain)
  })
})
