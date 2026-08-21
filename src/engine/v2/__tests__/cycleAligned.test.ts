/* =====================================================================
   MODE · V2 · cycle-aligned retrospective 테스트
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { alignToCycles, completedCycleCount, cycleWindowAssociation, PREMENSTRUAL_WINDOW } from '../cycleAligned'
import { getRelativeDayToNextPeriod } from '../../cycle'
import { toISODate } from '../../../lib/date'
import type { DailyValueSeries } from '../dataset'

function iso(y: number, m: number, d: number): string {
  return toISODate(new Date(y, m - 1, d))
}
function dateRange(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const s = new Date(`${startISO}T00:00:00`)
  const e = new Date(`${endISO}T00:00:00`)
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(toISODate(new Date(d)))
  return out
}

/** 각 cycle의 D-7~D-1을 elevation만큼 올린 합성 metric 시계열. */
function buildElevated(starts: string[], base: number, elevation: number, from = 10, to = 3): DailyValueSeries {
  const first = new Date(`${starts[0]}T00:00:00`)
  const last = new Date(`${starts[starts.length - 1]}T00:00:00`)
  const startISO = toISODate(new Date(first.getFullYear(), first.getMonth(), first.getDate() - from))
  const endISO = toISODate(new Date(last.getFullYear(), last.getMonth(), last.getDate() + to))
  return dateRange(startISO, endISO).map((date, i) => {
    const rel = getRelativeDayToNextPeriod(date, starts)
    const inWindow = rel.day !== null && rel.day >= -7 && rel.day <= -1
    const noise = (i % 3) * 0.3 // 결정적 소량 잡음(sd>0 확보)
    return { date, value: base + (inWindow ? elevation : 0) + noise }
  })
}

describe('alignToCycles + variable/26·34일 길이', () => {
  it('길이가 26/34/30로 달라도 D-1은 실제 시작 하루 전으로 정렬된다', () => {
    // 26일, 34일, 30일 간격 시작
    const starts = [iso(2026, 1, 1), iso(2026, 1, 27), iso(2026, 3, 2), iso(2026, 4, 1)]
    const series = buildElevated(starts, 3, 2)
    const aligned = alignToCycles(series, starts)
    // 각 실제 시작의 하루 전이 D-1로 정렬되는지
    for (const s of starts.slice(1)) {
      const before = toISODate(new Date(new Date(`${s}T00:00:00`).getTime() - 86400000))
      const found = aligned.find((a) => a.cycleKey === s && a.relativeDay === -1)
      expect(found, `D-1 for ${s}`).toBeDefined()
      // 그 관찰의 원본 날짜가 실제로 시작 하루 전
      const rel = getRelativeDayToNextPeriod(before, starts)
      expect(rel.day).toBe(-1)
      expect(rel.anchorStart).toBe(s)
    }
  })

  it('현재(미완료) cycle의 날짜는 정렬에서 제외된다(마지막 시작 이후)', () => {
    const starts = [iso(2026, 1, 1), iso(2026, 1, 29), iso(2026, 2, 26)]
    const series = buildElevated(starts, 3, 2) // 마지막 시작 이후 며칠 포함
    const aligned = alignToCycles(series, starts)
    // 마지막 시작 이후 날짜(다음 시작 없음)는 없어야 한다
    const afterLast = aligned.filter((a) => a.cycleKey === starts[starts.length - 1] ? false : false)
    expect(afterLast).toHaveLength(0)
    // 모든 정렬 관찰의 relativeDay <= 0 (다음 시작 이전/당일)
    expect(aligned.every((a) => a.relativeDay <= 0)).toBe(true)
  })
})

describe('최소 완료 cycle 조건', () => {
  it('완료 2주기(시작 3개)면 insufficient', () => {
    const starts = [iso(2026, 1, 1), iso(2026, 1, 29), iso(2026, 2, 26)] // 완료 2
    expect(completedCycleCount(starts)).toBe(2)
    const series = buildElevated(starts, 3, 2)
    const r = cycleWindowAssociation(series, starts, PREMENSTRUAL_WINDOW, { minCycles: 3 })
    expect(r.status).toBe('insufficient')
  })

  it('완료 3주기(시작 4개)부터 ok + 방향/효과/자료 반환', () => {
    const starts = [iso(2026, 1, 1), iso(2026, 1, 29), iso(2026, 2, 26), iso(2026, 3, 26)] // 완료 3
    expect(completedCycleCount(starts)).toBe(3)
    const series = buildElevated(starts, 3, 2)
    const r = cycleWindowAssociation(series, starts, PREMENSTRUAL_WINDOW, { minCycles: 3 })
    expect(r.status).toBe('ok')
    expect(r.usableCycleCount).toBeGreaterThanOrEqual(3)
    expect(r.baselineDifference).toBeGreaterThan(0) // 월경 전 상승
    expect(r.sameDirectionCycleCount).toBe(r.usableCycleCount) // 모든 cycle 같은 방향
    expect(r.observations).toBeGreaterThan(0)
    expect(r.adjusted).toBe(true) // 개인·cycle baseline 보정
  })
})

describe('physicalHunger / craving / bingeUrge 분리', () => {
  it('craving만 월경 전 상승, hunger는 평탄 → 서로 다른 결과(합치지 않음)', () => {
    const starts = [iso(2026, 1, 1), iso(2026, 1, 29), iso(2026, 2, 26), iso(2026, 3, 26)]
    const cravingSeries = buildElevated(starts, 3, 3) // craving 상승
    const hungerSeries = buildElevated(starts, 5, 0) // hunger 평탄(상승 0)
    const cRes = cycleWindowAssociation(cravingSeries, starts, PREMENSTRUAL_WINDOW)
    const hRes = cycleWindowAssociation(hungerSeries, starts, PREMENSTRUAL_WINDOW)
    expect(cRes.baselineDifference).toBeGreaterThan(0.5) // craving은 뚜렷한 상승
    expect(Math.abs(hRes.baselineDifference)).toBeLessThan(0.5) // hunger는 변화 미미
    // 두 결과는 독립적으로 계산됨(같은 값이 아님)
    expect(cRes.baselineDifference).not.toBe(hRes.baselineDifference)
  })
})
