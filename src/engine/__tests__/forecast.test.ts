import { describe, expect, it } from 'vitest'
import { forecastRhythmDay, forecastConfidence, type ForecastInput } from '../forecast'
import type { CycleContext } from '../cycle'
import type { DailyScore } from '../../data/models'
import { addDaysISO } from '../correlation'

function score(date: string, p: Partial<DailyScore> = {}): DailyScore {
  return {
    date,
    emotionalLoad: 40,
    appetiteLoad: 40,
    sleepLoad: 40,
    bodyLoad: 40,
    cycleLoad: 20,
    eventLoad: 40,
    rhythmLoad: 40,
    recoveryScore: 30,
    dayType: 'stable',
    createdAt: '',
    updatedAt: '',
    ...p,
  }
}

const NONE_CYCLE: CycleContext = { isPeriod: false, isPremenstrualWindow: false, isOvulationWindow: false, confidence: 'high' }

function recent(n: number, p: Partial<DailyScore> = {}): DailyScore[] {
  const out: DailyScore[] = []
  let d = '2026-06-01'
  for (let i = 0; i < n; i++) {
    out.push(score(d, p))
    d = addDaysISO(d, 1)
  }
  return out
}

function input(over: Partial<ForecastInput> = {}): ForecastInput {
  return { targetDate: '2026-06-20', dayOffset: 1, recent: recent(10), cycle: NONE_CYCLE, cycleLoad: 20, ...over }
}

describe('forecastRhythmDay', () => {
  it('최근 감정 흐름이 높으면 예보 감정 부하도 높다', () => {
    const low = forecastRhythmDay(input({ recent: recent(10, { emotionalLoad: 10 }) }))
    const high = forecastRhythmDay(input({ recent: recent(10, { emotionalLoad: 90 }) }))
    expect(high.predictedScores.emotionalLoad).toBeGreaterThan(low.predictedScores.emotionalLoad)
  })

  it('targetDate cycleLoad가 감정/식욕/몸 부하에 반영된다', () => {
    const noCyc = forecastRhythmDay(input({ cycleLoad: 0 }))
    const hiCyc = forecastRhythmDay(input({ cycleLoad: 90 }))
    expect(hiCyc.predictedScores.appetiteLoad).toBeGreaterThan(noCyc.predictedScores.appetiteLoad)
    expect(hiCyc.predictedScores.bodyLoad).toBeGreaterThan(noCyc.predictedScores.bodyLoad)
    expect(hiCyc.predictedScores.emotionalLoad).toBeGreaterThan(noCyc.predictedScores.emotionalLoad)
  })

  it('수면 부하는 최근 수면 흐름 중심으로 계산된다', () => {
    const r = forecastRhythmDay(input({ recent: recent(10, { sleepLoad: 80, eventLoad: 0 }) }))
    expect(r.predictedScores.sleepLoad).toBeGreaterThan(60) // 0.55+0.30 가중
  })

  it('eventLoad는 미래를 알 수 없으므로 낮게 반영된다', () => {
    const r = forecastRhythmDay(input({ recent: recent(10, { eventLoad: 80 }) }))
    expect(r.predictedScores.eventLoad).toBeLessThan(40) // 0.3 가중 → 24 근처
  })

  it('모든 점수가 0~100 clamp된다', () => {
    const r = forecastRhythmDay(input({ recent: recent(10, { emotionalLoad: 100, appetiteLoad: 100, sleepLoad: 100, bodyLoad: 100 }), cycleLoad: 100 }))
    for (const v of Object.values(r.predictedScores)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('predictedDayType은 classifyDay를 재사용한다 (감정 높으면 emotion_sensitive)', () => {
    const r = forecastRhythmDay(input({ recent: recent(10, { emotionalLoad: 95 }), cycleLoad: 30 }))
    expect(r.predictedDayType).toBe('emotion_sensitive')
  })

  it('note에 확정/단정 표현이 없다', () => {
    const r = forecastRhythmDay(input())
    for (const w of ['확실', '반드시', '예측됩니다', '입니다 확정']) expect(r.note.includes(w)).toBe(false)
  })
})

describe('forecastConfidence', () => {
  it('기록일수가 적으면 confidence가 낮다', () => {
    expect(forecastConfidence(2, NONE_CYCLE, 1)).toBeLessThan(forecastConfidence(20, NONE_CYCLE, 1))
    expect(forecastConfidence(2, NONE_CYCLE, 1)).toBeLessThanOrEqual(20)
  })

  it('주기 confidence가 낮으면 조금 깎인다', () => {
    const low: CycleContext = { ...NONE_CYCLE, confidence: 'low' }
    expect(forecastConfidence(20, low, 1)).toBeLessThan(forecastConfidence(20, NONE_CYCLE, 1))
  })
})
