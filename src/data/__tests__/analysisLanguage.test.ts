import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getAnalysisViewModel } from '../services/patternAnalysisService'
import { ANALYSIS_METRIC_LABEL, addDaysISO } from '../../engine'

function draft(date: string, p: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...p, date }
}
const END = '2026-08-31'

beforeEach(async () => {
  await resetDatabase()
})

describe('사용자 표시 용어 (부하 → 이해하기 쉬운 말)', () => {
  it('metric 라벨이 교체되고 "부하"가 남지 않는다', () => {
    expect(ANALYSIS_METRIC_LABEL.emotional).toBe('감정 흔들림')
    expect(ANALYSIS_METRIC_LABEL.appetite).toBe('식욕 흔들림')
    expect(ANALYSIS_METRIC_LABEL.sleep).toBe('수면 문제 정도')
    expect(ANALYSIS_METRIC_LABEL.body).toBe('몸 불편')
    expect(ANALYSIS_METRIC_LABEL.rhythm).toBe('오늘의 버거움')
    for (const v of Object.values(ANALYSIS_METRIC_LABEL)) expect(v.includes('부하')).toBe(false)
  })
})

describe('자명/순환 분석 제외 (교차영역은 유지)', () => {
  it('수면 그룹은 "수면 문제 정도(sleep)" 지표로는 안 나오고, 감정 등 교차영역으로는 나온다', async () => {
    // 짝수일: 지난밤 수면 문제(수면시간 짧음+자주 깸) + 감정 흔들림 높음 / 홀수일: 안정
    for (let i = 0; i < 30; i++) {
      const bad = i % 2 === 0
      await saveDailyEntry(
        draft(addDaysISO(addDaysISO(END, -29), i), {
          stateCodes: bad ? ['anxious', 'sad'] : ['calm'],
          overallIntensity: bad ? 'much' : 'some',
          lastNightSleep: bad ? { hours: 4, quality: 3, issues: ['sleep_waking'] } : { issues: [] },
        }),
      )
    }
    const vm = await getAnalysisViewModel({ endDate: END, analysisDays: 60 })
    const sleepGroups = new Set(['sleep_deficit', 'sleep_quality', 'sleep_schedule'])
    const sleepCards = vm.factorPatterns.filter((f) => sleepGroups.has(f.factorGroup))

    // 자명 제외: 수면 그룹이 sleep 지표로는 등장하지 않는다
    expect(sleepCards.every((f) => f.metric !== 'sleep')).toBe(true)
    // 교차영역 유지: 수면 그룹이 감정 흔들림 지표로 등장한다
    expect(sleepCards.some((f) => f.metric === 'emotional')).toBe(true)
  }, 30000)
})
