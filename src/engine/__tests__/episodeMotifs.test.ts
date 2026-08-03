import { describe, expect, it } from 'vitest'
import {
  detectRepeatedEpisodeMotifs,
  matchEpisodeToRepeatedMotifs,
  type RepeatedEpisodeMotif,
} from '../episodeMotifs'
import type { EpisodeTimeline, EpisodeTimelineSource, TimelineRun, TimelineTransition } from '../episodeTimeline'

/* ---- 순수 fixture helper (EpisodeTimeline를 직접 만든다) ---- */
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

interface Step {
  key: string
  source: EpisodeTimelineSource
  date: string
}

/** 순서 있는 신호(steps)로 completed/ongoing EpisodeTimeline fixture를 만든다. */
function ep(id: string, steps: Step[], opts: { status?: 'completed' | 'ongoing' } = {}): EpisodeTimeline {
  const status = opts.status ?? 'completed'
  const runs: TimelineRun[] = steps.map((s) => ({
    key: s.key,
    source: s.source,
    factorGroup: s.key,
    startDate: s.date,
    endDate: s.date,
    validDays: 1,
    calendarDays: 1,
    dates: [s.date],
    startBoundary: 'observed',
    endBoundary: status === 'ongoing' ? 'range_edge' : 'observed',
  }))
  const transitions: TimelineTransition[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    transitions.push({
      fromKey: steps[i].key,
      toKey: steps[i + 1].key,
      fromStartDate: steps[i].date,
      toStartDate: steps[i + 1].date,
      lagDays: diff(steps[i].date, steps[i + 1].date),
      overlapDays: 0,
    })
  }
  const endDate = steps[steps.length - 1].date
  return {
    id,
    startDate: steps[0].date,
    endDate,
    status,
    completionConfirmedDate: status === 'completed' ? addDays(endDate, 2) : undefined,
    runs,
    transitions,
    aftereffects: [],
    recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] },
    leadingRunKeys: [steps[0].key],
    followupRunKeys: steps.slice(1).map((s) => s.key),
  }
}

// 자주 쓰는 3단계 흐름(다른 날짜/lag).
const three = (id: string, base: string, lag1: number, lag2: number, status?: 'completed' | 'ongoing') =>
  ep(
    id,
    [
      { key: 'thought_loop', source: 'mind', date: base },
      { key: 'bedtime_delay', source: 'sleep', date: addDays(base, lag1) },
      { key: 'state_daily_tasks_hard', source: 'state', date: addDays(base, lag1 + lag2) },
    ],
    { status },
  )
const findSeq = (motifs: RepeatedEpisodeMotif[], keys: string[]) => motifs.find((m) => m.sequenceKeys.join('>') === keys.join('>'))

/* =====================================================================
   최소 성립 조건
   ===================================================================== */
describe('detectRepeatedEpisodeMotifs — 성립 조건', () => {
  it('(1) 같은 2단계가 서로 다른 completed 3개에서 반복되면 motif 생성', () => {
    const two = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([two('a', '2026-05-01'), two('b', '2026-06-01'), two('c', '2026-07-01')])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay'])!
    expect(m.occurrenceCount).toBe(3)
  })

  it('(2) 2개 episode만이면 생성 안 됨', () => {
    const two = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
      ])
    expect(detectRepeatedEpisodeMotifs([two('a', '2026-05-01'), two('b', '2026-06-01')])).toHaveLength(0)
  })

  it('(3) 같은 episode를 중복 카운트하지 않는다', () => {
    // 같은 episode 하나가 반복 근거로 3번 세어지지 않는다.
    const one = ep('solo', [
      { key: 'thought_loop', source: 'mind', date: '2026-05-01' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-05-02' },
    ])
    expect(detectRepeatedEpisodeMotifs([one])).toHaveLength(0)
  })

  it('(4) sequence 순서가 다르면 다른 motif', () => {
    const fwd = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
      ])
    const rev = (id: string, base: string) =>
      ep(id, [
        { key: 'bedtime_delay', source: 'sleep', date: base },
        { key: 'thought_loop', source: 'mind', date: addDays(base, 1) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([
      fwd('a', '2026-05-01'), fwd('b', '2026-06-01'), fwd('c', '2026-07-01'),
      rev('d', '2026-05-10'), rev('e', '2026-06-10'), rev('f', '2026-07-10'),
    ])
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay'])).toBeTruthy()
    expect(findSeq(motifs, ['bedtime_delay', 'thought_loop'])).toBeTruthy()
  })
})

/* =====================================================================
   lag 묶기
   ===================================================================== */
describe('lag 일관성', () => {
  it('(5) 단계별 lag 최대-최소 차이 1이면 같은 motif', () => {
    // 두 번째 lag: 1,2,1 → 범위 1
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 2), three('c', '2026-07-01', 1, 1)])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])!
    expect(m.occurrenceCount).toBe(3)
    expect(m.typicalLagRanges[1]).toEqual({ min: 1, max: 2 })
  })

  it('(6) lag 차이 2 이상이면 같은 motif로 묶지 않는다', () => {
    // 두 번째 lag: 1,1,3 → 3은 별도 그룹 → 어느 그룹도 3회 미달
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 3)])
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeUndefined()
  })
})

/* =====================================================================
   sequence 길이
   ===================================================================== */
describe('sequence 길이', () => {
  it('(7) 길이 3 sequence 생성', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)])
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeTruthy()
  })

  it('(8) 길이 4 이상은 생성하지 않는다', () => {
    const four = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
        { key: 'state_daily_tasks_hard', source: 'state', date: addDays(base, 2) },
        { key: 'state_people_hard', source: 'state', date: addDays(base, 3) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([four('a', '2026-05-01'), four('b', '2026-06-01'), four('c', '2026-07-01')])
    expect(motifs.every((m) => m.sequenceKeys.length <= 3)).toBe(true)
  })
})

/* =====================================================================
   낮은 정보 가치 제외
   ===================================================================== */
describe('낮은 정보 가치 제외', () => {
  it('(9) 의미상 중복 2단계는 제외', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'mind_would_not_rest', source: 'mind', date: base },
        { key: 'state_mind_busy', source: 'state', date: addDays(base, 1) },
      ])
    expect(detectRepeatedEpisodeMotifs([s('a', '2026-05-01'), s('b', '2026-06-01'), s('c', '2026-07-01')])).toHaveLength(0)
  })

  it('(10) 같은 날 동시발생 2단계만으로는 생성 안 됨', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: base }, // 같은 날(lag 0)
      ])
    expect(detectRepeatedEpisodeMotifs([s('a', '2026-05-01'), s('b', '2026-06-01'), s('c', '2026-07-01')])).toHaveLength(0)
  })

  it('(11) 수면 늦은 잠 → 몸이 쉽게 지침 2단계 제외', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'sleep_late', source: 'sleep', date: base },
        { key: 'state_tired', source: 'state', date: addDays(base, 1) },
      ])
    expect(detectRepeatedEpisodeMotifs([s('a', '2026-05-01'), s('b', '2026-06-01'), s('c', '2026-07-01')])).toHaveLength(0)
  })

  it('(12) 반복생각 → 잠들기 어려움 2단계 제외', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'sleep_onset_difficulty', source: 'sleep', date: addDays(base, 1) },
      ])
    expect(detectRepeatedEpisodeMotifs([s('a', '2026-05-01'), s('b', '2026-06-01'), s('c', '2026-07-01')])).toHaveLength(0)
  })

  it('(13) 낮은 정보 관계가 3단계 일부면 전체 sequence는 가능', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'sleep_onset_difficulty', source: 'sleep', date: addDays(base, 1) },
        { key: 'state_daily_tasks_hard', source: 'state', date: addDays(base, 2) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([s('a', '2026-05-01'), s('b', '2026-06-01'), s('c', '2026-07-01')])
    expect(findSeq(motifs, ['thought_loop', 'sleep_onset_difficulty', 'state_daily_tasks_hard'])).toBeTruthy()
    // 낮은 정보 2단계는 단독으로 남지 않는다.
    expect(findSeq(motifs, ['thought_loop', 'sleep_onset_difficulty'])).toBeUndefined()
  })
})

/* =====================================================================
   completed / ongoing / excluded
   ===================================================================== */
describe('completed·ongoing·excluded', () => {
  it('(14/15) completed만 성립 근거로 쓰고 ongoing은 횟수에 포함 안 함', () => {
    const motifs = detectRepeatedEpisodeMotifs([
      three('a', '2026-05-01', 1, 1),
      three('b', '2026-06-01', 1, 1),
      three('c', '2026-07-01', 1, 1, 'ongoing'), // 진행 중 → 성립 근거 아님
    ])
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeUndefined() // completed 2개뿐
  })

  it('(16) ongoing episode는 기존 motif와 현재까지 부분 매칭된다', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)])
    const ongoing = ep(
      'now',
      [
        { key: 'thought_loop', source: 'mind', date: '2026-08-01' },
        { key: 'bedtime_delay', source: 'sleep', date: '2026-08-02' },
      ],
      { status: 'ongoing' },
    )
    const matches = matchEpisodeToRepeatedMotifs(ongoing, motifs)
    const mm = matches.find((x) => x.matchedKeys.join('>') === 'thought_loop>bedtime_delay')!
    expect(mm.matchedKeys).toEqual(['thought_loop', 'bedtime_delay'])
    expect(mm.completeMatch).toBe(false)
  })

  it('(17) 매칭 결과에 예측 필드(nextExpectedKey 등)가 없다', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)])
    const ongoing = ep('now', [
      { key: 'thought_loop', source: 'mind', date: '2026-08-01' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-08-02' },
    ], { status: 'ongoing' })
    const [mm] = matchEpisodeToRepeatedMotifs(ongoing, motifs)
    expect(Object.keys(mm).sort()).toEqual(['completeMatch', 'matchedKeys', 'motifId'])
  })

  it('(18) excludedEpisodeIds는 반복 횟수에서 제외', () => {
    const motifs = detectRepeatedEpisodeMotifs(
      [three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)],
      { excludedEpisodeIds: ['c'] },
    )
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeUndefined() // 2개만 남아 미달
  })
})

/* =====================================================================
   중복 제거 / 상한
   ===================================================================== */
describe('중복 제거·상한', () => {
  it('(19) 같은 occurrence의 A→B와 A→B→C 중 긴 motif 우선(짧은 것 숨김)', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)])
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeTruthy()
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay'])).toBeUndefined() // 같은 3 occurrence → 숨김
  })

  it('(20) 서로 다른 occurrence면 짧은 motif도 유지된다', () => {
    // A→B→C 3개 + 별도 episode 3개에서 A→B만(다른 occurrence) → A→B 유지
    const twoOnly = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([
      three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1),
      twoOnly('d', '2026-05-15'), twoOnly('e', '2026-06-15'), twoOnly('f', '2026-07-15'),
    ])
    // A→B occurrence 집합은 {a..f}(6개)로 A→B→C의 {a,b,c}와 다르므로 숨겨지지 않는다.
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay'])).toBeTruthy()
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeTruthy()
  })

  it('(21) 최종 motif는 최대 5개', () => {
    const eps: EpisodeTimeline[] = []
    // 7개의 서로 다른 2단계 순서 × 3 episode
    const pairs: [string, string][] = [
      ['thought_loop', 'bedtime_delay'],
      ['worrying', 'phone_sleep_delay'],
      ['on_edge', 'intentional_wakefulness'],
      ['self_blame', 'state_focus_hard'],
      ['tasks_on_mind', 'state_people_hard'],
      ['too_many_thoughts', 'state_body_uncomfortable'],
      ['small_things_bothered', 'state_appetite_changed'],
    ]
    pairs.forEach(([a, b], pi) => {
      for (let k = 0; k < 3; k++) {
        const base = `2026-0${(pi % 6) + 1}-0${k + 1}`.replace(/-0(\d\d)$/, '-$1')
        eps.push(ep(`e${pi}_${k}`, [{ key: a, source: 'mind', date: base }, { key: b, source: 'sleep', date: addDays(base, 1) }]))
      }
    })
    expect(detectRepeatedEpisodeMotifs(eps).length).toBeLessThanOrEqual(5)
  })
})

/* =====================================================================
   구조 정합·날짜
   ===================================================================== */
describe('구조·날짜', () => {
  it('(22) occurrenceCount와 occurrence 배열이 일치', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1)])
    for (const m of motifs) expect(m.occurrenceCount).toBe(m.occurrences.length)
  })

  it('(23) typicalLagRanges min/max 정확', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 2), three('c', '2026-07-01', 1, 1)])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])!
    expect(m.typicalLagRanges).toEqual([{ min: 1, max: 1 }, { min: 1, max: 2 }])
  })

  it('(24/25) latestOccurrenceDate = 가장 최근 endDate occurrence의 sequence 시작일(완료확인일 아님)', () => {
    const motifs = detectRepeatedEpisodeMotifs([three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-20', 1, 1)])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])!
    expect(m.latestOccurrenceDate).toBe('2026-07-20') // c의 sequence 시작일. completionConfirmedDate(7/24)가 아님.
  })

  it('(26) 월 경계 날짜 처리', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
        { key: 'state_daily_tasks_hard', source: 'state', date: addDays(base, 2) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([s('a', '2026-01-31'), s('b', '2026-03-30'), s('c', '2026-05-31')])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])!
    expect(m.typicalLagRanges).toEqual([{ min: 1, max: 1 }, { min: 1, max: 1 }]) // 1/31→2/1, 2/1→2/2 등 정확
  })

  it('(27) 연도 경계 날짜 처리', () => {
    const s = (id: string, base: string) =>
      ep(id, [
        { key: 'thought_loop', source: 'mind', date: base },
        { key: 'bedtime_delay', source: 'sleep', date: addDays(base, 1) },
      ])
    const motifs = detectRepeatedEpisodeMotifs([s('a', '2026-12-31'), s('b', '2027-12-31'), s('c', '2028-12-31')])
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay'])!
    expect(m.typicalLagRanges[0]).toEqual({ min: 1, max: 1 }) // 12/31 → 다음해 1/1
    expect(m.latestOccurrenceDate).toBe('2028-12-31')
  })

  it('(28) today 이후(미래) episode는 제외', () => {
    const motifs = detectRepeatedEpisodeMotifs(
      [three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-12-01', 1, 1)],
      { today: '2026-08-01' }, // c(12월)는 미래 → 제외 → 2개만
    )
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])).toBeUndefined()
  })
})

/* =====================================================================
   고정 QA 데이터(스펙 §12)
   ===================================================================== */
describe('고정 QA 데이터', () => {
  const episodes = () => [
    ep('e1', [
      { key: 'thought_loop', source: 'mind', date: '2026-05-01' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-05-02' },
      { key: 'state_daily_tasks_hard', source: 'state', date: '2026-05-03' },
    ]),
    ep('e2', [
      { key: 'thought_loop', source: 'mind', date: '2026-06-10' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-06-11' },
      { key: 'state_daily_tasks_hard', source: 'state', date: '2026-06-13' },
    ]),
    ep('e3', [
      { key: 'thought_loop', source: 'mind', date: '2026-07-20' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-07-21' },
      { key: 'state_daily_tasks_hard', source: 'state', date: '2026-07-22' },
    ]),
  ]

  it('(29) 기대 구조를 통과한다', () => {
    const motifs = detectRepeatedEpisodeMotifs(episodes())
    const m = findSeq(motifs, ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'])!
    expect(m.occurrenceCount).toBe(3)
    expect(m.typicalLagRanges).toEqual([{ min: 1, max: 1 }, { min: 1, max: 2 }])
    expect(new Set(m.occurrences.map((o) => o.episodeId))).toEqual(new Set(['e1', 'e2', 'e3']))
    // 짧은 thought_loop → bedtime_delay는 같은 occurrence 집합이라 최종 반환에서 제거
    expect(findSeq(motifs, ['thought_loop', 'bedtime_delay'])).toBeUndefined()
    expect(m.latestOccurrenceDate).toBe('2026-07-20')
  })

  it('(0) 입력 episode 순서가 달라도 detect 결과·정렬이 동일하다(결정성)', () => {
    // 여러 motif가 나오도록 서로 다른 순서 3종을 섞는다.
    const base: EpisodeTimeline[] = [
      three('a', '2026-05-01', 1, 1), three('b', '2026-06-01', 1, 1), three('c', '2026-07-01', 1, 1),
      ep('d', [{ key: 'worrying', source: 'mind', date: '2026-05-05' }, { key: 'phone_sleep_delay', source: 'sleep', date: '2026-05-06' }]),
      ep('e', [{ key: 'worrying', source: 'mind', date: '2026-06-05' }, { key: 'phone_sleep_delay', source: 'sleep', date: '2026-06-06' }]),
      ep('f', [{ key: 'worrying', source: 'mind', date: '2026-07-05' }, { key: 'phone_sleep_delay', source: 'sleep', date: '2026-07-06' }]),
      ep('g', [{ key: 'on_edge', source: 'mind', date: '2026-04-01' }, { key: 'intentional_wakefulness', source: 'sleep', date: '2026-04-02' }, { key: 'state_focus_hard', source: 'state', date: '2026-04-03' }]),
      ep('h', [{ key: 'on_edge', source: 'mind', date: '2026-04-10' }, { key: 'intentional_wakefulness', source: 'sleep', date: '2026-04-11' }, { key: 'state_focus_hard', source: 'state', date: '2026-04-12' }]),
      ep('i', [{ key: 'on_edge', source: 'mind', date: '2026-04-20' }, { key: 'intentional_wakefulness', source: 'sleep', date: '2026-04-21' }, { key: 'state_focus_hard', source: 'state', date: '2026-04-22' }]),
    ]
    const project = (ms: RepeatedEpisodeMotif[]) =>
      ms.map((m) => ({
        sequenceKeys: m.sequenceKeys,
        occurrenceCount: m.occurrenceCount,
        episodeIds: [...m.occurrences.map((o) => o.episodeId)].sort(),
        typicalLagRanges: m.typicalLagRanges,
        latestOccurrenceDate: m.latestOccurrenceDate,
      }))
    const asc = project(detectRepeatedEpisodeMotifs(base))
    const desc = project(detectRepeatedEpisodeMotifs([...base].reverse()))
    const shuffled = project(detectRepeatedEpisodeMotifs([base[4], base[0], base[7], base[2], base[5], base[1], base[8], base[3], base[6]]))
    expect(desc).toEqual(asc)
    expect(shuffled).toEqual(asc)
  })

  it('(29b) ongoing episode는 2개 key만 부분 매칭, 예측 없음', () => {
    const motifs = detectRepeatedEpisodeMotifs(episodes())
    const ongoing = ep('now', [
      { key: 'thought_loop', source: 'mind', date: '2026-08-01' },
      { key: 'bedtime_delay', source: 'sleep', date: '2026-08-02' },
    ], { status: 'ongoing' })
    // 성립 횟수는 여전히 3(ongoing 미포함)
    expect(detectRepeatedEpisodeMotifs([...episodes(), ongoing]).find((m) => m.sequenceKeys.length === 3)!.occurrenceCount).toBe(3)
    const [mm] = matchEpisodeToRepeatedMotifs(ongoing, motifs)
    expect(mm.matchedKeys).toEqual(['thought_loop', 'bedtime_delay'])
    expect(mm.completeMatch).toBe(false)
    expect(mm).not.toHaveProperty('nextExpectedKey')
  })
})
