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

    // 시간 순서 버킷
    expect(ep.earlyLeadUp.map((s) => s.factorGroup)).toContain('workload')
    expect(ep.dayBeforeWarning.map((s) => s.factorGroup)).toContain('interpersonal_stress')
    expect(ep.sameDayCompanion.map((s) => s.factorGroup)).toContain('social_media')
    expect(ep.sameDayCompanion[0].timing).toBe('같은 날')
    expect(ep.afterShift.map((s) => s.factorGroup)).toContain('short_video')

    // 누수 방지: 시작 이후 사건(overeat)은 어떤 선행 버킷에도 없음
    const precursors = [...ep.earlyLeadUp, ...ep.dayBeforeWarning, ...ep.sameDayCompanion].map((s) => s.factorGroup)
    expect(precursors).not.toContain('overeat')
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
