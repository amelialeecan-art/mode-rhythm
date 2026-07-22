import { describe, expect, it } from 'vitest'
import { buildPersonalRhythm, type FlowState } from '../personalRhythm'
import type { FlowSegment } from '../flowSegments'
import type { FlowDomain } from '../recentFlow'
import { addDaysISO } from '../correlation'

const D: FlowDomain[] = ['sleep', 'body']
interface Spec { status: FlowState; days: number; leading?: FlowDomain[]; gap?: number }

function segsFrom(start: string, specs: Spec[]): FlowSegment[] {
  let cur = start
  const out: FlowSegment[] = []
  for (const sp of specs) {
    if (sp.gap) cur = addDaysISO(cur, sp.gap)
    const startDate = cur
    const endDate = addDaysISO(cur, sp.days - 1)
    cur = addDaysISO(endDate, 1)
    out.push({ startDate, endDate, lengthDays: sp.days, status: sp.status, leading: sp.leading ?? [], changing: sp.leading ?? [], holding: [], validDays: sp.days })
  }
  return out
}
/** S→D→R n회, 각 상태 len일. */
function cycles(n: number, len = 9, start = '2026-01-05'): FlowSegment[] {
  const specs: Spec[] = []
  for (let i = 0; i < n; i++) {
    specs.push({ status: 'stable', days: len }, { status: 'depleting', days: len, leading: D }, { status: 'recovering', days: len })
  }
  return segsFrom(start, specs)
}

describe('buildPersonalRhythm', () => {
  it('stable→depleting→recovering 3회↑ 반복 → 결과 생성', () => {
    const r = buildPersonalRhythm(cycles(4))
    expect(r).not.toBeNull()
    expect(r!.sequence).toEqual(['stable', 'depleting', 'recovering'])
    expect(r!.occurrenceCount).toBeGreaterThanOrEqual(3)
    expect(r!.commonLeadingDomains).toEqual(expect.arrayContaining(['sleep', 'body']))
    expect(r!.cycleRelated).toBe(false)
  })

  it('달을 넘어가는 회차도 하나로 본다', () => {
    const r = buildPersonalRhythm(cycles(4, 11, '2026-01-20')) // 33일 주기 → 월 경계 넘음
    expect(r).not.toBeNull()
    expect(r!.sequence).toEqual(['stable', 'depleting', 'recovering'])
  })

  it('회차별 기간이 조금 달라도 범위로 계산', () => {
    const r = buildPersonalRhythm(
      segsFrom('2026-01-05', [
        { status: 'stable', days: 8 }, { status: 'depleting', days: 8, leading: D }, { status: 'recovering', days: 8 }, // 24
        { status: 'stable', days: 10 }, { status: 'depleting', days: 7, leading: D }, { status: 'recovering', days: 9 }, // 26
        { status: 'stable', days: 7 }, { status: 'depleting', days: 8, leading: D }, { status: 'recovering', days: 7 }, // 22
        { status: 'stable', days: 9 }, { status: 'depleting', days: 8, leading: D }, { status: 'recovering', days: 8 }, // 25
      ]),
    )
    expect(r).not.toBeNull()
    expect(r!.typicalLengthMin).toBe(22)
    expect(r!.typicalLengthMax).toBe(26)
    expect(r!.occurrenceCount).toBe(4)
  })

  it('순서가 제각각이면 결과 없음', () => {
    const jumble: Spec[] = [
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9 }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'recovering', days: 9 }, { status: 'depleting', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9 }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 },
    ]
    expect(buildPersonalRhythm(segsFrom('2026-01-05', jumble))).toBeNull()
  })

  it('점수 등락(mixed 노이즈)만 있고 상태 순서 반복이 없으면 결과 없음', () => {
    const specs: Spec[] = []
    for (let i = 0; i < 6; i++) specs.push({ status: 'stable', days: 9 }, { status: 'mixed', days: 6 })
    expect(buildPersonalRhythm(segsFrom('2026-01-05', specs))).toBeNull()
  })

  it('주말/요일 반복(7일 주기·같은 요일)은 제외', () => {
    // 각 상태 합 7일 = 7일 주기 → 매 회차 시작이 같은 요일 → 제외
    const specs: Spec[] = []
    for (let i = 0; i < 14; i++) specs.push({ status: 'stable', days: 3 }, { status: 'depleting', days: 2, leading: D }, { status: 'recovering', days: 2 })
    expect(buildPersonalRhythm(segsFrom('2026-01-05', specs))).toBeNull()
  })

  it('생리 시작일에 맞춰 반복되면 cycleRelated=true', () => {
    const segs = cycles(4)
    const starts = [0, 27, 54, 81].map((d) => addDaysISO('2026-01-05', d)) // 각 회차 시작(27일 주기)
    const r = buildPersonalRhythm(segs, { periodStarts: starts })
    expect(r).not.toBeNull()
    expect(r!.cycleRelated).toBe(true)
  })

  it('단발성 사건 흐름(지나치게 긴 회차)은 반복 회차로 쓰지 않는다', () => {
    const r = buildPersonalRhythm(
      segsFrom('2026-01-05', [
        { status: 'stable', days: 8 }, { status: 'depleting', days: 8, leading: D }, { status: 'recovering', days: 8 },
        { status: 'stable', days: 8 }, { status: 'depleting', days: 8, leading: D }, { status: 'recovering', days: 8 },
        { status: 'stable', days: 8 }, { status: 'depleting', days: 40, leading: D }, { status: 'recovering', days: 8 }, // 단발성 큰 흐름
      ]),
    )
    expect(r).toBeNull() // 정상 2회만 남아 3회 미달
  })

  it('기록이 부족하면 결과 없음', () => {
    expect(buildPersonalRhythm(cycles(2))).toBeNull() // 6구간·48일
  })

  it('현재 흐름이 반복 구조와 이어질 때만 currentMatch', () => {
    // 3회 반복 + 진행 중 stable→depleting
    const inProgress = segsFrom('2026-01-05', [
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 5, leading: D },
    ])
    const r = buildPersonalRhythm(inProgress)!
    expect(r.occurrenceCount).toBe(3)
    expect(r.currentMatch).not.toBeNull()
    expect(r.currentMatch!.matchedStates).toEqual(['stable', 'depleting'])
    expect(r.currentMatch!.currentState).toBe('depleting')

    // 3회 반복 + 꼬리가 순서와 어긋남(S→mixed→recovering) → currentMatch 없음
    const offPattern = segsFrom('2026-01-05', [
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'depleting', days: 9, leading: D }, { status: 'recovering', days: 9 },
      { status: 'stable', days: 9 }, { status: 'mixed', days: 6 }, { status: 'recovering', days: 9 },
    ])
    const r2 = buildPersonalRhythm(offPattern)!
    expect(r2.occurrenceCount).toBe(3)
    expect(r2.currentMatch).toBeNull()
  })
})
