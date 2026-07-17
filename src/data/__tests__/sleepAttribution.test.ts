import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { eventLogRepository, dailyScoreRepository } from '../repositories'
import { buildExportPayload } from '../services/dataExportService'
import { validateImportPayload, importAllData } from '../services/dataImportService'
import { LAST_NIGHT_SLEEP_CODES } from '../catalog/lastNightSleep'

function draft(date: string, p: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...p, date }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('지난밤 수면 저장/복원', () => {
  it('저장 → 재열기 → 재저장 무손실', async () => {
    const d = draft('2026-06-02', {
      stateCodes: ['anxious'],
      lastNightSleep: { hours: 5, quality: 4, issues: ['sleep_waking', 'sleep_nightmare'] },
    })
    await saveDailyEntry(d)

    const loaded = await loadDailyEntry('2026-06-02')
    expect(loaded).not.toBeNull()
    expect(loaded!.lastNightSleep).toEqual({ hours: 5, quality: 4, issues: ['sleep_waking', 'sleep_nightmare'] })

    // 지난밤 수면 카드는 sleep 사건(eventLogs)을 만들지 않는다
    const ev = await eventLogRepository.listByDate('2026-06-02')
    expect(ev.some((e) => LAST_NIGHT_SLEEP_CODES.has(e.eventCode))).toBe(false)

    // 재저장 후에도 그대로
    await saveDailyEntry(loaded!)
    const again = await loadDailyEntry('2026-06-02')
    expect(again!.lastNightSleep).toEqual(loaded!.lastNightSleep)
  })

  it('입력 없으면 lastNightSleep는 저장되지 않는다(undefined)', async () => {
    await saveDailyEntry(draft('2026-06-04', { stateCodes: ['calm'] }))
    const payload = await buildExportPayload()
    const dl = payload.tables.dailyLogs.find((x) => x.date === '2026-06-04')
    expect(dl).toBeTruthy()
    expect(dl!.lastNightSleep).toBeUndefined()
  })
})

describe('legacy sleep 사건 호환', () => {
  it('옛 sleep 사건은 읽기·재저장에서 보존되고, 카드는 빈 상태로 로딩된다', async () => {
    // legacy 시뮬레이션: 지난밤 수면 카드 없이 sleep_late 사건만 있는 날
    await saveDailyEntry(draft('2026-06-01', { stateCodes: ['sad'], catalogEventCodes: ['sleep_late'] }))

    const loaded = await loadDailyEntry('2026-06-01')
    // 새 필드 없는 옛 기록 → 빈 카드
    expect(loaded!.lastNightSleep).toEqual({ issues: [] })
    // 사건은 읽기에서 보존
    expect(loaded!.catalogEventCodes).toContain('sleep_late')

    // 재저장해도 사건이 사라지지 않는다 (삭제/변환 없음)
    await saveDailyEntry(loaded!)
    const ev = await eventLogRepository.listByDate('2026-06-01')
    expect(ev.some((e) => e.eventCode === 'sleep_late')).toBe(true)
  })
})

describe('수면 계산 경로', () => {
  it('지난밤 수면 시간이 적으면 dailyScore.sleepLoad가 높다', async () => {
    await saveDailyEntry(draft('2026-06-05', { stateCodes: ['calm'], lastNightSleep: { hours: 8, issues: [] } }))
    await saveDailyEntry(draft('2026-06-06', { stateCodes: ['calm'], lastNightSleep: { hours: 4, issues: ['sleep_waking'] } }))
    const good = await dailyScoreRepository.getByDate('2026-06-05')
    const bad = await dailyScoreRepository.getByDate('2026-06-06')
    expect(bad!.sleepLoad).toBeGreaterThan(good!.sleepLoad)
  })

  it("옛 'sleep_short' 사건이 dailyScore.sleepLoad에 반영된다 (end-to-end 결함 수정)", async () => {
    await saveDailyEntry(draft('2026-06-07', { stateCodes: ['calm'] })) // 수면 입력 없음
    await saveDailyEntry(draft('2026-06-08', { stateCodes: ['calm'], catalogEventCodes: ['sleep_short'] }))
    const none = await dailyScoreRepository.getByDate('2026-06-07')
    const short = await dailyScoreRepository.getByDate('2026-06-08')
    expect(none!.sleepLoad).toBe(0)
    expect(short!.sleepLoad).toBeGreaterThan(0)
  })
})

describe('export/import 왕복 보존', () => {
  it('lastNightSleep가 export에 포함되고 import로 복원된다', async () => {
    await saveDailyEntry(draft('2026-06-03', { stateCodes: ['sad'], lastNightSleep: { hours: 6, issues: ['woke_late'] } }))

    const payload = await buildExportPayload()
    const dl = payload.tables.dailyLogs.find((x) => x.date === '2026-06-03')
    expect(dl!.lastNightSleep).toEqual({ hours: 6, issues: ['woke_late'] })

    const v = validateImportPayload(payload)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    await resetDatabase()
    await importAllData(v.payload)

    const loaded = await loadDailyEntry('2026-06-03')
    expect(loaded!.lastNightSleep).toEqual({ hours: 6, issues: ['woke_late'] })
  })
})
