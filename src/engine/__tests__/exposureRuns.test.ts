import { describe, expect, it } from 'vitest'
import {
  buildExposureRuns,
  cumulativeExposureEffect,
  exposureKey,
  normalizeEventLabel,
  overlapDays,
  type ExposureInput,
} from '../exposureRuns'

const work = (date: string, eventCode = 'work_pressure'): ExposureInput => ({
  date,
  factorGroup: 'deadline_pressure',
  eventCode,
})
const sleep = (date: string): ExposureInput => ({ date, factorGroup: 'sleep_deficit', eventCode: 'sleep_short' })

describe('buildExposureRuns', () => {
  it('같은 사건 3일 연속 → 1개 run, days=3', () => {
    const runs = buildExposureRuns([work('2026-07-20'), work('2026-07-21'), work('2026-07-22')])
    expect(runs.length).toBe(1)
    expect(runs[0].days).toBe(3)
    expect(runs[0].startDate).toBe('2026-07-20')
    expect(runs[0].endDate).toBe('2026-07-22')
    expect(runs[0].dates).toEqual(['2026-07-20', '2026-07-21', '2026-07-22'])
  })

  it('하루 공백이면 별도 run', () => {
    const runs = buildExposureRuns([work('2026-07-20'), work('2026-07-22')])
    expect(runs.length).toBe(2)
    expect(runs.map((r) => r.days)).toEqual([1, 1])
    expect(runs.map((r) => r.startDate)).toEqual(['2026-07-20', '2026-07-22'])
  })

  it('같은 factorGroup이라도 다른 eventCode면 별도 run(합치지 않음)', () => {
    const runs = buildExposureRuns([work('2026-07-20', 'work_pressure'), work('2026-07-21', 'work_overload')])
    expect(runs.length).toBe(2)
    expect(new Set(runs.map((r) => r.key)).size).toBe(2)
    expect(runs.every((r) => r.days === 1)).toBe(true)
  })

  it('사용자정의 사건은 문구 정규화로 같은 사건을 묶는다(eventCode 무관)', () => {
    expect(normalizeEventLabel('  체중계  올라감 ')).toBe('체중계 올라감')
    // 다른 eventCode지만 정규화 문구+group이 같으면 같은 key → 연속 1구간
    const a: ExposureInput = { date: '2026-07-20', factorGroup: 'body_image', eventCode: 'custom_1', isCustom: true, label: '  체중계  올라감 ' }
    const b: ExposureInput = { date: '2026-07-21', factorGroup: 'body_image', eventCode: 'custom_2', isCustom: true, label: '체중계 올라감' }
    expect(exposureKey(a)).toBe(exposureKey(b))
    const runs = buildExposureRuns([a, b])
    expect(runs.length).toBe(1)
    expect(runs[0].days).toBe(2)
  })

  it('서로 다른 사건은 같은 날 겹쳐도 각각 유지되고, 겹친 날짜 수를 센다', () => {
    const runs = buildExposureRuns([
      work('2026-07-20'), work('2026-07-21'), work('2026-07-22'),
      sleep('2026-07-21'), sleep('2026-07-22'), sleep('2026-07-23'),
    ])
    expect(runs.length).toBe(2)
    const w = runs.find((r) => r.factorGroup === 'deadline_pressure')!
    const s = runs.find((r) => r.factorGroup === 'sleep_deficit')!
    expect(overlapDays(w, s)).toBe(2) // 7/21, 7/22
  })
})

describe('cumulativeExposureEffect', () => {
  // 하루 노출 3회(값 40) + 2일↑ 연속 노출 2회(값 60)
  const buildScenario = () => {
    const inputs: ExposureInput[] = [
      work('2026-07-01'), work('2026-07-05'), work('2026-07-09'), // 단일 3회
      work('2026-07-13'), work('2026-07-14'), // 다일 (2일)
      work('2026-07-18'), work('2026-07-19'), work('2026-07-20'), // 다일 (3일)
    ]
    const runs = buildExposureRuns(inputs)
    const metric = new Map<string, number>()
    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10', '2026-07-11']) metric.set(d, 40)
    for (const d of ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22']) metric.set(d, 60)
    return { runs, metric }
  }

  it('하루 노출과 다일 노출의 결과 차이를 계산한다', () => {
    const { runs, metric } = buildScenario()
    const stat = cumulativeExposureEffect(runs, metric, 8)
    expect(stat).not.toBeNull()
    expect(stat!.singleRuns).toBe(3)
    expect(stat!.multiRuns).toBe(2)
    expect(stat!.totalRuns).toBe(5)
    expect(stat!.singleMean).toBe(40)
    expect(stat!.multiMean).toBe(60)
    expect(stat!.effectSize).toBe(20)
  })

  it('반복 사례가 부족하면 결과 없음', () => {
    // 구간 2개(<3) → null
    expect(cumulativeExposureEffect(buildExposureRuns([work('2026-07-01'), work('2026-07-05')]), new Map(), 8)).toBeNull()
    // 구간 3개지만 다일 노출 0개(<2) → null
    const single3 = buildExposureRuns([work('2026-07-01'), work('2026-07-05'), work('2026-07-09')])
    const m = new Map<string, number>()
    for (const d of ['2026-07-01', '2026-07-05', '2026-07-09']) m.set(d, 50)
    expect(cumulativeExposureEffect(single3, m, 8)).toBeNull()
  })

  it('단일↔다일 차이가 효과 기준 미만이면 결과 없음', () => {
    const { runs } = buildScenario()
    const flat = new Map<string, number>()
    for (const d of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21', '2026-07-22']) flat.set(d, 45)
    expect(cumulativeExposureEffect(runs, flat, 8)).toBeNull() // effectSize 0 < 8
  })
})
