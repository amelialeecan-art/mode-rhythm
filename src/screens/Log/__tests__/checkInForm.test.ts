import { describe, expect, it } from 'vitest'
import { MORNING_PROMPTED, EVENING_PROMPTED } from '../../../data/catalog/coreState'
import {
  buildMeasurementInput,
  measurementToValues,
  serializeCheckIn,
  type CheckInValues,
} from '../checkIn/checkInForm'

const RECORDED = '2026-08-21T08:00:00.000Z'

function morningInput(values: CheckInValues, note?: string) {
  return buildMeasurementInput({
    localDate: '2026-08-21',
    checkInType: 'morning',
    promptedMetrics: MORNING_PROMPTED,
    values,
    recordedAt: RECORDED,
    timezoneOffsetMinutes: 540,
    note,
  })
}

describe('buildMeasurementInput — 0/null/unknown', () => {
  it('0은 number 0으로, unknown은 문자열로, 미선택은 저장하지 않는다', () => {
    const input = morningInput({ moodLow: 0, anxiety: 'unknown' })
    // 0 = 진짜 number
    expect(input.metrics.moodLow).toBe(0)
    expect(typeof input.metrics.moodLow).toBe('number')
    // unknown 그대로
    expect(input.metrics.anxiety).toBe('unknown')
    // 미선택(energy 등)은 metrics에 없다 — 0으로 채우지 않는다
    expect('energy' in input.metrics).toBe(false)
    expect(input.metrics.energy).toBeUndefined()
  })

  it('promptedMetrics는 8개 전부 저장하되, 응답 안 한 metric은 metrics에서 빠진다', () => {
    const input = morningInput({ moodLow: 3 })
    expect(input.promptedMetrics).toEqual(MORNING_PROMPTED)
    expect(input.promptedMetrics).toHaveLength(8)
    // 응답은 1개뿐 → metrics 키도 1개
    expect(Object.keys(input.metrics)).toEqual(['moodLow'])
    // 나머지 prompted metric은 "물어봤지만 미응답" — 0으로 채워지지 않았다
    for (const m of MORNING_PROMPTED) {
      if (m === 'moodLow') continue
      expect(input.metrics[m]).toBeUndefined()
    }
  })

  it('prompted 목록 밖의 값은 무시한다 (아침에 craving 값이 있어도 저장 안 함)', () => {
    const input = morningInput({ moodLow: 2, craving: 9 })
    expect('craving' in input.metrics).toBe(false)
  })

  it('저녁은 12개를 독립적으로 저장한다', () => {
    const values: CheckInValues = {}
    for (const m of EVENING_PROMPTED) values[m] = 5
    const input = buildMeasurementInput({
      localDate: '2026-08-21',
      checkInType: 'evening',
      promptedMetrics: EVENING_PROMPTED,
      values,
      recordedAt: '2026-08-21T22:00:00.000Z',
      timezoneOffsetMinutes: 540,
    })
    expect(Object.keys(input.metrics)).toHaveLength(12)
    expect(input.metrics.physicalHunger).toBe(5)
    expect(input.metrics.craving).toBe(5)
    expect(input.metrics.bingeUrge).toBe(5)
  })

  it('recordedAt / schemaVersion / source 기본값을 채운다', () => {
    const input = morningInput({ moodLow: 1 })
    expect(input.recordedAt).toBe(RECORDED)
    expect(input.schemaVersion).toBe(1)
    expect(input.source).toBe('manual')
  })

  it('메모는 trim되고, 비어있으면 undefined다', () => {
    expect(morningInput({ moodLow: 1 }, '  힘든 아침  ').note).toBe('힘든 아침')
    expect(morningInput({ moodLow: 1 }, '   ').note).toBeUndefined()
    expect(morningInput({ moodLow: 1 }).note).toBeUndefined()
  })
})

describe('measurementToValues — 복원(restore)', () => {
  it('저장형 metrics를 화면 값으로 되살린다 (0/unknown 유지, null/absent 제외)', () => {
    const values = measurementToValues({ metrics: { moodLow: 0, anxiety: 'unknown', energy: null } })
    expect(values.moodLow).toBe(0)
    expect(values.anxiety).toBe('unknown')
    // null은 화면 값으로 되살리지 않는다(미선택)
    expect('energy' in values).toBe(false)
  })

  it('build → 저장형 → 복원 라운드트립이 응답값을 보존한다', () => {
    const original: CheckInValues = { moodLow: 0, anxiety: 7, focus: 'unknown' }
    const input = morningInput(original)
    const restored = measurementToValues({ metrics: input.metrics })
    expect(restored).toEqual(original)
  })
})

describe('serializeCheckIn — dirty 판정', () => {
  it('키 순서와 무관하게 같은 값은 같은 문자열', () => {
    expect(serializeCheckIn({ moodLow: 1, anxiety: 2 }, '')).toBe(serializeCheckIn({ anxiety: 2, moodLow: 1 }, ''))
  })
  it('값 또는 메모가 다르면 다른 문자열', () => {
    const base = serializeCheckIn({ moodLow: 1 }, '')
    expect(serializeCheckIn({ moodLow: 2 }, '')).not.toBe(base)
    expect(serializeCheckIn({ moodLow: 1 }, '메모')).not.toBe(base)
  })
})
