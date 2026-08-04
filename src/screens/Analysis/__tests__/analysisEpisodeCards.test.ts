import { describe, expect, it, vi } from 'vitest'
import { composeAnalysisEpisodeCards, createEpisodeCardLoader, type AnalysisEpisodeCards } from '../analysisEpisodeCards'
import type { EpisodeInsightSnapshot } from '../../../data/services/episodeInsightService'
import type { EpisodeTimeline, TimelineRun, RepeatedEpisodeMotif, MotifMatch, EpisodeTimelineSource, RunBoundary } from '../../../engine'

const run = (key: string, source: EpisodeTimelineSource, s: string, e: string, eb: RunBoundary = 'observed'): TimelineRun => ({
  key, source, factorGroup: key, startDate: s, endDate: e, validDays: 1, calendarDays: 1, dates: [s], startBoundary: 'observed', endBoundary: eb,
})
const episode = (p: Partial<EpisodeTimeline> & { runs: TimelineRun[] }): EpisodeTimeline => ({
  id: 'e', startDate: p.runs[0].startDate, endDate: p.runs[p.runs.length - 1].endDate, status: 'completed',
  transitions: [], aftereffects: [], recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] },
  leadingRunKeys: [p.runs[0].key], followupRunKeys: p.runs.slice(1).map((r) => r.key), ...p,
})
const motif = (keys: string[], ranges: { min: number; max: number }[]): RepeatedEpisodeMotif => ({
  id: `m-${keys.join('_')}`, sequenceKeys: keys, occurrenceCount: 3, occurrences: [], typicalLagRanges: ranges, latestOccurrenceDate: '2026-07-20',
})
const snap = (p: Partial<EpisodeInsightSnapshot>): EpisodeInsightSnapshot => ({
  recentEpisode: null, repeatedMotifs: [], currentMotifMatches: [],
  analysisRange: { recentStartDate: '2026-05-23', motifStartDate: '2025-08-21', endDate: '2026-08-20' }, ...p,
})
const flowEp = () =>
  episode({
    runs: [
      run('thought_loop', 'mind', '2026-08-06', '2026-08-08'),
      run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08'),
      run('sleep_late', 'sleep', '2026-08-08', '2026-08-09'),
      run('state_tired', 'state', '2026-08-09', '2026-08-10'),
    ],
    leadingRunKeys: ['thought_loop'],
    followupRunKeys: ['bedtime_delay', 'sleep_late', 'state_tired'],
    completionConfirmedDate: '2026-08-12',
    aftereffects: [{ sourceKey: 'thought_loop', remainingKey: 'sleep_late', sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-09', extraDays: 1 }],
    recovery: { recoveryStartDate: '2026-08-11', firstRecoveredKeys: ['state_tired'], laterRecoveredKeys: [], nearbyRecoveryActionKeys: ['rest_alone'] },
  })

describe('composeAnalysisEpisodeCards', () => {
  it('(4) 빈 snapshot이면 카드 없음 · 기존 누적 카드 유지', () => {
    const c = composeAnalysisEpisodeCards(snap({}))
    expect(c.recentFlow).toBeNull()
    expect(c.repeatedFlow).toBeNull()
    expect(c.hideCumulative).toBe(false)
  })

  it('(5) recentFlow만 있으면 카드 1개', () => {
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: flowEp() }))
    expect(c.recentFlow).not.toBeNull()
    expect(c.repeatedFlow).toBeNull()
  })

  it('(6) repeatedFlow만 있으면 카드 1개', () => {
    const c = composeAnalysisEpisodeCards(snap({ repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    expect(c.recentFlow).toBeNull()
    expect(c.repeatedFlow).not.toBeNull()
  })

  it('(7) 둘 다 있으면 최대 카드 2개', () => {
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: flowEp(), repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    const cardCount = (c.recentFlow ? 1 : 0) + (c.repeatedFlow ? 1 : 0)
    expect(cardCount).toBe(2)
  })

  it('(8/9) aftereffect·recovery는 recentFlow 카드 내부 구분 영역', () => {
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: flowEp() }))
    expect(c.recentFlow!.aftereffect!.subtitle).toBe('먼저 줄고, 더 남은 것')
    expect(c.recentFlow!.recovery!.subtitle).toBe('돌아오기 시작한 때')
    expect(c.recentFlow!.recovery!.lines[0]).toContain('11일')
  })

  it('(10/11) aftereffect·recovery가 없으면 구분 영역도 없음', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-07'), run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
      status: 'ongoing',
    })
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: ep }))
    expect(c.recentFlow!.aftereffect).toBeUndefined()
    expect(c.recentFlow!.recovery).toBeUndefined()
  })

  it('(12) currentMatch는 repeatedFlow 카드 내부 보조 영역', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-18', '2026-08-18'), run('bedtime_delay', 'sleep', '2026-08-19', '2026-08-19', 'range_edge')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
      status: 'ongoing',
    })
    const matches: MotifMatch[] = [{ motifId: 'm', matchedKeys: ['thought_loop', 'bedtime_delay'], completeMatch: false }]
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: ep, currentMotifMatches: matches, repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    expect(c.repeatedFlow!.currentMatch!.subtitle).toBe('이번에도 여기까지 같은 순서였어요')
  })

  it('(13) currentMatch가 없으면 보조 영역 없음', () => {
    const c = composeAnalysisEpisodeCards(snap({ repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    expect(c.repeatedFlow!.currentMatch).toBeUndefined()
  })

  it('(14) 새 흐름 카드가 있으면 기존 누적 카드를 숨긴다', () => {
    expect(composeAnalysisEpisodeCards(snap({ recentEpisode: flowEp() })).hideCumulative).toBe(true)
    expect(composeAnalysisEpisodeCards(snap({ repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] })).hideCumulative).toBe(true)
  })

  it('(15) 새 흐름 카드가 모두 없으면 누적 카드를 숨기지 않는다', () => {
    // 낮은 정보(같은 날 단일 동시발생)라 recentFlow null, motif 없음 → hideCumulative false
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-06'), run('state_tired', 'state', '2026-08-06', '2026-08-06')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
    })
    expect(composeAnalysisEpisodeCards(snap({ recentEpisode: ep })).hideCumulative).toBe(false)
  })

  it('(17) completed 날짜와 완료 확인 날짜가 카드에서 섞이지 않는다', () => {
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: flowEp() }))
    // 신호 종료(8/10)는 회복 문장에 완료 확인일로 쓰이지 않는다.
    expect(c.recentFlow!.recovery!.lines[0]).toContain('12일')
    expect(c.recentFlow!.recovery!.lines[0]).not.toContain('10일')
  })

  it('(18) 미기록 종료를 진행 중으로 단정하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-07'), run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08', 'missing_gap')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
      status: 'ongoing',
    })
    const c = composeAnalysisEpisodeCards(snap({ recentEpisode: ep }))
    expect(c.recentFlow!.status).toContain('확인할 기록이 없어요')
    expect(c.recentFlow!.status).not.toContain('이어지고 있어요')
  })
})

/* =====================================================================
   createEpisodeCardLoader — 진입 1회 / 재계산 / 스테일 / unmount / 오류
   ===================================================================== */
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createEpisodeCardLoader', () => {
  it('(1/3) load()마다 fetchSnapshot을 한 번씩 호출한다', async () => {
    const fetchSnapshot = vi.fn(async () => snap({}))
    const loader = createEpisodeCardLoader(fetchSnapshot, () => {})
    await loader.load()
    expect(fetchSnapshot).toHaveBeenCalledTimes(1) // 진입 1회
    await loader.load()
    expect(fetchSnapshot).toHaveBeenCalledTimes(2) // 다시 계산 +1
  })

  it('(4) 오래된 응답이 최신 결과를 덮지 않는다', async () => {
    const d1 = deferred<EpisodeInsightSnapshot>()
    const d2 = deferred<EpisodeInsightSnapshot>()
    const queue = [d1.promise, d2.promise]
    const applied: (AnalysisEpisodeCards | null)[] = []
    const loader = createEpisodeCardLoader(() => queue.shift()!, (c) => applied.push(c))
    void loader.load() // req1
    void loader.load() // req2 (최신)
    d2.resolve(snap({ recentEpisode: null, repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    await flush()
    d1.resolve(snap({})) // 뒤늦게 도착한 req1
    await flush()
    // req2만 반영: 마지막 apply는 repeatedFlow가 있는 결과여야 한다.
    expect(applied.length).toBe(1)
    expect(applied[0]!.repeatedFlow).not.toBeNull()
  })

  it('(5) dispose 후에는 apply하지 않는다(unmount 후 state update 방지)', async () => {
    const d = deferred<EpisodeInsightSnapshot>()
    const apply = vi.fn()
    const loader = createEpisodeCardLoader(() => d.promise, apply)
    void loader.load()
    loader.dispose()
    d.resolve(snap({}))
    await flush()
    expect(apply).not.toHaveBeenCalled()
  })

  it('(6) 실패 시 apply하지 않아 기존 카드를 유지한다', async () => {
    const apply = vi.fn()
    const onError = vi.fn()
    const loader = createEpisodeCardLoader(async () => { throw new Error('boom') }, apply, onError)
    await loader.load()
    expect(apply).not.toHaveBeenCalled() // 카드 덮어쓰지 않음
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('(7) 성공 시 새 카드로 apply한다', async () => {
    const apply = vi.fn()
    const loader = createEpisodeCardLoader(async () => snap({ recentEpisode: flowEp() }), apply)
    await loader.load()
    expect(apply).toHaveBeenCalledTimes(1)
    expect((apply.mock.calls[0][0] as AnalysisEpisodeCards).recentFlow).not.toBeNull()
  })
})
