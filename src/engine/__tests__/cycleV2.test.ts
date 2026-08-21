/* =====================================================================
   MODE · 생리 주기 엔진 V2 테스트
   핵심: 28일 hard fallback 금지 · prospective/retrospective 분리 · look-ahead 금지.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  buildCycleContext,
  calcCycleLoad,
  cycleLengths,
  cycleStartDates,
  currentCycleDay,
  dataConfidence,
  cycleHistoryStats,
  prospectivePeriodWindow,
  getRelativeDayToNextPeriod,
  periodDuration,
} from '../cycle'
import { makeCycle } from './factories'
import type { CycleLog, UserSettings } from '../../data/models'

const start = (date: string) => makeCycle({ date, periodStart: true })

/* 1 */
describe('1. periodStart 0개', () => {
  it('confidence none, 예측/구간 없음', () => {
    const ctx = buildCycleContext('2026-08-15', [])
    expect(ctx.confidence).toBe('none')
    expect(ctx.isPeriod).toBe(false)
    expect(ctx.estimatedCycleLength).toBeUndefined()
    expect(ctx.nextPeriodDate).toBeUndefined()
    expect(ctx.isPremenstrualWindow).toBe(false)
    expect(ctx.prospective).toBeUndefined()
  })
})

/* 2 + 9 */
describe('2/9. periodStart 1개 — cycleDay는 알지만 28일 fallback 예측 금지', () => {
  const settings = { averageCycleLength: 28 } as UserSettings
  it('cycleDay는 계산되지만 next period estimate는 unavailable, PMS 확정 없음', () => {
    const logs = [start('2026-08-01')]
    const ctx = buildCycleContext('2026-08-10', logs, settings)
    expect(currentCycleDay('2026-08-10', logs)).toBe(10) // 사실
    expect(ctx.confidence).toBe('low')
    // averageCycleLength=28을 근거로 예측하지 않는다
    expect(ctx.estimatedCycleLength).toBeUndefined()
    expect(ctx.nextPeriodDate).toBeUndefined()
    expect(ctx.daysUntilNextPeriod).toBeUndefined()
    expect(ctx.isPremenstrualWindow).toBe(false)
    expect(ctx.isOvulationWindow).toBe(false)
    expect(ctx.prospective?.available).toBe(false)
  })
})

/* 3 */
describe('3. periodStart 2개 — 관찰 간격 1개로 예측(28 아님)', () => {
  it('실제 간격을 estimate로 쓰고 confidence medium', () => {
    const logs = [start('2026-05-01'), start('2026-05-31')] // +30
    const ctx = buildCycleContext('2026-06-10', logs)
    expect(ctx.estimatedCycleLength).toBe(30) // 28 아님 — 실제 관찰값
    expect(ctx.nextPeriodDate).toBe('2026-06-30')
    expect(ctx.confidence).toBe('medium')
    expect(ctx.prospective?.available).toBe(true)
  })
})

/* 4 */
describe('4. 불규칙 26/28/34', () => {
  it('median 기반 estimate와 이력 통계(극단값 삭제 없이 flag)', () => {
    const logs = [start('2026-01-01'), start('2026-01-27'), start('2026-02-24'), start('2026-03-30')] // 26, 28, 34
    const intervals = cycleLengths(cycleStartDates(logs))
    expect(intervals).toEqual([26, 28, 34])
    const ctx = buildCycleContext('2026-04-05', logs)
    expect(ctx.estimatedCycleLength).toBe(28) // median(26,28,34)
    expect(ctx.confidence).toBe('high')
    const stats = cycleHistoryStats(intervals)
    expect(stats).toMatchObject({ count: 3, median: 28, min: 26, max: 34, spread: 8 })
    expect(stats.outlierFlags).toEqual([false, false, false]) // 삭제하지 않고 flag만(여기선 없음)
  })

  it('극단값은 삭제하지 않고 outlier flag만 둔다', () => {
    const stats = cycleHistoryStats([28, 29, 30, 55]) // 55는 이상치
    expect(stats.count).toBe(4) // 삭제 안 함
    expect(stats.outlierFlags[3]).toBe(true)
  })
})

/* 5 */
describe('5. 긴 cycle', () => {
  it('44일 주기도 28로 접지 않고 관찰값으로 예측', () => {
    const logs = [start('2026-01-01'), start('2026-02-14'), start('2026-03-30')] // +44, +44
    const ctx = buildCycleContext('2026-04-10', logs)
    expect(ctx.estimatedCycleLength).toBe(44)
    expect(ctx.nextPeriodDate).toBe('2026-05-13') // 03-30 + 44
  })
})

/* 6 + 8 */
describe('6/8. retrospective 정렬 — 이미 발생한 다음 생리 기준', () => {
  it('D-1 / D-7 를 실제 다음 periodStart 기준으로 역산한다', () => {
    const starts = ['2026-08-20']
    expect(getRelativeDayToNextPeriod('2026-08-19', starts).day).toBe(-1)
    expect(getRelativeDayToNextPeriod('2026-08-13', starts).day).toBe(-7)
    expect(getRelativeDayToNextPeriod('2026-08-20', starts).day).toBe(0) // D0
    expect(getRelativeDayToNextPeriod('2026-08-20', starts).anchorStart).toBe('2026-08-20')
  })

  it('주기 길이와 무관(26일이든 34일이든) 실제 이벤트로 정렬', () => {
    // 주기가 34일이어도 8/19는 다음 실제 생리(8/20)의 D-1
    const starts = ['2026-07-17', '2026-08-20'] // 34일 주기
    expect(getRelativeDayToNextPeriod('2026-08-19', starts).day).toBe(-1)
  })

  it('이후 시작일이 없으면 정렬 불가(null)', () => {
    expect(getRelativeDayToNextPeriod('2026-08-25', ['2026-08-20']).day).toBeNull()
  })
})

/* 7 + 13 */
describe('7/13. prospective는 미래 데이터를 사용하지 않는다 (look-ahead leakage 없음)', () => {
  const base = [start('2026-05-01'), start('2026-05-29')] // 간격 28 → next 06-26
  const withFuture = [...base, start('2026-06-05')] // target 이후의 미래 시작(불규칙)

  it('prospectivePeriodWindow는 target 이후 시작을 무시한다', () => {
    const target = '2026-05-31'
    const w1 = prospectivePeriodWindow(target, base)
    const w2 = prospectivePeriodWindow(target, withFuture)
    expect(w2).toEqual(w1) // 미래 06-05는 계산에 들어가지 않음
    expect(w1.estimatedNextDate).toBe('2026-06-26')
  })

  it('buildCycleContext(오늘)도 미래 periodStart를 몰래 쓰지 않는다', () => {
    const target = '2026-05-31'
    const a = buildCycleContext(target, base)
    const b = buildCycleContext(target, withFuture)
    expect(b.nextPeriodDate).toBe(a.nextPeriodDate)
    expect(b.estimatedCycleLength).toBe(a.estimatedCycleLength)
    expect(b.isPremenstrualWindow).toBe(a.isPremenstrualWindow)
    // 미래 시작을 데이터로 넣었다면 estimate가 바뀌었을 것 — 바뀌지 않아야 함
    expect(b.estimatedCycleLength).toBe(28)
  })
})

/* 10 */
describe('10. confidence 매핑', () => {
  it('시작 수 → none/low/medium/high', () => {
    expect(dataConfidence(0)).toBe('none')
    expect(dataConfidence(1)).toBe('low')
    expect(dataConfidence(2)).toBe('medium')
    expect(dataConfidence(4)).toBe('high')
  })
})

/* 11 */
describe('11. spotting / flow', () => {
  it('flow 기록이 있으면 실제 flow로 생리 기간을 잡고 estimated=false', () => {
    const logs: CycleLog[] = [
      makeCycle({ date: '2026-08-01', periodStart: true, flowLevel: 'normal' }),
      makeCycle({ date: '2026-08-02', flowLevel: 'normal' }),
      makeCycle({ date: '2026-08-03', flowLevel: 'light' }),
    ]
    const span = periodDuration('2026-08-01', logs, '2026-08-10')
    expect(span.endDate).toBe('2026-08-03')
    expect(span.days).toBe(3)
    expect(span.estimated).toBe(false) // 사실 기반
    // 8/03은 생리, 8/05는 아님
    expect(buildCycleContext('2026-08-03', logs).isPeriod).toBe(true)
    expect(buildCycleContext('2026-08-05', logs).isPeriod).toBe(false)
  })

  it('flow/종료가 없으면 6일 추정으로 표시하되 estimated=true로 구분', () => {
    const logs = [start('2026-08-01')]
    const span = periodDuration('2026-08-01', logs, '2026-08-10')
    expect(span.days).toBe(6)
    expect(span.estimated).toBe(true)
    const ctx = buildCycleContext('2026-08-03', logs)
    expect(ctx.isPeriod).toBe(true)
    expect(ctx.periodDayIsEstimated).toBe(true)
  })

  it('spotting 기록이 있어도 크래시 없이 처리된다', () => {
    const logs: CycleLog[] = [makeCycle({ date: '2026-08-01', periodStart: true, spotting: true })]
    expect(() => buildCycleContext('2026-08-02', logs)).not.toThrow()
  })
})

/* 12 */
describe('12. legacy settings.averageCycleLength 보존 + 미사용', () => {
  it('settings 객체는 그대로 남고, 엔진은 예측 근거로 쓰지 않는다', () => {
    const settings = { cycleEnabled: true, averageCycleLength: 28 } as UserSettings
    const logs = [start('2026-08-01')]
    const ctx = buildCycleContext('2026-08-15', logs, settings)
    // 데이터 삭제/변형 없음
    expect(settings.averageCycleLength).toBe(28)
    // 28을 근거로 예측하지 않음
    expect(ctx.estimatedCycleLength).toBeUndefined()
  })
})

/* V2 정책 변경 기록: 과거엔 1-start에서 28 fallback으로 PMS를 단정할 수 있었음 */
describe('V2 정책 변경: 1-start에서 28일 fallback PMS 단정 제거', () => {
  it('시작 1개(간격 없음)일 때 어떤 targetDate에서도 PMS 구간을 확정하지 않는다', () => {
    const logs = [start('2026-08-01')]
    for (const d of ['2026-08-20', '2026-08-27', '2026-08-28', '2026-08-29']) {
      expect(buildCycleContext(d, logs).isPremenstrualWindow).toBe(false)
    }
  })
  it('데이터 부족(PMS 추정)만으로 큰 cycleLoad가 들어가지 않는다', () => {
    const ctx = buildCycleContext('2026-08-28', [start('2026-08-01')])
    // PMS 확정 안 됨 → 부하는 baseline 수준
    expect(calcCycleLoad(ctx)).toBeLessThanOrEqual(20)
  })
})
