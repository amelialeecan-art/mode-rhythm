import { describe, expect, it } from 'vitest'
import { buildFlowDrivers } from '../flowDrivers'
import type { FlowSegment } from '../flowSegments'
import type { FlowDomain, FlowStatus } from '../recentFlow'
import type { ExposureRun } from '../exposureRuns'

function seg(status: FlowStatus, startDate: string, leading: FlowDomain[] = []): FlowSegment {
  return { startDate, endDate: startDate, lengthDays: 1, status, leading, changing: leading, holding: [], validDays: 1 }
}
function run(key: string, factorGroup: string, dates: string[]): ExposureRun {
  return { key, factorGroup, startDate: dates[0], endDate: dates[dates.length - 1], days: dates.length, dates }
}
const WORK = '업무 압박'
// 소모 시작(서로 다른 요일 — 8일 간격) + 안정/회복 대응 시점
const DEPLETING = [
  seg('depleting', '2026-07-06', ['sleep', 'body']),
  seg('depleting', '2026-07-14', ['sleep', 'body']),
  seg('depleting', '2026-07-22', ['sleep', 'body']),
]
const REFS = [seg('stable', '2026-08-03'), seg('stable', '2026-08-11'), seg('recovering', '2026-08-19')]
const labels = new Map([['catalog:work', WORK]])

describe('buildFlowDrivers', () => {
  it('같은 사건이 3회↑ 소모 시작 전에 반복되면 driver 생성', () => {
    const runs = [
      run('catalog:work', 'deadline_pressure', ['2026-07-04', '2026-07-05']),
      run('catalog:work', 'deadline_pressure', ['2026-07-12', '2026-07-13']),
      run('catalog:work', 'deadline_pressure', ['2026-07-20', '2026-07-21']),
    ]
    const drivers = buildFlowDrivers([...DEPLETING, ...REFS], runs, labels)
    expect(drivers.length).toBe(1)
    expect(drivers[0].eventKey).toBe('catalog:work')
    expect(drivers[0].label).toBe(WORK)
    expect(drivers[0].onsetCount).toBe(3)
    expect(drivers[0].comparisonCount).toBe(0)
    expect(drivers[0].cumulative).toBe(true)
    expect(drivers[0].typicalLeadDays).toBe(2)
    expect(drivers[0].affectedDomains).toEqual(expect.arrayContaining(['sleep', 'body']))
  })

  it('흐름 시작 이후에 생긴 사건은 제외', () => {
    const runs = [
      run('catalog:work', 'deadline_pressure', ['2026-07-07', '2026-07-08']),
      run('catalog:work', 'deadline_pressure', ['2026-07-15', '2026-07-16']),
      run('catalog:work', 'deadline_pressure', ['2026-07-23', '2026-07-24']),
    ]
    expect(buildFlowDrivers([...DEPLETING, ...REFS], runs, labels)).toEqual([])
  })

  it('한 번뿐인 큰 사건은 제외', () => {
    const runs = [run('catalog:crisis', 'major_event', ['2026-07-04', '2026-07-05'])]
    expect(buildFlowDrivers([...DEPLETING, ...REFS], runs)).toEqual([])
  })

  it('안정·회복 구간에도 흔한 사건은 제외', () => {
    const runs = [
      run('catalog:work', 'deadline_pressure', ['2026-07-04', '2026-07-05']),
      run('catalog:work', 'deadline_pressure', ['2026-07-12', '2026-07-13']),
      run('catalog:work', 'deadline_pressure', ['2026-07-20', '2026-07-21']),
      run('catalog:work', 'deadline_pressure', ['2026-08-01', '2026-08-02']), // 안정 앞
      run('catalog:work', 'deadline_pressure', ['2026-08-09', '2026-08-10']),
      run('catalog:work', 'deadline_pressure', ['2026-08-17', '2026-08-18']),
    ]
    expect(buildFlowDrivers([...DEPLETING, ...REFS], runs, labels)).toEqual([])
  })

  it('누적 run의 days를 반영한다 (하루 노출이면 cumulative=false)', () => {
    const single = [
      run('catalog:work', 'deadline_pressure', ['2026-07-05']),
      run('catalog:work', 'deadline_pressure', ['2026-07-13']),
      run('catalog:work', 'deadline_pressure', ['2026-07-21']),
    ]
    const d = buildFlowDrivers([...DEPLETING, ...REFS], single, labels)
    expect(d.length).toBe(1)
    expect(d[0].cumulative).toBe(false)
    expect(d[0].typicalLeadDays).toBe(1)
  })

  it('같은 factorGroup이라도 eventKey가 다르면 별도 driver', () => {
    const runs = [
      run('catalog:work_pressure', 'deadline_pressure', ['2026-07-04', '2026-07-05']),
      run('catalog:work_pressure', 'deadline_pressure', ['2026-07-12', '2026-07-13']),
      run('catalog:work_pressure', 'deadline_pressure', ['2026-07-20', '2026-07-21']),
      run('catalog:work_overload', 'deadline_pressure', ['2026-07-03']),
      run('catalog:work_overload', 'deadline_pressure', ['2026-07-11']),
      run('catalog:work_overload', 'deadline_pressure', ['2026-07-19']),
    ]
    const drivers = buildFlowDrivers([...DEPLETING, ...REFS], runs)
    expect(drivers.length).toBe(2)
    expect(new Set(drivers.map((d) => d.eventKey))).toEqual(new Set(['catalog:work_pressure', 'catalog:work_overload']))
    expect(drivers.every((d) => d.factorGroup === 'deadline_pressure')).toBe(true)
  })

  it('요일만 반복되는 가짜 패턴은 제외', () => {
    const sameWeekday = [
      seg('depleting', '2026-07-06', ['sleep', 'body']),
      seg('depleting', '2026-07-13', ['sleep', 'body']),
      seg('depleting', '2026-07-20', ['sleep', 'body']), // 7일 간격 = 같은 요일
    ]
    const runs = [
      run('catalog:work', 'deadline_pressure', ['2026-07-04', '2026-07-05']),
      run('catalog:work', 'deadline_pressure', ['2026-07-11', '2026-07-12']),
      run('catalog:work', 'deadline_pressure', ['2026-07-18', '2026-07-19']),
    ]
    expect(buildFlowDrivers([...sameWeekday, ...REFS], runs, labels)).toEqual([])
  })

  it('반복된 두 사건이 같은 소모 시작 앞에서 겹치면 overlapEventKeys에 담긴다', () => {
    const runs = [
      run('catalog:sleep_late', 'late_sleep', ['2026-07-05']),
      run('catalog:sleep_late', 'late_sleep', ['2026-07-13']),
      run('catalog:sleep_late', 'late_sleep', ['2026-07-21']),
      run('catalog:many_plans', 'social_load', ['2026-07-05']),
      run('catalog:many_plans', 'social_load', ['2026-07-13']),
      run('catalog:many_plans', 'social_load', ['2026-07-21']),
    ]
    const drivers = buildFlowDrivers([...DEPLETING, ...REFS], runs)
    const late = drivers.find((d) => d.eventKey === 'catalog:sleep_late')!
    expect(late.overlapEventKeys).toContain('catalog:many_plans')
  })

  it('근거가 부족하면 결과 없음', () => {
    const runs = [
      run('catalog:work', 'deadline_pressure', ['2026-07-04', '2026-07-05']),
      run('catalog:work', 'deadline_pressure', ['2026-07-12', '2026-07-13']),
    ]
    // 소모 앞 반복 2회(<3)
    expect(buildFlowDrivers([...DEPLETING, ...REFS], runs, labels)).toEqual([])
    // 소모 구간 자체가 2개(<3)
    expect(buildFlowDrivers([DEPLETING[0], DEPLETING[1], ...REFS], runs, labels)).toEqual([])
  })
})
