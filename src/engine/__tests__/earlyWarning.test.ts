import { describe, expect, it } from 'vitest'
import {
  warningSignalsAt,
  backtestEarlyWarning,
  MIN_REPORTED_EPISODES,
  type WarningEvent,
  type BacktestInput,
} from '../earlyWarning'

const ev = (date: string, factorGroup: string, extra: Partial<WarningEvent> = {}): WarningEvent => ({
  date,
  factorGroup,
  ...extra,
})

/* =====================================================================
   컷오프 & 누수 방지 (warningSignalsAt)
   ===================================================================== */
describe('warningSignalsAt — 컷오프/누수', () => {
  const S = '2026-06-10'

  it('전날 밤: lag≥1만. 당일(lag0)은 지난밤 수면이라도 제외', () => {
    const events = [
      ev('2026-06-09', 'workload'), // lag1 → 포함
      ev('2026-06-10', 'sleep_deficit', { nightlySleep: true }), // lag0 nightly → 전날 밤엔 제외
    ]
    expect(warningSignalsAt(S, events, 'prev_night')).toEqual(['workload'])
  })

  it('당일 아침: lag0은 지난밤 수면만 포함(비수면 lag0은 제외)', () => {
    const events = [
      ev('2026-06-09', 'workload'), // lag1
      ev('2026-06-10', 'sleep_deficit', { nightlySleep: true }), // lag0 nightly → 아침엔 포함
      ev('2026-06-10', 'interpersonal_stress'), // lag0 비수면(오후·저녁) → 제외
    ]
    expect(warningSignalsAt(S, events, 'morning')).toEqual(['sleep_deficit', 'workload'])
  })

  it('after / result_side / 미래 / 창 밖은 제외', () => {
    const events = [
      ev('2026-06-09', 'interpersonal_stress', { relationToShift: 'after' }), // after
      ev('2026-06-09', 'short_video'), // result_side 모드
      ev('2026-06-12', 'workload'), // 미래(lag<0)
      ev('2026-06-08', 'caffeine_timing'), // lag2, 창 0..1 → 밖
    ]
    expect(warningSignalsAt(S, events, 'prev_night')).toEqual([])
    expect(warningSignalsAt(S, events, 'morning')).toEqual([])
  })
})

/* =====================================================================
   백테스트 (backtestEarlyWarning)
   ===================================================================== */
function baseInput(): BacktestInput {
  return {
    // reported 4 + estimated 1
    episodeStarts: [
      { date: '2026-06-05', confidence: 'reported' },
      { date: '2026-06-10', confidence: 'reported' },
      { date: '2026-06-15', confidence: 'reported' },
      { date: '2026-06-20', confidence: 'reported' },
      { date: '2026-06-25', confidence: 'estimated' }, // 제외 대상
    ],
    episodeSpanDates: ['2026-06-05', '2026-06-10', '2026-06-15', '2026-06-20', '2026-06-25'],
    outcomeDays: ['2026-06-05', '2026-06-10', '2026-06-15', '2026-06-20', '2026-06-07', '2026-06-30'],
    events: [
      ev('2026-06-04', 'workload'), // D1 전날 → hit
      ev('2026-06-09', 'workload'), // D2 전날 → hit
      ev('2026-06-14', 'workload'), // D3 전날 → hit
      // D4(06-20) 전날 신호 없음 → miss
      ev('2026-06-06', 'workload'), // N1(06-07) 전날 → false alarm
      // N2(06-30) 근처 사건 없음 → correct rejection
    ],
  }
}

describe('backtestEarlyWarning — 혼동행렬/표본', () => {
  it('episode start만 양성, estimated 제외, 4칸 계산', () => {
    const r = backtestEarlyWarning(baseInput())
    expect(r.reportedEpisodeCount).toBe(4) // start 기준, estimated 제외
    expect(r.estimatedExcludedCount).toBe(1)
    expect(r.prevNight.positives).toBe(4)
    expect(r.prevNight.negatives).toBe(2) // 06-07, 06-12 (span 제외)
    expect(r.prevNight.hit).toBe(3)
    expect(r.prevNight.miss).toBe(1)
    expect(r.prevNight.falseAlarm).toBe(1)
    expect(r.prevNight.correctRejection).toBe(1)
    expect(r.eligible).toBe(true)
  })

  it('연속 무너짐이어도 start 하나만 양성으로 센다', () => {
    const r = backtestEarlyWarning({
      episodeStarts: [{ date: '2026-06-10', confidence: 'reported' }],
      episodeSpanDates: ['2026-06-10', '2026-06-11', '2026-06-12'], // 3일 연속
      outcomeDays: ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-15'],
      events: [],
    })
    expect(r.prevNight.positives).toBe(1) // 3일이 아니라 1
    expect(r.prevNight.negatives).toBe(1) // 06-15만(연속일은 span 제외)
  })

  it('미래 극단값을 추가해도 과거 결과 불변(§12)', () => {
    const base = backtestEarlyWarning(baseInput())
    const leaked = baseInput()
    // 각 양성일 당일 오후/저녁 + 무너진 뒤 + 먼 미래 극단값 주입
    leaked.events.push(
      ev('2026-06-10', 'conflict'), // 당일 lag0 비수면
      ev('2026-06-10', 'short_video', { relationToShift: 'after' }), // 무너진 뒤
      ev('2026-06-20', 'workload', { relationToShift: 'after' }), // D4 당일 after
      ev('2027-01-01', 'workload'), // 먼 미래
    )
    const after = backtestEarlyWarning(leaked)
    expect(after.prevNight).toEqual(base.prevNight)
    expect(after.morning).toEqual(base.morning)
    expect(after.reportedEpisodeCount).toBe(base.reportedEpisodeCount)
  })

  it('표본 부족이면 eligible=false + neededMore', () => {
    const r = backtestEarlyWarning({
      episodeStarts: [
        { date: '2026-06-10', confidence: 'reported' },
        { date: '2026-06-20', confidence: 'reported' },
      ],
      episodeSpanDates: ['2026-06-10', '2026-06-20'],
      outcomeDays: ['2026-06-10', '2026-06-20', '2026-06-15'],
      events: [],
    })
    expect(r.eligible).toBe(false)
    expect(r.reportedEpisodeCount).toBe(2)
    expect(r.neededMore).toBe(MIN_REPORTED_EPISODES - 2)
  })
})
