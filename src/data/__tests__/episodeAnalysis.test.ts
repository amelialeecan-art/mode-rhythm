import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { DB_NAME, DB_VERSION, SCHEMA_V1 } from '../schema'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getAnalysisViewModel } from '../services/patternAnalysisService'

/* 합성 데이터만 사용. Phase 4 순수 엔진 ↔ 실제 DB ↔ Analysis VM 연결 검증. */
function draft(date: string, p: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...p, date }
}
async function save(date: string, p: Partial<DailyEntryDraft>) {
  await saveDailyEntry(draft(date, p))
}
const END = '2026-06-20'

beforeEach(async () => {
  await resetDatabase()
})

describe('에피소드 분석 연결 (Phase 5)', () => {
  it('reported level 4 무너짐 + 시간 순서 신호 버킷', async () => {
    await save('2026-06-08', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-09', { stateCodes: ['calm'], functionLevel: 2, catalogEventCodes: ['work_heavy'] }) // lag2 선행
    await save('2026-06-10', { stateCodes: ['irritable'], functionLevel: 2, catalogEventCodes: ['conflict'] }) // lag1 전날
    await save('2026-06-11', {
      stateCodes: ['anxious', 'sad'],
      functionLevel: 4, // 시작(무너짐)
      catalogEventCodes: ['sns_heavy', 'shorts_heavy'],
      eventRelationBefore: ['sns_heavy'], // 당일 동반(before)
      eventRelationAfter: ['shorts_heavy'], // 무너진 뒤
    })
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2, catalogEventCodes: ['meal_overeat'] }) // 시작 이후 → 누수
    await save('2026-06-13', { stateCodes: ['calm'], functionLevel: 2 })

    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.episodes).toHaveLength(1)
    const ep = vm.episodes[0]

    // reported / severity(level4=무너짐) / 회복
    expect(ep.confidence).toBe('reported')
    expect(ep.confidenceLabel).toBe('기록 기반')
    expect(ep.peakFunctionLevel).toBe(4)
    expect(ep.severityLabel).toBe('무너짐')
    expect(ep.startDate).toBe('2026-06-11')
    expect(ep.status).toBe('recovered')
    expect(ep.dateLabel).toBe('6월 11일')
    expect(ep.summary.length).toBeGreaterThanOrEqual(2)

    // 기본 카드 3영역
    expect(ep.earlyChanges.items.map((s) => s.factorGroup)).toContain('workload')
    expect(ep.dayBeforeNew.items.map((s) => s.factorGroup)).toContain('interpersonal_stress')
    expect(ep.afterBehaviors.items.map((s) => s.factorGroup)).toContain('short_video')
    // 같은 날은 접힘 영역으로
    expect(ep.sameDay.map((s) => s.factorGroup)).toContain('social_media')

    // 누수 방지: 시작 이후 사건(overeat)은 어떤 영역에도 없음
    const shown = [
      ...ep.earlyChanges.items,
      ...ep.dayBeforeNew.items,
      ...ep.afterBehaviors.items,
      ...ep.sameDay,
    ].map((s) => s.factorGroup)
    expect(shown).not.toContain('overeat')
  })

  it('같은 factorGroup은 한 항목으로 병합(반복) — 중복 렌더 없음', async () => {
    await save('2026-06-08', { stateCodes: ['calm'], functionLevel: 2, catalogEventCodes: ['meal_overeat'] }) // lag3
    await save('2026-06-10', { stateCodes: ['calm'], functionLevel: 2, catalogEventCodes: ['meal_overeat'] }) // lag1
    await save('2026-06-11', {
      stateCodes: ['sad'],
      functionLevel: 4,
      catalogEventCodes: ['meal_overeat'],
      eventRelationBefore: ['meal_overeat'], // lag0
    })
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-13', { stateCodes: ['calm'], functionLevel: 2 })

    const ep = (await getAnalysisViewModel({ endDate: END })).episodes[0]
    const early = ep.earlyChanges.items.filter((s) => s.factorGroup === 'overeat')
    expect(early).toHaveLength(1) // 3번 기록됐지만 한 항목
    expect(early[0].detail).toBe('3일 전부터 반복')
    // 다른 영역에 중복 배치되지 않음
    expect(ep.dayBeforeNew.items.map((s) => s.factorGroup)).not.toContain('overeat')
    expect(ep.sameDay.map((s) => s.factorGroup)).not.toContain('overeat')
  })

  it('영역당 최대 2개 + 나머지는 overflow', async () => {
    await save('2026-06-09', {
      stateCodes: ['calm'],
      functionLevel: 2,
      catalogEventCodes: ['work_heavy', 'conflict', 'sns_heavy'], // 모두 lag2 선행
    })
    await save('2026-06-11', { stateCodes: ['sad'], functionLevel: 4 })
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-13', { stateCodes: ['calm'], functionLevel: 2 })

    const ep = (await getAnalysisViewModel({ endDate: END })).episodes[0]
    expect(ep.earlyChanges.items).toHaveLength(2)
    expect(ep.earlyChanges.overflow).toBe(1)
  })

  it('level 3 기능 저하는 무너짐과 구분해서 표시', async () => {
    await save('2026-06-10', { stateCodes: ['sad'], functionLevel: 3 })
    await save('2026-06-11', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2 })
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.episodes).toHaveLength(1)
    expect(vm.episodes[0].peakFunctionLevel).toBe(3)
    expect(vm.episodes[0].severityLabel).toBe('기능 저하')
  })

  it('무너짐 기록이 없으면 에피소드 없음', async () => {
    await save('2026-06-10', { stateCodes: ['calm'], functionLevel: 1 })
    await save('2026-06-11', { stateCodes: ['calm'], functionLevel: 2 })
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.episodes).toEqual([])
  })

  it('DB_NAME/DB_VERSION/SCHEMA_V1 불변', () => {
    expect(DB_NAME).toBe('MODELocalDB')
    expect(DB_VERSION).toBe(1)
    expect(Object.keys(SCHEMA_V1)).toHaveLength(7)
  })
})

describe('요약 문장 중립 표현 (Phase 5.1 hotfix)', () => {
  it('level 4여도 요약은 공통 중립 표현 — "무너지기/무너진 뒤" 미사용', async () => {
    await save('2026-06-08', { stateCodes: ['calm'], functionLevel: 2, catalogEventCodes: ['meal_overeat'] }) // lag3 선행
    await save('2026-06-11', { stateCodes: ['sad'], functionLevel: 4, catalogEventCodes: ['shorts_heavy'] }) // 나빠진 뒤
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-13', { stateCodes: ['calm'], functionLevel: 2 })

    const ep = (await getAnalysisViewModel({ endDate: END })).episodes[0]
    const text = ep.summary.join(' ')
    // 공통 중립 표현 사용
    expect(ep.summary.some((s) => s.includes('힘들었던 날 3일 전부터'))).toBe(true)
    expect(ep.summary.some((s) => s.includes('상태가 나빠진 뒤에는'))).toBe(true)
    // 요약 문장에 "무너" 계열 표현이 없어야 함(구분은 배지에서만)
    expect(text).not.toMatch(/무너/)
    // 배지에서만 무너짐 구분
    expect(ep.severityLabel).toBe('무너짐')
  })

  it('level 3도 요약은 중립, 배지만 "기능 저하"', async () => {
    await save('2026-06-10', { stateCodes: ['sad'], functionLevel: 3 })
    await save('2026-06-11', { stateCodes: ['calm'], functionLevel: 2 })
    await save('2026-06-12', { stateCodes: ['calm'], functionLevel: 2 })

    const ep = (await getAnalysisViewModel({ endDate: END })).episodes[0]
    expect(ep.summary[0]).toContain('다른 날보다 힘들었던 날이에요')
    expect(ep.summary.join(' ')).not.toMatch(/무너/)
    expect(ep.severityLabel).toBe('기능 저하')
  })
})
