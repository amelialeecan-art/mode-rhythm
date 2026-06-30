import { describe, expect, it } from 'vitest'
import { accompliceEffect, detectUnexplained, type UnexplainedDayInput } from '../patterns'
import { addDaysISO, type AnalysisDataset, type AnalysisMetric } from '../correlation'

type DaySpec = { date: string; factors?: string[]; m?: Partial<Record<AnalysisMetric, number>> }

function makeDs(days: DaySpec[]): AnalysisDataset {
  const scoreByDate = new Map<string, Record<AnalysisMetric, number>>()
  const factorByDate = new Map<string, Set<string>>()
  for (const d of days) {
    scoreByDate.set(d.date, { emotional: 0, appetite: 0, sleep: 0, body: 0, cycle: 0, event: 0, rhythm: 0, ...d.m })
    factorByDate.set(d.date, new Set(d.factors ?? []))
  }
  return { resultDates: days.map((d) => d.date), scoreByDate, factorByDate, endDate: days[days.length - 1].date }
}

function seq(start: string, n: number): string[] {
  const out: string[] = []
  let d = start
  for (let i = 0; i < n; i++) {
    out.push(d)
    d = addDaysISO(d, 1)
  }
  return out
}

/** combo: A&B 4일(metric 80), A만 3일(50), B만 3일(50), 빈 2일. */
function comboDataset(comboMetric: number, comboDays: number): AnalysisDataset {
  const dates = seq('2026-06-01', comboDays + 8)
  const days: DaySpec[] = dates.map((date, i) => {
    if (i < comboDays) return { date, factors: ['A', 'B'], m: { appetite: comboMetric } }
    if (i < comboDays + 3) return { date, factors: ['A'], m: { appetite: 50 } }
    if (i < comboDays + 6) return { date, factors: ['B'], m: { appetite: 50 } }
    return { date, factors: [], m: { appetite: 50 } }
  })
  return makeDs(days)
}

describe('accompliceEffect', () => {
  it('A&B 함께일 때 comboEffect를 계산한다', () => {
    const r = accompliceEffect(comboDataset(80, 4), 'A', 'B', 'A', 'B', 'appetite', 50)
    expect(r).not.toBeNull()
    expect(r!.comboEffect).toBe(30) // 80 - max(50,50,50)
    expect(r!.supportCount).toBe(4)
  })

  it('combo 표본이 부족하면 null', () => {
    expect(accompliceEffect(comboDataset(80, 2), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
  })

  it('comboEffect가 작으면 null', () => {
    expect(accompliceEffect(comboDataset(55, 4), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
  })
})

describe('detectUnexplained', () => {
  const row = (over: Partial<UnexplainedDayInput>): UnexplainedDayInput => ({
    date: '2026-06-10',
    rhythmLoad: 70,
    eventLoad: 10,
    cycleLoad: 10,
    sleepLoad: 20,
    bodyLoad: 20,
    dayType: 'unknown_cause',
    ...over,
  })

  it('고부하인데 설명력이 낮으면 미제로 잡힌다', () => {
    expect(detectUnexplained([row({})])).toHaveLength(1)
  })

  it('eventLoad/cycleLoad가 높은 날은 제외된다', () => {
    expect(detectUnexplained([row({ eventLoad: 40 })])).toHaveLength(0)
    expect(detectUnexplained([row({ cycleLoad: 40 })])).toHaveLength(0)
  })

  it('rhythmLoad가 낮으면 제외된다', () => {
    expect(detectUnexplained([row({ rhythmLoad: 40 })])).toHaveLength(0)
  })
})
