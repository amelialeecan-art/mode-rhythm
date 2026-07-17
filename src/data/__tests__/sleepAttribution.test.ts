import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getAnalysisViewModel } from '../services/patternAnalysisService'
import { eventLogRepository, dailyScoreRepository } from '../repositories'
import { buildExportPayload } from '../services/dataExportService'
import { validateImportPayload, importAllData } from '../services/dataImportService'
import { LAST_NIGHT_SLEEP_CODES } from '../catalog/lastNightSleep'
import { addDaysISO } from '../../engine'

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

describe('신규 수면으로 전환된 날짜의 legacy 정리 (1.1)', () => {
  it('신규 수면 저장 시 지난밤 전용 legacy 사건만 제거되고 낮잠·기타는 유지, 유령 없음', async () => {
    // legacy: 지난밤 전용(sleep_late) + 낮잠(sleep_nap) + 무관 사건(work_heavy)
    await saveDailyEntry(draft('2026-06-10', { stateCodes: ['sad'], catalogEventCodes: ['sleep_late', 'sleep_nap', 'work_heavy'] }))

    // 사용자가 지난밤 수면 카드를 실제로 입력하고 저장 → 전환
    const loaded = await loadDailyEntry('2026-06-10')
    loaded!.lastNightSleep = { hours: 5, quality: 4, issues: ['sleep_waking'] }
    await saveDailyEntry(loaded!)

    const codes = (await eventLogRepository.listByDate('2026-06-10')).map((e) => e.eventCode)
    expect(codes).not.toContain('sleep_late') // 지난밤 전용 legacy 제거
    expect(codes).toContain('sleep_nap') // 낮잠 유지
    expect(codes).toContain('work_heavy') // 무관 사건 유지

    // 재열기 → 재저장 → 유령 수면 사건 재생성 없음
    const l2 = await loadDailyEntry('2026-06-10')
    expect(l2!.lastNightSleep).toEqual({ hours: 5, quality: 4, issues: ['sleep_waking'] })
    await saveDailyEntry(l2!)
    const codes2 = (await eventLogRepository.listByDate('2026-06-10')).map((e) => e.eventCode)
    expect(codes2.filter((c) => LAST_NIGHT_SLEEP_CODES.has(c))).toEqual([])
    expect(codes2).toContain('sleep_nap')
  })

  it('lastNightSleep가 비어 있으면(열기만/카드 미입력) legacy 수면 사건을 변환·삭제하지 않는다', async () => {
    await saveDailyEntry(draft('2026-06-11', { stateCodes: ['sad'], catalogEventCodes: ['sleep_late'] }))
    const before = (await eventLogRepository.listByDate('2026-06-11')).map((e) => e.eventCode).sort()

    // 열기만 (저장 안 함) → 변경 없음
    const loaded = await loadDailyEntry('2026-06-11')
    expect((await eventLogRepository.listByDate('2026-06-11')).map((e) => e.eventCode).sort()).toEqual(before)

    // 카드 비운 채 그대로 재저장 → legacy 수면 사건 유지
    await saveDailyEntry(loaded!)
    expect((await eventLogRepository.listByDate('2026-06-11')).map((e) => e.eventCode)).toContain('sleep_late')
  })
})

describe('분석 노출 통합 (1.1)', () => {
  it('신규 lastNightSleep 수면이 분석 노출에서 사라지지 않는다', async () => {
    for (let i = 0; i < 5; i++) {
      await saveDailyEntry(
        draft(addDaysISO('2026-06-01', i), { stateCodes: ['anxious'], lastNightSleep: { hours: 4, quality: 3, issues: ['sleep_waking', 'sleep_nightmare'] } }),
      )
    }
    const vm = await getAnalysisViewModel({ endDate: '2026-06-05' })
    const labels = vm.eventFrequency.map((e) => e.label)
    // sleep_quality(수면의 질 저하) 또는 sleep_deficit(수면 부족)이 노출돼야 한다
    expect(labels.some((l) => l.includes('수면의 질') || l.includes('수면 부족'))).toBe(true)
  })

  it('legacy 수면 사건도 분석 노출에 유지된다', async () => {
    for (let i = 0; i < 5; i++) {
      await saveDailyEntry(draft(addDaysISO('2026-06-01', i), { stateCodes: ['anxious'], catalogEventCodes: ['sleep_short'] }))
    }
    const vm = await getAnalysisViewModel({ endDate: '2026-06-05' })
    const labels = vm.eventFrequency.map((e) => e.label)
    expect(labels.some((l) => l.includes('수면 부족'))).toBe(true) // sleep_deficit
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
