import { describe, expect, it } from 'vitest'
import { presentRhythmRepeatedFlow } from '../rhythmRepeatedFlow'
import type { EpisodeInsightSnapshot } from '../../../data/services/episodeInsightService'
import type { RepeatedEpisodeMotif, MotifOccurrence, MotifMatch, EpisodeTimeline } from '../../../engine'

/* ---------------------------------------------------------------------
   fixture 헬퍼 — presenter가 소비하는 필드(sequenceKeys / occurrences.sequenceStartDate
   / typicalLagRanges / occurrenceCount)만 채운다.
   --------------------------------------------------------------------- */
function occ(sequenceStartDate: string): MotifOccurrence {
  return { episodeId: 'e', episodeStartDate: sequenceStartDate, episodeEndDate: sequenceStartDate, sequenceStartDate, lagDays: [], matchedRunKeys: [] }
}
function makeMotif(opts: {
  keys: string[]
  lags: { min: number; max: number }[]
  starts: string[]
  count?: number
  id?: string
}): RepeatedEpisodeMotif {
  // occurrences는 episodeEndDate 오름차순(=starts 오름차순 가정)로 저장된다.
  const occurrences = opts.starts.map(occ)
  return {
    id: opts.id ?? 'm',
    sequenceKeys: opts.keys,
    occurrenceCount: opts.count ?? opts.starts.length,
    occurrences,
    typicalLagRanges: opts.lags,
    latestOccurrenceDate: opts.starts[opts.starts.length - 1],
  }
}
const snap = (motifs: RepeatedEpisodeMotif[], extra?: Partial<EpisodeInsightSnapshot>): EpisodeInsightSnapshot => ({
  recentEpisode: null,
  repeatedMotifs: motifs,
  currentMotifMatches: [],
  analysisRange: { recentStartDate: '2026-05-01', motifStartDate: '2025-08-01', endDate: '2026-08-04' },
  ...extra,
})

// 3단계 반복(예시 문장): 같은 생각 → 다음 날 자는 걸 미룸 → 1~2일 뒤 평소 하던 일이 버거움
const THREE = () =>
  makeMotif({
    keys: ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'],
    lags: [{ min: 1, max: 1 }, { min: 1, max: 2 }],
    starts: ['2026-05-01', '2026-06-10', '2026-07-20'],
    count: 3,
  })
// 2단계 반복
const TWO = () =>
  makeMotif({
    keys: ['thought_loop', 'state_daily_tasks_hard'],
    lags: [{ min: 1, max: 1 }],
    starts: ['2026-05-01', '2026-06-01', '2026-07-01'],
    count: 3,
  })

const FORBIDDEN = /episode|motif|transition|factor|metric|domain|state_|thought_loop|bedtime_delay|confidence|evidence|가능성이|추정|경향|위험도|증상|진단|다음에는|곧|예상돼요|nightOf/i

/* =====================================================================
   카드 개수 · 표시 조건
   ===================================================================== */
describe('presentRhythmRepeatedFlow — 카드 개수', () => {
  it('(1) 반복 1개면 카드 1개', () => {
    expect(presentRhythmRepeatedFlow(snap([THREE()]))).toHaveLength(1)
  })

  it('(2) 반복이 많아도 카드는 최대 2개', () => {
    const many = [
      makeMotif({ keys: ['thought_loop', 'state_tired'], lags: [{ min: 1, max: 1 }], starts: ['2026-05-01', '2026-06-01', '2026-07-01'], id: 'a' }),
      makeMotif({ keys: ['worrying', 'state_people_hard'], lags: [{ min: 1, max: 1 }], starts: ['2026-05-02', '2026-06-02', '2026-07-02'], id: 'b' }),
      makeMotif({ keys: ['bedtime_delay', 'state_focus_hard'], lags: [{ min: 1, max: 1 }], starts: ['2026-05-03', '2026-06-03', '2026-07-03'], id: 'c' }),
    ]
    expect(presentRhythmRepeatedFlow(snap(many))).toHaveLength(2)
  })

  it('(3) 반복이 없으면 섹션 없음(빈 배열)', () => {
    expect(presentRhythmRepeatedFlow(snap([]))).toEqual([])
  })

  it('(4) recentEpisode / currentMotifMatches는 무시하고 repeatedMotifs만 쓴다', () => {
    const withNoise = snap([THREE()], {
      recentEpisode: { id: 'x', status: 'ongoing' } as unknown as EpisodeTimeline,
      currentMotifMatches: [{ motifId: 'm', matchedKeys: ['thought_loop', 'state_tired'], completeMatch: false } as MotifMatch],
    })
    const clean = presentRhythmRepeatedFlow(snap([THREE()]))
    expect(presentRhythmRepeatedFlow(withNoise)).toEqual(clean)
  })
})

/* =====================================================================
   문장 형태
   ===================================================================== */
describe('presentRhythmRepeatedFlow — 문장', () => {
  it('(5) 2단계 문장', () => {
    const [card] = presentRhythmRepeatedFlow(snap([TWO()]))
    expect(card.sentence).toBe('최근 세 번의 비슷한 흐름에서는 같은 생각이 계속 맴돈 다음 날 평소 하던 일이 버거워졌어요.')
  })

  it('(6) 3단계 문장(예시와 동일)', () => {
    const [card] = presentRhythmRepeatedFlow(snap([THREE()]))
    expect(card.sentence).toBe('최근 세 번의 비슷한 흐름에서는 같은 생각이 계속 맴돈 다음 날 자는 걸 미뤘고, 그 뒤 1~2일 안에 평소 하던 일이 버거워졌어요.')
  })

  // 첫 단계 lag 표현을 확인(둘째 단계는 {1,1}로 고정해 "같은 날 동시발생만" 방어에 걸리지 않게 한다).
  const lagSentence = (min: number, max: number) => {
    const m = makeMotif({ keys: ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], lags: [{ min, max }, { min: 1, max: 1 }], starts: ['2026-05-01', '2026-06-01', '2026-07-01'], count: 3 })
    return presentRhythmRepeatedFlow(snap([m]))[0].sentence
  }

  it('(7) lag 0/1/2/3 · 1~2 범위 표현', () => {
    expect(lagSentence(0, 0)).toContain('같은 날')
    expect(lagSentence(1, 1)).toContain('다음 날')
    expect(lagSentence(2, 2)).toContain('이틀 뒤')
    expect(lagSentence(3, 3)).toContain('사흘 뒤')
    expect(lagSentence(1, 2)).toContain('1~2일 뒤')
    // 3단계 두 번째 단계의 범위는 "그 뒤 1~2일 안에"
    expect(presentRhythmRepeatedFlow(snap([THREE()]))[0].sentence).toContain('그 뒤 1~2일 안에')
  })
})

/* =====================================================================
   실제 시작일 줄
   ===================================================================== */
describe('presentRhythmRepeatedFlow — 시작일', () => {
  it('(8) 최근 최대 3번의 시작일만 보여준다', () => {
    const m = makeMotif({
      keys: ['thought_loop', 'state_daily_tasks_hard'],
      lags: [{ min: 1, max: 1 }],
      starts: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'],
      count: 5,
    })
    const { dates } = presentRhythmRepeatedFlow(snap([m]))[0]
    expect(dates).toContain('3월 1일')
    expect(dates).toContain('4월 1일')
    expect(dates).toContain('5월 1일')
    expect(dates).not.toContain('1월 1일')
    expect(dates).not.toContain('2월 1일')
  })

  it('(9) 4번 이상이면 "최근에는"으로 밝힌다', () => {
    const m = makeMotif({
      keys: ['thought_loop', 'state_daily_tasks_hard'],
      lags: [{ min: 1, max: 1 }],
      starts: ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01'],
      count: 4,
    })
    expect(presentRhythmRepeatedFlow(snap([m]))[0].dates).toMatch(/^최근에는 /)
  })

  it('(9b) 3번 이하면 "최근에는" 없이 시작일만', () => {
    expect(presentRhythmRepeatedFlow(snap([THREE()]))[0].dates).toBe('5월 1일 · 6월 10일 · 7월 20일에 시작됐어요.')
  })

  it('(10) 해가 바뀌는 경우 연도를 포함한다', () => {
    const m = makeMotif({
      keys: ['thought_loop', 'state_daily_tasks_hard'],
      lags: [{ min: 1, max: 1 }],
      starts: ['2026-12-20', '2027-01-05', '2027-02-10'],
      count: 3,
    })
    const { dates } = presentRhythmRepeatedFlow(snap([m]))[0]
    expect(dates).toContain('2026년 12월 20일')
    expect(dates).toContain('1월 5일')
    expect(dates).not.toContain('2027년') // 기준 연도(최근)는 연도 생략
  })
})

/* =====================================================================
   presentation 방어
   ===================================================================== */
describe('presentRhythmRepeatedFlow — 방어', () => {
  it('알 수 없는 key가 있으면 그 카드는 숨긴다', () => {
    const m = makeMotif({ keys: ['thought_loop', 'totally_unknown_key'], lags: [{ min: 1, max: 1 }], starts: ['2026-05-01', '2026-06-01', '2026-07-01'] })
    expect(presentRhythmRepeatedFlow(snap([m]))).toEqual([])
  })

  it('의미상 같은 신호뿐이면 숨긴다', () => {
    const m = makeMotif({ keys: ['mind_would_not_rest', 'state_mind_busy'], lags: [{ min: 1, max: 1 }], starts: ['2026-05-01', '2026-06-01', '2026-07-01'] })
    expect(presentRhythmRepeatedFlow(snap([m]))).toEqual([])
  })

  it('같은 날 동시발생만이면 숨긴다', () => {
    const m = makeMotif({ keys: ['thought_loop', 'state_daily_tasks_hard'], lags: [{ min: 0, max: 0 }], starts: ['2026-05-01', '2026-06-01', '2026-07-01'] })
    expect(presentRhythmRepeatedFlow(snap([m]))).toEqual([])
  })

  it('내부 key·금지(진단/예측) 표현이 없다', () => {
    const [card] = presentRhythmRepeatedFlow(snap([THREE()]))
    expect(card.sentence).not.toMatch(FORBIDDEN)
    expect(card.dates).not.toMatch(FORBIDDEN)
    expect(card.sentence).not.toMatch(/다음에는|곧|예상|가능성|할 수 있어요|위험/)
  })
})
