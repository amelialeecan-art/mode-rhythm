import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import { DB_NAME, DB_VERSION, SCHEMA_V1 } from '../schema'
import {
  saveDailyEntry,
  loadDailyEntry,
  emptyDraft,
  deriveRelationToShift,
  type DailyEntryDraft,
  type EventDraft,
} from '../services/dailyEntryService'
import { eventLogRepository } from '../repositories'
import { buildExportPayload } from '../services/dataExportService'
import { validateImportPayload, importAllData } from '../services/dataImportService'

function draft(date: string, p: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...p, date }
}
const customEvent = (code: string, label: string): EventDraft => ({
  eventCode: code, eventLabel: label, category: 'custom', timing: 'today', intensity: 5,
  isCustom: true, customLabel: label, mappedFactorGroup: 'custom',
})

beforeEach(async () => {
  await resetDatabase()
})

describe('deriveRelationToShift', () => {
  it('before/after → before/after/both/unknown', () => {
    expect(deriveRelationToShift('a', ['a'], [])).toBe('before')
    expect(deriveRelationToShift('a', [], ['a'])).toBe('after')
    expect(deriveRelationToShift('a', ['a'], ['a'])).toBe('both')
    expect(deriveRelationToShift('a', [], [])).toBe('unknown')
  })
})

describe('기능 단계 저장/복원 (1)', () => {
  it('단계만 저장·복원·재저장', async () => {
    await saveDailyEntry(draft('2026-06-01', { stateCodes: ['calm'], functionLevel: 2 }))
    const loaded = await loadDailyEntry('2026-06-01')
    expect(loaded!.functionLevel).toBe(2)
    await saveDailyEntry(loaded!)
    expect((await loadDailyEntry('2026-06-01'))!.functionLevel).toBe(2)
  })

  it('미선택이면 저장되지 않는다', async () => {
    await saveDailyEntry(draft('2026-06-02', { stateCodes: ['calm'] }))
    const dl = (await buildExportPayload()).tables.dailyLogs.find((x) => x.date === '2026-06-02')
    expect(dl!.functionLevel).toBeUndefined()
  })
})

describe('세부 입력은 단계 3·4에서만 (2)', () => {
  it('단계 2에서는 세부(항목/시점/관계)가 저장되지 않는다', async () => {
    await saveDailyEntry(
      draft('2026-06-03', {
        stateCodes: ['sad'], functionLevel: 2,
        functionImpactCodes: ['cancel_plan'], functionDropOnset: 'morning',
        catalogEventCodes: ['work_heavy'], eventRelationBefore: ['work_heavy'],
      }),
    )
    const loaded = await loadDailyEntry('2026-06-03')
    expect(loaded!.functionLevel).toBe(2)
    expect(loaded!.functionImpactCodes).toEqual([])
    expect(loaded!.functionDropOnset).toBeUndefined()
    const ev = await eventLogRepository.listByDate('2026-06-03')
    expect(ev.find((e) => e.eventCode === 'work_heavy')!.relationToShift).toBeUndefined()
  })

  it('단계 4에서는 세부와 관계가 저장·복원된다', async () => {
    await saveDailyEntry(
      draft('2026-06-04', {
        stateCodes: ['sad'], functionLevel: 4,
        functionImpactCodes: ['cancel_plan', 'mostly_lying'], functionImpactCustom: ['전화 못 받음'],
        functionDropOnset: 'afternoon',
        catalogEventCodes: ['work_heavy', 'conflict'],
        eventRelationBefore: ['work_heavy'], eventRelationAfter: ['conflict'],
      }),
    )
    const loaded = await loadDailyEntry('2026-06-04')
    expect(loaded!.functionImpactCodes).toEqual(['cancel_plan', 'mostly_lying'])
    expect(loaded!.functionImpactCustom).toEqual(['전화 못 받음'])
    expect(loaded!.functionDropOnset).toBe('afternoon')
    expect(loaded!.eventRelationBefore).toEqual(['work_heavy'])
    expect(loaded!.eventRelationAfter).toEqual(['conflict'])
    const ev = await eventLogRepository.listByDate('2026-06-04')
    expect(ev.find((e) => e.eventCode === 'work_heavy')!.relationToShift).toBe('before')
    expect(ev.find((e) => e.eventCode === 'conflict')!.relationToShift).toBe('after')
  })

  it('both/unknown 저장 (3)', async () => {
    await saveDailyEntry(
      draft('2026-06-05', {
        stateCodes: ['sad'], functionLevel: 3,
        catalogEventCodes: ['work_heavy', 'sns_heavy'],
        eventRelationBefore: ['work_heavy'], eventRelationAfter: ['work_heavy'], // both
      }),
    )
    const ev = await eventLogRepository.listByDate('2026-06-05')
    expect(ev.find((e) => e.eventCode === 'work_heavy')!.relationToShift).toBe('both')
    expect(ev.find((e) => e.eventCode === 'sns_heavy')!.relationToShift).toBe('unknown') // 표시 안 함
  })
})

describe('사건 발생일은 기록 날짜와 같게 저장', () => {
  it('저장은 발생일을 기록 날짜로(timing=today) 두고 relation을 부여한다 — 옛 draft.eventTiming 값은 무시', async () => {
    await saveDailyEntry(
      draft('2026-06-06', {
        stateCodes: ['sad'], functionLevel: 4, eventTiming: 'recent3days', // 옛 값 — 저장 시 today로 정규화
        catalogEventCodes: ['work_heavy'], eventRelationBefore: ['work_heavy'],
      }),
    )
    const ev = await eventLogRepository.listByDate('2026-06-06')
    const saved = ev.find((e) => e.eventCode === 'work_heavy')!
    expect(saved.timing).toBe('today')
    expect(saved.relationToShift).toBe('before')
  })
})

describe('유령 relation 제거 / custom 보존', () => {
  it('사건을 해제하면 relation이 남지 않는다', async () => {
    await saveDailyEntry(draft('2026-06-07', { stateCodes: ['sad'], functionLevel: 4, catalogEventCodes: ['work_heavy'], eventRelationBefore: ['work_heavy'] }))
    // 재저장: 사건 해제 (relation 배열에 stale이 남아도 이벤트가 없으면 유령이 없어야 함)
    await saveDailyEntry(draft('2026-06-07', { stateCodes: ['sad'], functionLevel: 4, catalogEventCodes: [], eventRelationBefore: ['work_heavy'] }))
    const ev = await eventLogRepository.listByDate('2026-06-07')
    expect(ev.find((e) => e.eventCode === 'work_heavy')).toBeUndefined()
    const loaded = await loadDailyEntry('2026-06-07')
    expect(loaded!.eventRelationBefore).toEqual([])
  })

  it('custom 사건의 relation도 저장·복원된다', async () => {
    const c = customEvent('custom_x', '체중계 올라감')
    await saveDailyEntry(draft('2026-06-08', { stateCodes: ['sad'], functionLevel: 4, customEvents: [c], eventRelationAfter: ['custom_x'] }))
    const ev = await eventLogRepository.listByDate('2026-06-08')
    expect(ev.find((e) => e.eventCode === 'custom_x')!.relationToShift).toBe('after')
    const loaded = await loadDailyEntry('2026-06-08')
    expect(loaded!.eventRelationAfter).toEqual(['custom_x'])
    expect(loaded!.customEvents.map((e) => e.eventCode)).toContain('custom_x')
  })
})

describe('legacy 호환 / export·import / 불변', () => {
  it('필드 없는 옛 dailyLog도 정상 로딩되고 재저장에 다른 값 손실 없음', async () => {
    // legacy 시뮬: function 필드 없이 저장
    await saveDailyEntry(draft('2026-06-09', { stateCodes: ['sad'], catalogEventCodes: ['work_heavy'], memo: '메모' }))
    const loaded = await loadDailyEntry('2026-06-09')
    expect(loaded!.functionLevel).toBeUndefined()
    expect(loaded!.functionImpactCodes).toEqual([])
    await saveDailyEntry(loaded!)
    const again = await loadDailyEntry('2026-06-09')
    expect(again!.memo).toBe('메모')
    expect(again!.catalogEventCodes).toContain('work_heavy')
  })

  it('export/import 왕복 보존', async () => {
    await saveDailyEntry(
      draft('2026-06-10', {
        stateCodes: ['sad'], functionLevel: 4, functionImpactCodes: ['cant_work'], functionDropOnset: 'evening',
        catalogEventCodes: ['work_heavy'], eventRelationBefore: ['work_heavy'],
      }),
    )
    const payload = await buildExportPayload()
    const dl = payload.tables.dailyLogs.find((x) => x.date === '2026-06-10')
    expect(dl!.functionLevel).toBe(4)
    expect(dl!.functionImpactCodes).toEqual(['cant_work'])
    const evLog = payload.tables.eventLogs.find((x) => x.date === '2026-06-10' && x.eventCode === 'work_heavy')
    expect(evLog!.relationToShift).toBe('before')

    const v = validateImportPayload(payload)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    await resetDatabase()
    await importAllData(v.payload)
    const loaded = await loadDailyEntry('2026-06-10')
    expect(loaded!.functionLevel).toBe(4)
    expect(loaded!.functionImpactCodes).toEqual(['cant_work'])
    expect(loaded!.eventRelationBefore).toEqual(['work_heavy'])
  })

  it('DB_NAME/DB_VERSION/SCHEMA_V1 불변', () => {
    expect(DB_NAME).toBe('MODELocalDB')
    expect(DB_VERSION).toBe(1)
    expect(Object.keys(SCHEMA_V1)).toHaveLength(7)
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(SCHEMA_V1).sort())
  })
})
