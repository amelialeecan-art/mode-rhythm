import { describe, expect, it } from 'vitest'
import { getSleepExposureForDate } from '../catalog/lastNightSleep'
import type { DailyLog, EventLog, LastNightSleep } from '../models'

// 어댑터는 lastNightSleep/legacy 사건만 읽는다 → 최소 캐스팅으로 구성.
const logWith = (ln?: LastNightSleep): DailyLog => ({ lastNightSleep: ln } as unknown as DailyLog)
const ev = (eventCode: string, mappedFactorGroup: string): EventLog =>
  ({ eventCode, mappedFactorGroup } as unknown as EventLog)

describe('getSleepExposureForDate (단일 출처 수면 노출)', () => {
  it('legacy 수면 사건만 있으면 그대로 변환한다', () => {
    const r = getSleepExposureForDate(logWith(undefined), [ev('sleep_late', 'sleep_schedule')])
    expect(r.source).toBe('legacy')
    expect(r.factorGroups).toEqual(['sleep_schedule'])
  })

  it('lastNightSleep가 있으면 그것을 canonical로 쓴다', () => {
    const r = getSleepExposureForDate(logWith({ hours: 5, issues: ['sleep_waking'] }), [])
    expect(r.source).toBe('lastNight')
    expect(new Set(r.factorGroups)).toEqual(new Set(['sleep_quality', 'sleep_deficit'])) // hours<6 → deficit
  })

  it('둘 다 있어도 lastNightSleep만 사용한다 (이중 노출 없음)', () => {
    const r = getSleepExposureForDate(
      logWith({ issues: ['sleep_waking'] }), // lastNight: 수면의 질
      [ev('sleep_allnight', 'sleep_deficit')], // legacy: 수면 부족 — 무시돼야 함
    )
    expect(r.source).toBe('lastNight')
    expect(r.factorGroups).toEqual(['sleep_quality'])
    expect(r.factorGroups).not.toContain('sleep_deficit')
  })

  it('수면 정보가 없으면 none', () => {
    expect(getSleepExposureForDate(logWith(undefined), [])).toEqual({ factorGroups: [], source: 'none' })
    // 빈 lastNightSleep(내용 없음)도 none → legacy로 폴백
    expect(getSleepExposureForDate(logWith({ issues: [] }), []).source).toBe('none')
  })

  it('낮잠(sleep_nap)은 지난밤 수면 노출에 포함하지 않는다', () => {
    const r = getSleepExposureForDate(logWith(undefined), [ev('sleep_nap', 'sleep_schedule')])
    expect(r.source).toBe('none')
    expect(r.factorGroups).toEqual([])
  })
})
