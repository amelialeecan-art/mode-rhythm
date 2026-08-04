import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getCalendarDayDetail } from '../services/calendarService'
import { buildExportPayload } from '../services/dataExportService'
import { importAllData } from '../services/dataImportService'
import { dailyLogRepository } from '../repositories'
import { resolveDailyStateDomains } from '../../engine'
import { MIND_SIGNAL_GROUPS, mindSignalLabels } from '../catalog/mindSignals'
import {
  SLEEP_ISSUE_GROUPS,
  SLEEP_ISSUE_LABEL,
  SLEEP_CODE_TO_GROUP,
  LAST_NIGHT_SLEEP_CODES,
  EVENT_LIST_HIDDEN_CODES,
  getSleepExposureForDate,
} from '../catalog/lastNightSleep'
import { EVENT_CATALOG } from '../catalog/events'

const D = '2026-06-21'
const draft = (p: Partial<DailyEntryDraft>): DailyEntryDraft => ({ ...emptyDraft(D), ...p })
const FORBIDDEN = /증상|진단|위험도|의심|조울|우울증|불안장애|공황|ADHD|HSP|factorGroup|bedtime|delay|onset|resistance|schedule|exposure/i

beforeEach(async () => {
  await resetDatabase()
})

describe('마음 신호 카탈로그·입력', () => {
  it('(1) 3개 소그룹과 전체 항목이 정의된다', () => {
    expect(MIND_SIGNAL_GROUPS).toHaveLength(3)
    const total = MIND_SIGNAL_GROUPS.reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(6 + 4 + 9)
    for (const g of MIND_SIGNAL_GROUPS) expect(g.items.length).toBeGreaterThan(0)
  })

  it('(22) 라벨에 진단명·증상·내부 코드가 없다', () => {
    const labels = [...MIND_SIGNAL_GROUPS.flatMap((g) => g.items.map((i) => i.label)), ...MIND_SIGNAL_GROUPS.map((g) => g.title)]
    for (const l of labels) expect(l).not.toMatch(FORBIDDEN)
  })

  it('(2) 마음 신호 복수 선택을 저장·복원한다', async () => {
    await saveDailyEntry(draft({ mindSignalCodes: ['thought_loop', 'sensory_overload', 'hard_to_start'] }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log?.mindSignalCodes).toEqual(['thought_loop', 'sensory_overload', 'hard_to_start'])
    const loaded = await loadDailyEntry(D)
    expect(loaded?.mindSignalCodes).toEqual(['thought_loop', 'sensory_overload', 'hard_to_start'])
  })

  it('(3) 미선택은 정상/없음으로 저장하지 않는다(undefined)', async () => {
    await saveDailyEntry(draft({ emotionalStabilityLevel: 'mostly_stable' }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log?.mindSignalCodes).toBeUndefined()
  })

  it('(4) 감정·머릿속 여유·마음 신호가 서로 덮어쓰지 않는다', async () => {
    await saveDailyEntry(draft({ emotionCodes: ['irritated'], emotionImpactLevel: 'brief', mentalSpaceLevel: 'overloaded', mindSignalCodes: ['thought_loop'] }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log?.emotionCodes).toEqual(['irritated'])
    expect(log?.mentalSpaceLevel).toBe('overloaded')
    expect(log?.mindSignalCodes).toEqual(['thought_loop'])
  })

  it('(5) 마음 신호는 stateDomains를 바꾸지 않는다', async () => {
    await saveDailyEntry(draft({ bodyEnergyLevel: 'empty', mindSignalCodes: ['worrying', 'self_blame'] }))
    const log = await dailyLogRepository.getByDate(D)
    const withMind = resolveDailyStateDomains(log!)
    const withoutMind = resolveDailyStateDomains({ ...log!, mindSignalCodes: undefined })
    expect(withMind).toEqual(withoutMind)
  })

  it('(14) unknown 마음 코드도 원본 보존·앱 유지', async () => {
    await saveDailyEntry(draft({ mindSignalCodes: ['worrying', 'totally_unknown_code'] }))
    const log = await dailyLogRepository.getByDate(D)
    expect(log?.mindSignalCodes).toEqual(['worrying', 'totally_unknown_code'])
    expect(mindSignalLabels(log?.mindSignalCodes)).toEqual(['괜히 걱정이 많았어요']) // unknown은 화면 미표시
  })
})

describe('지난밤 수면 입력 구조', () => {
  it('(6) 신규 취침 전 4개 항목을 저장·복원한다', async () => {
    const issues = ['bedtime_reluctance', 'bedtime_delay', 'intentional_wakefulness', 'phone_sleep_delay']
    await saveDailyEntry(draft({ lastNightSleep: { issues } }))
    const loaded = await loadDailyEntry(D)
    expect(loaded?.lastNightSleep.issues).toEqual(issues)
  })

  it('(7) sleep_late 코드는 유지되고 새 라벨을 쓴다', () => {
    expect(SLEEP_ISSUE_LABEL.get('sleep_late')).toBe('평소보다 늦게 잠들었어요')
    expect(SLEEP_CODE_TO_GROUP.sleep_late).toBe('sleep_schedule')
  })

  it('(8) sleep_onset_difficulty 저장·복원', async () => {
    await saveDailyEntry(draft({ lastNightSleep: { hours: 6, quality: 4, issues: ['sleep_onset_difficulty'] } }))
    const loaded = await loadDailyEntry(D)
    expect(loaded?.lastNightSleep.issues).toContain('sleep_onset_difficulty')
    expect(loaded?.lastNightSleep.hours).toBe(6)
  })

  it('(9) 수면 코드별 factorGroup 매핑(다음 단계 연결용)', () => {
    expect(SLEEP_CODE_TO_GROUP).toMatchObject({
      sleep_late: 'sleep_schedule',
      bedtime_reluctance: 'bedtime_resistance',
      bedtime_delay: 'bedtime_delay',
      intentional_wakefulness: 'bedtime_delay',
      phone_sleep_delay: 'bedtime_delay',
      sleep_onset_difficulty: 'sleep_onset',
    })
  })

  it('(10) 서로 다른 수면 eventCode가 하나로 합쳐지지 않는다', async () => {
    const issues = ['bedtime_delay', 'intentional_wakefulness', 'phone_sleep_delay']
    await saveDailyEntry(draft({ lastNightSleep: { issues } }))
    const log = await dailyLogRepository.getByDate(D)
    expect(new Set(log?.lastNightSleep?.issues)).toEqual(new Set(issues)) // 3개 코드 각각 보존
  })

  it('(22) 수면 라벨에 진단명·내부 코드가 없다', () => {
    for (const g of SLEEP_ISSUE_GROUPS) for (const i of g.items) expect(i.label).not.toMatch(FORBIDDEN)
  })

  it('새 취침 전 그룹은 이번 단계 분석 노출에서 제외된다(기존 분석 불변)', () => {
    const log = { lastNightSleep: { issues: ['bedtime_delay', 'sleep_late'] } } as never
    const exp = getSleepExposureForDate(log, [])
    expect(exp.factorGroups).toContain('sleep_schedule') // 기존 그룹만
    expect(exp.factorGroups).not.toContain('bedtime_delay') // 새 그룹은 아직 미노출
  })

  it('(13) 옛 sleep eventLog가 안전하게 수면 노출로 읽힌다', () => {
    const legacy = [{ eventCode: 'sleep_waking', mappedFactorGroup: 'sleep_quality' }] as never
    const exp = getSleepExposureForDate(undefined, legacy)
    expect(exp.source).toBe('legacy')
    expect(exp.factorGroups).toContain('sleep_quality')
  })
})

describe('일반 사건 UI 중복 제거', () => {
  it('(11) 수면 코드와 phone_in_bed는 일반 사건 목록에서 숨긴다', () => {
    for (const c of ['sleep_late', 'sleep_waking', 'sleep_onset_difficulty', 'bedtime_delay', 'phone_in_bed']) {
      expect(EVENT_LIST_HIDDEN_CODES.has(c)).toBe(true)
    }
    // phone_in_bed는 재저장 stripping을 피하려 LAST_NIGHT_SLEEP_CODES에는 없음
    expect(LAST_NIGHT_SLEEP_CODES.has('phone_in_bed')).toBe(false)
  })

  it('(12) late_screen은 일반 사건으로 유지된다', () => {
    expect(EVENT_LIST_HIDDEN_CODES.has('late_screen')).toBe(false)
    expect(EVENT_CATALOG.some((e) => e.code === 'late_screen')).toBe(true)
  })
})

describe('저장·호환·Calendar', () => {
  it('(15/18) JSON export→초기화→import 후 마음·수면 필드 보존', async () => {
    await saveDailyEntry(draft({ mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay', 'sleep_onset_difficulty'] }, catalogEventCodes: ['work_heavy'], memo: '유지' }))
    const payload = await buildExportPayload()
    await resetDatabase()
    await importAllData(payload)
    const log = await dailyLogRepository.getByDate(D)
    expect(log?.mindSignalCodes).toEqual(['thought_loop'])
    expect(log?.lastNightSleep?.issues).toEqual(['bedtime_delay', 'sleep_onset_difficulty'])
    // 재저장해도 손실 없음
    const loaded = await loadDailyEntry(D)
    await saveDailyEntry({ ...loaded!, memo: '수정' })
    const re = await dailyLogRepository.getByDate(D)
    expect(re?.mindSignalCodes).toEqual(['thought_loop'])
    expect(re?.lastNightSleep?.issues).toEqual(['bedtime_delay', 'sleep_onset_difficulty'])
  })

  it('(16) Calendar 상세에 마음 신호와 수면이 원본으로 노출된다', async () => {
    await saveDailyEntry(draft({ mindSignalCodes: ['thought_loop', 'need_time_alone'], lastNightSleep: { hours: 5, quality: 3, issues: ['phone_sleep_delay', 'sleep_late'] } }))
    const detail = await getCalendarDayDetail(D)
    expect(mindSignalLabels(detail.dailyLog?.mindSignalCodes)).toEqual(['같은 생각이 계속 맴돌았어요', '혼자 정리할 시간이 필요했어요'])
    const sleepLabels = (detail.dailyLog?.lastNightSleep?.issues ?? []).map((c) => SLEEP_ISSUE_LABEL.get(c))
    expect(sleepLabels).toContain('폰을 보며 잠을 미뤘어요')
    expect(sleepLabels).toContain('평소보다 늦게 잠들었어요')
  })

  it('(17) 마음 신호 미입력 시 라벨이 비어 섹션이 숨는다', async () => {
    await saveDailyEntry(draft({ bodyEnergyLevel: 'empty' }))
    const detail = await getCalendarDayDetail(D)
    expect(mindSignalLabels(detail.dailyLog?.mindSignalCodes)).toEqual([])
  })

  it('(19) DailyLogInput에 mindSignalCodes가 optional로 흐른다(스키마 변경 없음)', async () => {
    // 옛 기록(mindSignalCodes 없음)도 정상 로드
    await saveDailyEntry(draft({ stateCodes: ['sad'] }))
    const log = await dailyLogRepository.getByDate(D)
    delete (log as { mindSignalCodes?: unknown }).mindSignalCodes
    const loaded = await loadDailyEntry(D)
    expect(loaded?.mindSignalCodes).toEqual([]) // 없으면 빈 배열 draft
  })
})
