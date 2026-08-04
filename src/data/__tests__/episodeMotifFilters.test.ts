import { describe, expect, it } from 'vitest'
import { filterExternallyExplainedMotifs } from '../services/episodeMotifFilters'
import type { CycleLog } from '../models'
import type { EpisodeTimeline, RepeatedEpisodeMotif, MotifOccurrence, TimelineRun, EpisodeTimelineSource } from '../../engine'

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const SEQ = ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard']

const occ = (episodeId: string, date: string): MotifOccurrence => ({
  episodeId, episodeStartDate: date, episodeEndDate: addDays(date, 2), sequenceStartDate: date, lagDays: [1, 1], matchedRunKeys: SEQ,
})
const motif = (occs: MotifOccurrence[]): RepeatedEpisodeMotif => ({
  id: 'm', sequenceKeys: SEQ, occurrenceCount: occs.length, occurrences: occs, typicalLagRanges: [{ min: 1, max: 1 }, { min: 1, max: 2 }], latestOccurrenceDate: occs[occs.length - 1].sequenceStartDate,
})
const run = (key: string, source: EpisodeTimelineSource, s: string, e: string): TimelineRun => ({
  key, source, factorGroup: key, startDate: s, endDate: e, validDays: 1, calendarDays: 1, dates: [s], startBoundary: 'observed', endBoundary: 'observed',
})
const cyc = (date: string): CycleLog => ({ date, periodStart: true, periodEnd: false, createdAt: '', updatedAt: '' })
const kept = (motifs: RepeatedEpisodeMotif[]) => motifs.length === 1

/* =====================================================================
   A. 요일
   ===================================================================== */
describe('요일 설명 제외', () => {
  it('(1) 세 occurrence가 모두 같은 요일이면 숨긴다', () => {
    const m = motif([occ('a', '2026-08-03'), occ('b', '2026-08-10'), occ('c', '2026-08-17')]) // 모두 같은 요일(7일 간격)
    expect(filterExternallyExplainedMotifs([m], [], [])).toHaveLength(0)
  })

  it('(2) 요일이 하나라도 다르면 유지한다', () => {
    const m = motif([occ('a', '2026-08-03'), occ('b', '2026-08-10'), occ('c', '2026-08-11')]) // 마지막만 다른 요일
    expect(kept(filterExternallyExplainedMotifs([m], [], []))).toBe(true)
  })
})

/* =====================================================================
   B. 생리 구간
   ===================================================================== */
describe('생리 구간 설명 제외', () => {
  // 각 occurrence 날짜가 그날 생리 시작(=생리 중)이 되도록 period start를 둔다.
  const cycleLogs = [cyc('2025-12-05'), cyc('2026-01-05'), cyc('2026-02-05'), cyc('2026-03-05')]

  it('(3) 모든 occurrence가 같은 생리 구간이고 정보가 있으면 숨긴다', () => {
    const m = motif([occ('a', '2026-01-05'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(filterExternallyExplainedMotifs([m], [], cycleLogs)).toHaveLength(0)
  })

  it('(4) 생리 정보가 하나라도 없으면 생리 이유로 숨기지 않는다', () => {
    // 첫 occurrence(2025-06-01)는 이전 period start가 없어 생리 정보 없음 → 유지
    const m = motif([occ('a', '2025-06-01'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(kept(filterExternallyExplainedMotifs([m], [], cycleLogs))).toBe(true)
  })

  it('cycleLogs가 없으면 생리로 숨기지 않는다', () => {
    const m = motif([occ('a', '2026-01-05'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(kept(filterExternallyExplainedMotifs([m], [], []))).toBe(true)
  })
})

/* =====================================================================
   C. 동일 연결 사건
   ===================================================================== */
describe('동일 사건 설명 제외', () => {
  // 사건이 첫 신호와 같은 날 시작 + transition 연결.
  const evEp = (id: string, base: string, eventKey: string, connected = true): EpisodeTimeline => ({
    id, startDate: base, endDate: addDays(base, 2), status: 'completed',
    runs: [run(eventKey, 'event', base, base), run('thought_loop', 'mind', base, addDays(base, 2))],
    transitions: connected ? [{ fromKey: eventKey, toKey: 'thought_loop', fromStartDate: base, toStartDate: base, lagDays: 0, overlapDays: 0 }] : [],
    aftereffects: [], recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] }, leadingRunKeys: ['thought_loop'], followupRunKeys: [],
  })

  it('(5) 모든 occurrence가 같은 연결 사건 직후면 숨긴다', () => {
    const eps = [evEp('a', '2026-01-05', 'work_deadline'), evEp('b', '2026-02-05', 'work_deadline'), evEp('c', '2026-03-05', 'work_deadline')]
    const m = motif([occ('a', '2026-01-05'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(filterExternallyExplainedMotifs([m], eps, [])).toHaveLength(0)
  })

  it('(6) eventKey가 하나라도 다르면 유지한다', () => {
    const eps = [evEp('a', '2026-01-05', 'work_deadline'), evEp('b', '2026-02-05', 'work_deadline'), evEp('c', '2026-03-05', 'travel')]
    const m = motif([occ('a', '2026-01-05'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(kept(filterExternallyExplainedMotifs([m], eps, []))).toBe(true)
  })

  it('(7) 연결되지 않은(transition 없는) 사건이면 유지한다', () => {
    const eps = [evEp('a', '2026-01-05', 'work_deadline', false), evEp('b', '2026-02-05', 'work_deadline', false), evEp('c', '2026-03-05', 'work_deadline', false)]
    const m = motif([occ('a', '2026-01-05'), occ('b', '2026-02-05'), occ('c', '2026-03-05')])
    expect(kept(filterExternallyExplainedMotifs([m], eps, []))).toBe(true)
  })
})

/* =====================================================================
   회귀
   ===================================================================== */
describe('회귀', () => {
  it('(10) 설명되지 않는 반복은 그대로 유지(요일·생리·사건 아님)', () => {
    const m = motif([occ('a', '2026-01-06'), occ('b', '2026-02-10'), occ('c', '2026-03-19')]) // 요일 제각각, cycle/event 없음
    const out = filterExternallyExplainedMotifs([m], [], [])
    expect(out).toHaveLength(1)
    expect(out[0].occurrenceCount).toBe(3)
    expect(out[0].typicalLagRanges).toEqual([{ min: 1, max: 1 }, { min: 1, max: 2 }])
  })
})
