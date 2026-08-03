import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDatabase } from '../reset'
import { dailyLogRepository, eventLogRepository, recoveryLogRepository } from '../repositories'
import { getEpisodeInsightSnapshot } from '../services/episodeInsightService'
import { addDaysISO } from '../../engine'
import type { DailyLogInput } from '../models'

const TODAY = '2026-08-20'

const ZERO = {
  moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0, calm: 0, energy: 0, focus: 0, selfCriticism: 0,
  impulsivity: 0, appetite: 0, sweetCraving: 0, saltyCraving: 0, bingeUrge: 0, bodyDiscomfort: 0, pain: 0, bloating: 0,
  fatigue: 0, headache: 0, digestion: 0,
}
const putDay = (date: string, partial: Partial<DailyLogInput> = {}) => dailyLogRepository.upsert({ date, ...ZERO, ...partial })

/**
 * completed 3단계 흐름을 저장한다. run 시작일: thought_loop=base, bedtime_delay=base+1(nightOf),
 * state_daily_tasks_hard=base+1+stateLag. 이후 안정 2일로 completed.
 */
async function seedCompletedFlow(base: string, stateLag: 1 | 2) {
  const d = (n: number) => addDaysISO(base, n)
  await putDay(d(0), { mindSignalCodes: ['thought_loop'] })
  await putDay(d(1), {})
  // bedtime_delay는 D2 아침 기록(nightOf D1). stateLag=1이면 state도 D2, =2이면 D3.
  await putDay(d(2), { lastNightSleep: { issues: ['bedtime_delay'] }, ...(stateLag === 1 ? { functionLevel: 4 as const } : {}) })
  if (stateLag === 2) await putDay(d(3), { functionLevel: 4 })
  const stateDay = stateLag === 1 ? 2 : 3
  await putDay(d(stateDay + 1), {}) // 안정 1
  await putDay(d(stateDay + 2), {}) // 안정 2 → completed
}

/** 가장 최근 ongoing 흐름(thought_loop → bedtime_delay, state 아직 없음). bedtime_delay가 today까지. */
async function seedOngoingRecent() {
  await putDay(addDaysISO(TODAY, -2), { mindSignalCodes: ['thought_loop'] }) // 8/18
  await putDay(addDaysISO(TODAY, -1), {}) // 8/19 (thought_loop observed 종료)
  await putDay(TODAY, { lastNightSleep: { issues: ['bedtime_delay'] } }) // nightOf 8/19 → range_edge → ongoing
}

async function seedThreeCompleted() {
  await seedCompletedFlow('2025-09-01', 1)
  await seedCompletedFlow('2025-11-01', 2)
  await seedCompletedFlow('2026-01-05', 1)
}

beforeEach(async () => {
  await resetDatabase()
})

describe('getEpisodeInsightSnapshot', () => {
  it('(2) 빈 저장소면 안전한 빈 snapshot', async () => {
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode).toBeNull()
    expect(snap.repeatedMotifs).toEqual([])
    expect(snap.currentMotifMatches).toEqual([])
    expect(snap.analysisRange.endDate).toBe(TODAY)
    expect(snap.analysisRange.recentStartDate).toBe(addDaysISO(TODAY, -89))
    expect(snap.analysisRange.motifStartDate).toBe(addDaysISO(TODAY, -364))
  })

  it('(3/4) 실제 저장 데이터에서 recentEpisode를 반환한다(한 번의 흐름도)', async () => {
    await seedOngoingRecent()
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode).not.toBeNull()
    expect(snap.recentEpisode!.leadingRunKeys).toContain('thought_loop')
  })

  it('(5) completed 3개면 repeatedMotif 반환', async () => {
    await seedThreeCompleted()
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs).toHaveLength(1)
    expect(snap.repeatedMotifs[0].sequenceKeys).toEqual(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3)
  })

  it('(6) completed 2개면 repeatedMotif 없음', async () => {
    await seedCompletedFlow('2025-09-01', 1)
    await seedCompletedFlow('2025-11-01', 1)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs).toEqual([])
  })

  it('(7/8) ongoing은 성립 횟수에 안 들고, recentEpisode(ongoing)는 부분 매칭된다', async () => {
    await seedThreeCompleted()
    await seedOngoingRecent()
    const snap = await getEpisodeInsightSnapshot(TODAY)
    // ongoing이 있어도 성립 횟수는 3.
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3)
    expect(snap.recentEpisode!.status).toBe('ongoing')
    const mm = snap.currentMotifMatches.find((m) => m.matchedKeys.join('>') === 'thought_loop>bedtime_delay')!
    expect(mm.matchedKeys).toEqual(['thought_loop', 'bedtime_delay'])
    expect(mm.completeMatch).toBe(false)
    expect(mm).not.toHaveProperty('nextExpectedKey')
  })

  it('(9) completed recentEpisode면 currentMotifMatches는 빈 배열', async () => {
    // 최근 90일 안에서 완결된 흐름(신호 종료 8/13, 안정 8/14·8/15)
    await seedCompletedFlow('2026-08-10', 1)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode!.status).toBe('completed')
    expect(snap.currentMotifMatches).toEqual([])
  })

  it('(17) 최근 90일 밖 흐름은 recentEpisode로 반환하지 않는다', async () => {
    await seedCompletedFlow('2026-01-05', 1) // 90일보다 과거
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode).toBeNull()
  })

  it('(18) motif 365일 밖 흐름은 반복 성립에서 제외', async () => {
    // 3개 중 하나를 365일 밖(2025-07)으로 두면 2개만 유효 → motif 없음
    await seedCompletedFlow('2025-07-01', 1) // motifStart(2025-08-21)보다 과거
    await seedCompletedFlow('2025-11-01', 1)
    await seedCompletedFlow('2026-01-05', 1)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs).toEqual([])
  })

  it('(19) 미래 기록은 제외한다', async () => {
    await seedThreeCompleted()
    // 미래(today 이후) ongoing 흐름을 넣어도 recentEpisode/모티프에 영향 없음
    await putDay(addDaysISO(TODAY, 3), { mindSignalCodes: ['thought_loop'] })
    await putDay(addDaysISO(TODAY, 5), { lastNightSleep: { issues: ['bedtime_delay'] } })
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode).toBeNull() // 미래 흐름은 recentEpisode가 되지 않음
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3)
  })

  it('(22) 원본을 엔진 단계마다 반복 조회하지 않는다(소스별 1회)', async () => {
    await seedThreeCompleted()
    const dSpy = vi.spyOn(dailyLogRepository, 'listByDateRange')
    const eSpy = vi.spyOn(eventLogRepository, 'listByDateRange')
    const rSpy = vi.spyOn(recoveryLogRepository, 'listByDateRange')
    await getEpisodeInsightSnapshot(TODAY)
    expect(dSpy).toHaveBeenCalledTimes(1)
    expect(eSpy).toHaveBeenCalledTimes(1)
    expect(rSpy).toHaveBeenCalledTimes(1)
    dSpy.mockRestore()
    eSpy.mockRestore()
    rSpy.mockRestore()
  })

  it('(23) 서비스는 repository write를 호출하지 않는다', async () => {
    await seedThreeCompleted()
    const upsertSpy = vi.spyOn(dailyLogRepository, 'upsert')
    const evAddSpy = vi.spyOn(eventLogRepository, 'bulkAdd')
    const recAddSpy = vi.spyOn(recoveryLogRepository, 'add')
    await getEpisodeInsightSnapshot(TODAY)
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(evAddSpy).not.toHaveBeenCalled()
    expect(recAddSpy).not.toHaveBeenCalled()
    upsertSpy.mockRestore()
    evAddSpy.mockRestore()
    recAddSpy.mockRestore()
  })

  it('(14) RecoveryLog의 nearby action이 recentEpisode 회복 참조로 연결된다', async () => {
    // 최근 90일 안 완결 흐름 + 회복일 근처 action
    await seedCompletedFlow('2026-08-10', 1) // state 8/12, 회복 8/13
    await recoveryLogRepository.add({ date: '2026-08-13', actionCode: 'rest_alone', actionLabel: '혼자 쉼', category: 'rest', effect: 'helped' } as never)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.recentEpisode!.recovery.recoveryStartDate).toBe('2026-08-13')
    expect(snap.recentEpisode!.recovery.nearbyRecoveryActionKeys).toContain('rest_alone')
  })

  it('(13) EventLog가 서비스에 연결된다(무관 사건은 흐름 대표에서 제외)', async () => {
    await seedOngoingRecent()
    await eventLogRepository.bulkAdd([
      { date: addDaysISO(TODAY, -2), eventCode: 'work_heavy', eventLabel: '업무 과중', category: 'work', timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'work' } as never,
    ])
    const snap = await getEpisodeInsightSnapshot(TODAY)
    // 사건이 있어도 서비스가 정상 동작하고 흐름 대표는 thought_loop 시작.
    expect(snap.recentEpisode!.leadingRunKeys).toContain('thought_loop')
  })

  it('(24) unknown code가 있어도 snapshot을 생성한다', async () => {
    await seedThreeCompleted()
    await putDay(addDaysISO(TODAY, -3), { mindSignalCodes: ['totally_unknown_code'], lastNightSleep: { issues: ['weird_sleep_code'] } })
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3) // unknown은 무시되고 전체 실패 없음
  })

  it('(1) motif 입력 순서와 무관하게 서비스 결과가 안정적이다', async () => {
    await seedThreeCompleted()
    const a = await getEpisodeInsightSnapshot(TODAY)
    const b = await getEpisodeInsightSnapshot(TODAY)
    expect(b.repeatedMotifs).toEqual(a.repeatedMotifs)
  })

  it('(20/21) 월·연 경계를 넘는 흐름도 정확히 처리한다', async () => {
    // 연도 경계: 2025-12-30 시작 흐름
    await seedCompletedFlow('2025-12-30', 1)
    await seedCompletedFlow('2026-02-01', 1)
    await seedCompletedFlow('2026-03-01', 1)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3)
    expect(snap.repeatedMotifs[0].typicalLagRanges[0]).toEqual({ min: 1, max: 1 })
  })
})

/* =====================================================================
   고정 통합 QA (스펙 §12)
   ===================================================================== */
describe('고정 통합 QA', () => {
  beforeEach(async () => {
    await seedCompletedFlow('2025-09-01', 1)
    await seedCompletedFlow('2025-11-01', 2)
    await seedCompletedFlow('2026-01-05', 1)
    await seedOngoingRecent()
  })

  it('기대 구조를 반환한다', async () => {
    const snap = await getEpisodeInsightSnapshot(TODAY)
    // 반복 motif 1개
    expect(snap.repeatedMotifs).toHaveLength(1)
    const m = snap.repeatedMotifs[0]
    expect(m.sequenceKeys).toEqual(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])
    expect(m.occurrenceCount).toBe(3)
    // recentEpisode = ongoing 흐름
    expect(snap.recentEpisode!.status).toBe('ongoing')
    // 현재까지 부분 매칭
    const mm = snap.currentMotifMatches.find((x) => x.motifId === m.id)!
    expect(mm.matchedKeys).toEqual(['thought_loop', 'bedtime_delay'])
    expect(mm.completeMatch).toBe(false)
    expect(mm).not.toHaveProperty('nextExpectedKey')
  })
})
