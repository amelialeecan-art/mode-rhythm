import { describe, expect, it, vi } from 'vitest'
import { presentTodayCurrentFlow, createSnapshotFlowLoader } from '../todayCurrentFlow'
import type { EpisodeInsightSnapshot } from '../../../data/services/episodeInsightService'
import type { EpisodeTimeline, TimelineRun, EpisodeTimelineSource, RunBoundary } from '../../../engine'

const TODAY = '2026-08-20'
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

function run(key: string, source: EpisodeTimelineSource, start: string, end: string, endBoundary: RunBoundary): TimelineRun {
  return { key, source, factorGroup: key, startDate: start, endDate: end, validDays: diffDays(start, end) + 1, calendarDays: diffDays(start, end) + 1, dates: [start], startBoundary: 'observed', endBoundary }
}
function episode(p: Partial<EpisodeTimeline> & { runs: TimelineRun[] }): EpisodeTimeline {
  const runs = p.runs
  return {
    id: 'e', startDate: runs[0].startDate, endDate: runs[runs.length - 1].endDate, status: 'ongoing',
    transitions: [], aftereffects: [], recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] },
    leadingRunKeys: [runs[0].key], followupRunKeys: runs.slice(1).map((r) => r.key), ...p,
  }
}
const snap = (recentEpisode: EpisodeTimeline | null): EpisodeInsightSnapshot => ({
  recentEpisode, repeatedMotifs: [], currentMotifMatches: [], analysisRange: { recentStartDate: '2026-05-23', motifStartDate: '2025-08-21', endDate: TODAY },
})
const line = (ep: EpisodeTimeline | null) => presentTodayCurrentFlow(snap(ep), TODAY)

const FORBIDDEN = /episode|motif|transition|factor|metric|domain|state_|thought_loop|bedtime_delay|confidence|evidence|몸 에너지|생활기능|감정 부담|사회적 여유|걱정 기록|누적 노출|편이에요|가능성이|추정|경향|위험도|증상|진단|다음에는|곧|예상돼요|nightOf/i

/* =====================================================================
   표시 조건
   ===================================================================== */
describe('presentTodayCurrentFlow — 표시 조건', () => {
  it('(1) 오늘과 연결된 ongoing 흐름이면 한 줄을 만든다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-17', '2026-08-19', 'observed'), run('state_tired', 'state', '2026-08-20', '2026-08-20', 'range_edge')],
      leadingRunKeys: ['thought_loop'], followupRunKeys: ['state_tired'],
    })
    const s = line(ep)!
    expect(s).toContain('같은 생각이 계속 맴돌았')
    expect(s).toContain('오늘은 몸이 쉽게 지쳤')
  })

  it('(2) 어젯밤 수면 + 오늘 직접 상태를 정확히 연결한다(nightOf 재이동 없음)', () => {
    const ep = episode({
      runs: [run('bedtime_delay', 'sleep', '2026-08-19', '2026-08-19', 'range_edge'), run('state_tired', 'state', '2026-08-20', '2026-08-20', 'range_edge')],
      leadingRunKeys: ['bedtime_delay'], followupRunKeys: ['state_tired'],
    })
    const s = line(ep)!
    expect(s).toBe('자는 걸 미뤘고, 오늘은 몸이 쉽게 지쳤어요.')
  })

  it('(3) completed 흐름이면 표시하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-17', '2026-08-19', 'observed'), run('state_tired', 'state', '2026-08-19', '2026-08-20', 'observed')],
      status: 'completed', completionConfirmedDate: '2026-08-22',
    })
    expect(line(ep)).toBeNull()
  })

  it('(4) missing-gap로 종료 확인이 끊긴 흐름이면 표시하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-17', '2026-08-18', 'missing_gap'), run('state_tired', 'state', '2026-08-20', '2026-08-20', 'range_edge')],
      leadingRunKeys: ['thought_loop'], followupRunKeys: ['state_tired'],
    })
    expect(line(ep)).toBeNull()
  })

  it('(5) 오래전에 끝난 조각이 range edge로 남은 경우 표시하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-10', '2026-08-11', 'observed'), run('state_tired', 'state', '2026-08-14', '2026-08-15', 'range_edge')],
      leadingRunKeys: ['thought_loop'], followupRunKeys: ['state_tired'],
    })
    expect(line(ep)).toBeNull() // range_edge 신호의 종료일이 오늘/어젯밤이 아님
  })

  it('(6) 신호가 하나뿐이면 표시하지 않는다', () => {
    const ep = episode({ runs: [run('state_tired', 'state', '2026-08-19', '2026-08-20', 'range_edge')], leadingRunKeys: ['state_tired'], followupRunKeys: [] })
    expect(line(ep)).toBeNull()
  })

  it('(7) 의미상 같은 신호 두 개뿐이면 표시하지 않는다', () => {
    const ep = episode({
      runs: [run('mind_would_not_rest', 'mind', '2026-08-18', '2026-08-19', 'observed'), run('state_mind_busy', 'state', '2026-08-20', '2026-08-20', 'range_edge')],
      leadingRunKeys: ['mind_would_not_rest'], followupRunKeys: ['state_mind_busy'],
    })
    expect(line(ep)).toBeNull()
  })

  it('(11/12) 내부 key·금지 표현이 없다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-17', '2026-08-19', 'observed'), run('state_people_hard', 'state', '2026-08-20', '2026-08-20', 'range_edge')],
      leadingRunKeys: ['thought_loop'], followupRunKeys: ['state_people_hard'],
    })
    expect(line(ep)!).not.toMatch(FORBIDDEN)
  })
})

/* =====================================================================
   문장 형태
   ===================================================================== */
describe('presentTodayCurrentFlow — 문장 형태', () => {
  const many = () =>
    episode({
      runs: [
        run('thought_loop', 'mind', '2026-08-16', '2026-08-18', 'observed'),
        run('bedtime_delay', 'sleep', '2026-08-18', '2026-08-19', 'range_edge'),
        run('sleep_late', 'sleep', '2026-08-19', '2026-08-19', 'range_edge'),
        run('state_tired', 'state', '2026-08-20', '2026-08-20', 'range_edge'),
      ],
      leadingRunKeys: ['thought_loop'], followupRunKeys: ['bedtime_delay', 'sleep_late', 'state_tired'],
    })

  it('(8/9) 대표 신호 최대 2개 · 전체 한 문장', () => {
    const s = line(many())!
    expect((s.match(/\./g) ?? []).length).toBe(1) // 한 문장
    expect(s).not.toContain('\n')
    // 첫 신호 + 오늘 신호 2개만. 중간 신호(늦게 잠들었/자주 등)는 넣지 않는다.
    expect(s).toContain('같은 생각이 계속 맴돌았')
    expect(s).toContain('오늘은 몸이 쉽게 지쳤')
    expect(s).not.toContain('평소보다 늦게 잠들었')
  })

  it('(10) 다음 변화 예측 문구가 없다', () => {
    expect(line(many())!).not.toMatch(/다음에는|곧|예상|가능성|할 수 있어요/)
  })
})

/* =====================================================================
   안전 로더
   ===================================================================== */
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createSnapshotFlowLoader', () => {
  it('(16/18) load()마다 fetch 1회', async () => {
    const fetchSnapshot = vi.fn(async () => snap(null))
    const loader = createSnapshotFlowLoader(fetchSnapshot, () => {})
    await loader.load()
    await loader.load()
    expect(fetchSnapshot).toHaveBeenCalledTimes(2)
  })

  it('(19) 오래된 응답이 최신 결과를 덮지 않는다', async () => {
    const d1 = deferred<number>()
    const d2 = deferred<number>()
    const queue = [d1.promise, d2.promise]
    const applied: number[] = []
    const loader = createSnapshotFlowLoader(() => queue.shift()!, (v) => applied.push(v))
    void loader.load()
    void loader.load()
    d2.resolve(2)
    await flush()
    d1.resolve(1)
    await flush()
    expect(applied).toEqual([2]) // 최신(req2)만 반영
  })

  it('(20) dispose 후에는 apply하지 않는다', async () => {
    const d = deferred<number>()
    const apply = vi.fn()
    const loader = createSnapshotFlowLoader(() => d.promise, apply)
    void loader.load()
    loader.dispose()
    d.resolve(1)
    await flush()
    expect(apply).not.toHaveBeenCalled()
  })

  it('(21) 실패 시 apply하지 않아 기존 값을 유지한다', async () => {
    const apply = vi.fn()
    const onError = vi.fn()
    const loader = createSnapshotFlowLoader(async () => { throw new Error('boom') }, apply, onError)
    await loader.load()
    expect(apply).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
