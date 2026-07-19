import { describe, expect, it } from 'vitest'
import { buildEventResponse, dedupeExposures, MIN_EXPOSURES } from '../eventResponse'
import { addDaysISO } from '../correlation'
import type { ISODate } from '../../data/models'

describe('dedupeExposures — 연속 사건 하나로 묶기', () => {
  it('달력상 연속일은 시작일 하나로', () => {
    expect(dedupeExposures(['2026-06-07', '2026-06-05', '2026-06-06', '2026-06-20'])).toEqual([
      '2026-06-05',
      '2026-06-20',
    ])
  })
  it('중복 날짜 제거', () => {
    expect(dedupeExposures(['2026-06-10', '2026-06-10', '2026-06-14'])).toEqual(['2026-06-10', '2026-06-14'])
  })
})

/** exposure별 상대날 값 세팅 헬퍼. */
function makeMap(exposures: ISODate[], valueAt: (rel: number) => number | undefined): Map<ISODate, number> {
  const m = new Map<ISODate, number>()
  for (const e of exposures) {
    for (let rel = -3; rel <= 3; rel++) {
      const v = valueAt(rel)
      if (v !== undefined) m.set(addDaysISO(e, rel), v)
    }
  }
  return m
}

describe('buildEventResponse — 0일 정렬 평균', () => {
  const EX = ['2026-06-05', '2026-06-15', '2026-06-25']

  it('상대날별 평균과 표본 수, 기준선', () => {
    const map = makeMap(EX, (rel) => (rel >= 1 ? 70 : 40))
    const c = buildEventResponse([...EX], map)
    expect(c.exposures).toBe(3)
    const at = (rel: number) => c.points.find((p) => p.rel === rel)!
    expect(at(-1).mean).toBe(40)
    expect(at(-1).n).toBe(3)
    expect(at(1).mean).toBe(70)
    expect(at(2).mean).toBe(70)
    // baseline = 전체 기록 평균 (rel<1 은 40 12개, rel>=1 은 70 9개)
    expect(c.baseline).toBe(Math.round((40 * 12 + 70 * 9) / 21))
    expect(c.eligible).toBe(true)
  })

  it('결측일은 0으로 세지 않음 — 표본 수만 줄고 평균은 존재값만', () => {
    const map = makeMap(EX, () => 50)
    // 한 노출의 +2일 기록 삭제
    map.delete(addDaysISO('2026-06-15', 2))
    const c = buildEventResponse([...EX], map)
    const p2 = c.points.find((p) => p.rel === 2)!
    expect(p2.n).toBe(2) // 3 → 2
    expect(p2.mean).toBe(50) // 0으로 희석되지 않음
  })

  it('연속 사건은 중복 노출로 세지 않음', () => {
    const seq = ['2026-06-05', '2026-06-06', '2026-06-15', '2026-06-25']
    const map = makeMap(['2026-06-05', '2026-06-15', '2026-06-25'], () => 50)
    const c = buildEventResponse(seq, map)
    expect(c.exposures).toBe(3) // 06-05·06-06 → 1
  })

  it('노출이 MIN_EXPOSURES 미만이면 eligible false', () => {
    const two = ['2026-06-05', '2026-06-15']
    const map = makeMap(two, () => 50)
    const c = buildEventResponse(two, map)
    expect(c.exposures).toBeLessThan(MIN_EXPOSURES)
    expect(c.eligible).toBe(false)
  })
})
