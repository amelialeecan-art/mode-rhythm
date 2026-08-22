/* =====================================================================
   MODE · 리듬 날짜 상세 요약 (순수) 단위 검증
   숫자 나열이 아니라 그날을 사람이 이해할 수 있게 설명하는지,
   없는 패턴/원인을 만들지 않는지 검증한다.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { buildDaySummary, type OverlayDisplay } from '../rhythmDaySummary'
import type { RhythmDayDetail } from '../../../data/services/rhythmService'

// 표시값은 0~100(위=좋음). 식욕만 위=강함.
const D = (emotional: number, appetite: number, sleep: number, body: number): OverlayDisplay[] => [
  { metric: 'emotional', value: emotional },
  { metric: 'appetite', value: appetite },
  { metric: 'sleep', value: sleep },
  { metric: 'body', value: body },
]

describe('배고픔 vs 당김 대비', () => {
  it('당김 높고 실제 배고픔 낮으면 "고팠다기보다 당겼다" 의미', () => {
    const detail: RhythmDayDetail = { hunger: 3, craving: 8, fatigue: 8, sleepHours: 5.83 }
    // 잠 나쁨(수면 표시 낮음), 식욕 강함
    const s = buildDaySummary({ displays: D(50, 75, 20, 45), detail })
    expect(s.headline).toContain('당겼')
    expect(s.headline).not.toContain('배가 고팠어')
    // 실제 값 노출
    expect(s.facts).toContain('음식 당김 8')
    expect(s.facts).toContain('실제 배고픔 3')
    expect(s.facts.some((f) => f.startsWith('수면 5시간'))).toBe(true)
  })

  it('상태가 잠잠하고 당김만 높으면 단독 문장', () => {
    const detail: RhythmDayDetail = { hunger: 2, craving: 7 }
    const s = buildDaySummary({ displays: D(55, 70, 55, 55), detail })
    expect(s.headline).toContain('음식 생각은 많이 난')
  })
})

describe('상태 요약', () => {
  it('잠을 잘 못 잔 날(수면 표시 낮음)', () => {
    const s = buildDaySummary({ displays: D(55, 50, 15, 55), detail: { sleepHours: 4.5, hunger: 4, craving: 4 } })
    expect(s.headline).toMatch(/잠.*(못|망)/)
  })

  it('몸 컨디션이 안 좋은 날(몸 표시 낮음)', () => {
    const s = buildDaySummary({ displays: D(55, 50, 55, 18), detail: { fatigue: 8, pain: 6, hunger: 5, craving: 3 } })
    expect(s.headline).toContain('몸')
    expect(s.headline).toMatch(/안 좋|처진/)
    expect(s.facts).toContain('피로 8')
    expect(s.facts).toContain('통증 6')
  })

  it('기분도 몸도 같이 처진 날', () => {
    const s = buildDaySummary({ displays: D(20, 50, 55, 22) })
    expect(s.headline).toContain('기분')
    expect(s.headline).toContain('몸')
  })

  it('다 괜찮았던 날', () => {
    const s = buildDaySummary({ displays: D(75, 50, 80, 78) })
    expect(s.headline).toMatch(/괜찮|잘 잤/)
  })
})

describe('없는 것은 말하지 않는다 (사실만)', () => {
  it('원인 단정 표현이 없다', () => {
    const detail: RhythmDayDetail = { hunger: 3, craving: 8, fatigue: 7, sleepHours: 5 }
    const s = buildDaySummary({ displays: D(35, 75, 25, 40), detail })
    // "때문에 / 탓 / 올라갔어(인과)" 같은 인과 단정 금지
    expect(s.headline).not.toMatch(/때문|탓/)
  })

  it('원본 값이 없으면 그 값을 지어내지 않는다(주 단위 등)', () => {
    // detail 없음 → facts는 표시 지표 값만
    const s = buildDaySummary({ displays: D(60, 40, 55, 48) })
    expect(s.facts.every((f) => /^(기분|식욕|수면|몸) \d+$/.test(f))).toBe(true)
    expect(s.facts.some((f) => f.includes('배고픔'))).toBe(false)
  })

  it('선택 지표가 없으면 안전 문구', () => {
    const s = buildDaySummary({ displays: [] })
    expect(s.facts).toEqual([])
    expect(s.headline.length).toBeGreaterThan(0)
  })
})
