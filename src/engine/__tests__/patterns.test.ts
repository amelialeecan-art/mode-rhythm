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

/** combo: A&B comboDays일(metric), A만 aOnly일(50), B만 bOnly일(50), 빈 2일. */
function comboDataset(comboMetric: number, comboDays: number, aOnly = 4, bOnly = 4): AnalysisDataset {
  const dates = seq('2026-06-01', comboDays + aOnly + bOnly + 2)
  const days: DaySpec[] = dates.map((date, i) => {
    if (i < comboDays) return { date, factors: ['A', 'B'], m: { appetite: comboMetric } }
    if (i < comboDays + aOnly) return { date, factors: ['A'], m: { appetite: 50 } }
    if (i < comboDays + aOnly + bOnly) return { date, factors: ['B'], m: { appetite: 50 } }
    return { date, factors: [], m: { appetite: 50 } }
  })
  return makeDs(days)
}

describe('accompliceEffect', () => {
  it('A&B 함께일 때 comboEffect를 계산한다 (support 5, A만/B만 4↑)', () => {
    const r = accompliceEffect(comboDataset(80, 5), 'A', 'B', 'A', 'B', 'appetite', 50)
    expect(r).not.toBeNull()
    expect(r!.comboEffect).toBe(30) // 80 - max(50,50,50)
    expect(r!.supportCount).toBe(5)
    expect(r!.factorAOnlyCount).toBe(4)
    expect(r!.factorBOnlyCount).toBe(4)
    expect(r!.comparisonCount).toBe(8)
  })

  it('combo support가 4면 부족(null), 5면 가능', () => {
    expect(accompliceEffect(comboDataset(80, 4), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
    expect(accompliceEffect(comboDataset(80, 5), 'A', 'B', 'A', 'B', 'appetite', 50)).not.toBeNull()
  })

  it('A만 표본이 부족하면(4 미만) baseline 대체 없이 null', () => {
    expect(accompliceEffect(comboDataset(80, 5, 3, 4), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
  })

  it('B만 표본이 부족하면(4 미만) baseline 대체 없이 null', () => {
    expect(accompliceEffect(comboDataset(80, 5, 4, 3), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
  })

  it('comboEffect가 작으면 null', () => {
    expect(accompliceEffect(comboDataset(55, 5), 'A', 'B', 'A', 'B', 'appetite', 50)).toBeNull()
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
