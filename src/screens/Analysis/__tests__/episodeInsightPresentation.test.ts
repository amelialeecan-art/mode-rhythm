import { describe, expect, it } from 'vitest'
import { presentEpisodeInsight, type EpisodePresentation } from '../episodeInsightPresentation'
import type { EpisodeInsightSnapshot } from '../../../data/services/episodeInsightService'
import type { EpisodeTimeline, TimelineRun, RepeatedEpisodeMotif, MotifMatch, EpisodeTimelineSource, RunBoundary } from '../../../engine'

/* ---- 순수 fixture helper ---- */
function run(key: string, source: EpisodeTimelineSource, startDate: string, endDate: string, endBoundary: RunBoundary = 'observed'): TimelineRun {
  return { key, source, factorGroup: key, startDate, endDate, validDays: 1, calendarDays: 1, dates: [startDate], startBoundary: 'observed', endBoundary }
}
function episode(p: Partial<EpisodeTimeline> & { runs: TimelineRun[] }): EpisodeTimeline {
  const runs = p.runs
  return {
    id: 'e',
    startDate: runs[0].startDate,
    endDate: runs[runs.length - 1].endDate,
    status: 'completed',
    transitions: [],
    aftereffects: [],
    recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] },
    leadingRunKeys: [runs[0].key],
    followupRunKeys: runs.slice(1).map((r) => r.key),
    ...p,
  }
}
function snap(p: Partial<EpisodeInsightSnapshot>): EpisodeInsightSnapshot {
  return {
    recentEpisode: null,
    repeatedMotifs: [],
    currentMotifMatches: [],
    analysisRange: { recentStartDate: '2026-05-23', motifStartDate: '2025-08-21', endDate: '2026-08-20' },
    ...p,
  }
}
const motif = (sequenceKeys: string[], ranges: { min: number; max: number }[], count = 3): RepeatedEpisodeMotif => ({
  id: `m-${sequenceKeys.join('_')}`,
  sequenceKeys,
  occurrenceCount: count,
  occurrences: [],
  typicalLagRanges: ranges,
  latestOccurrenceDate: '2026-07-20',
})
const allText = (p: EpisodePresentation): string =>
  [p.recentFlow, p.aftereffect, p.recovery, p.repeatedFlow, p.currentMatch]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .flatMap((c) => [c.title, ...c.lines, c.dateRangeText ?? '', c.status ?? ''])
    .join(' | ')

/* 금지 표현·내부 key 검사용. */
const FORBIDDEN = /편이에요|가능성이|추정|경향|신뢰도|근거|위험도|증상|진단|조울|우울증|불안장애|공황|ADHD|HSP|몸 에너지|생활기능|감정 부담|사회적 여유|걱정 기록|누적 노출|episode|motif|transition|aftereffect|factor|metric|domain|state_|_delay|_hard|thought_loop|bedtime|sleep_|_tired|_busy|nightOf/i

/* =====================================================================
   기본 동작
   ===================================================================== */
describe('presentEpisodeInsight — 기본', () => {
  it('(27) 빈 snapshot이면 모든 카드 null', () => {
    const p = presentEpisodeInsight(snap({}))
    expect(p).toEqual({ recentFlow: null, aftereffect: null, recovery: null, repeatedFlow: null, currentMatch: null })
  })

  it('(1) 한 번의 흐름을 반복이라고 부르지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-07'), run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-07')],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    expect(p.recentFlow).not.toBeNull()
    expect(p.recentFlow!.lines.join(' ')).not.toMatch(/반복|비슷한 흐름|세 번/)
  })
})

/* =====================================================================
   최근 흐름 문장·날짜
   ===================================================================== */
describe('최근 흐름 문장', () => {
  const ep = episode({
    runs: [
      run('thought_loop', 'mind', '2026-08-06', '2026-08-08'),
      run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08'),
      run('sleep_late', 'sleep', '2026-08-08', '2026-08-09'),
      run('state_tired', 'state', '2026-08-09', '2026-08-10'),
    ],
    leadingRunKeys: ['thought_loop'],
    followupRunKeys: ['bedtime_delay', 'sleep_late', 'state_tired'],
    completionConfirmedDate: '2026-08-12',
  })

  it('(2/3) 시작일·후속 시작일이 든 사람말 문장을 만든다(같은 달)', () => {
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    const text = p.recentFlow!.lines.join(' ')
    expect(text).toContain('8월 6일')
    expect(text).toContain('같은 생각이 계속 맴돌기 시작했')
    expect(text).toContain('자는 걸 미뤘')
    expect(text).toContain('평소보다 늦게 잠들었')
    expect(text).toContain('몸이 쉽게 지쳤')
    // 같은 달은 월 반복 없이 일만
    expect(text).toContain('7일')
    expect(text).toContain('9일')
  })

  it('(11) 본문은 최대 3줄', () => {
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    expect(p.recentFlow!.lines.length).toBeLessThanOrEqual(3)
  })

  it('(9/10) 시작 최대 2, 후속 최대 3 대표만', () => {
    const many = episode({
      runs: [
        run('thought_loop', 'mind', '2026-08-01', '2026-08-01'),
        run('worrying', 'mind', '2026-08-01', '2026-08-01'),
        run('on_edge', 'mind', '2026-08-01', '2026-08-01'),
        run('bedtime_delay', 'sleep', '2026-08-02', '2026-08-02'),
        run('sleep_late', 'sleep', '2026-08-03', '2026-08-03'),
        run('state_tired', 'state', '2026-08-04', '2026-08-04'),
        run('state_focus_hard', 'state', '2026-08-05', '2026-08-05'),
      ],
      leadingRunKeys: ['thought_loop', 'worrying', 'on_edge'],
      followupRunKeys: ['bedtime_delay', 'sleep_late', 'state_tired', 'state_focus_hard'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: many }))
    // 대표 최대 5개 → 최대 3줄
    expect(p.recentFlow!.lines.length).toBeLessThanOrEqual(3)
  })

  it('(4) 다른 달 범위', () => {
    const ep2 = episode({
      runs: [run('thought_loop', 'mind', '2026-07-30', '2026-07-31'), run('state_tired', 'state', '2026-08-01', '2026-08-02')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    expect(p.recentFlow!.lines.join(' ')).toContain('7월 30일')
    expect(p.recentFlow!.lines.join(' ')).toContain('8월 1일')
  })

  it('(5) 연도 경계는 연도 포함', () => {
    const ep2 = episode({
      runs: [run('thought_loop', 'mind', '2025-12-31', '2025-12-31'), run('state_tired', 'state', '2026-01-01', '2026-01-02')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    expect(p.recentFlow!.lines.join(' ')).toContain('2025년 12월 31일')
  })

  it('(6) 수면 nightOf 날짜를 다시 이동하지 않는다', () => {
    const ep2 = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-06'), run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-07')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    // bedtime_delay run 시작일 8/7이 그대로. 8/6이나 8/8로 옮기지 않는다.
    expect(p.recentFlow!.lines.join(' ')).toContain('7일부터 자는 걸 미뤘')
  })

  it('(12) 의미상 중복 신호는 문장에서 하나만', () => {
    const ep2 = episode({
      runs: [
        run('mind_would_not_rest', 'mind', '2026-08-06', '2026-08-06'),
        run('state_mind_busy', 'state', '2026-08-07', '2026-08-08'),
      ],
      leadingRunKeys: ['mind_would_not_rest'],
      followupRunKeys: ['state_mind_busy'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    const text = p.recentFlow?.lines.join(' ') ?? ''
    // 둘 중 하나만 등장(둘 다는 아님).
    const both = text.includes('머리가 쉬지 않았') && text.includes('머리가 복잡했')
    expect(both).toBe(false)
  })

  it('(13) unknown key는 내부 코드를 노출하지 않고 생략', () => {
    const ep2 = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-07'), run('totally_unknown', 'mind', '2026-08-08', '2026-08-08')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['totally_unknown'],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    expect(p.recentFlow!.lines.join(' ')).not.toContain('totally_unknown')
  })

  it('(26) 낮은 정보(같은 날 단일 동시발생)면 카드 null', () => {
    const ep2 = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-06'), run('state_tired', 'state', '2026-08-06', '2026-08-06')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
      recovery: { firstRecoveredKeys: [], laterRecoveredKeys: [], nearbyRecoveryActionKeys: [] },
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep2 }))
    expect(p.recentFlow).toBeNull()
  })
})

/* =====================================================================
   진행 중 / 미기록 구분
   ===================================================================== */
describe('진행 중·미기록 구분', () => {
  const base = (endBoundary: RunBoundary, status: 'ongoing' | 'completed', extra: Partial<EpisodeTimeline> = {}) =>
    episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-07'), run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08', endBoundary)],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
      status,
      ...extra,
    })

  it('(18) completed 흐름은 진행 상태 문장을 붙이지 않는다', () => {
    const p = presentEpisodeInsight(snap({ recentEpisode: base('observed', 'completed', { completionConfirmedDate: '2026-08-11' }) }))
    expect(p.recentFlow!.status).toBeUndefined()
  })

  it('(19) range edge면 최근 기록까지 이어졌다고 말한다', () => {
    const p = presentEpisodeInsight(snap({ recentEpisode: base('range_edge', 'ongoing') }))
    expect(p.recentFlow!.status).toBe('최근 기록까지 이어졌어요.')
  })

  it('(20) missing gap이면 종료 확인 불가라고 말한다', () => {
    const p = presentEpisodeInsight(snap({ recentEpisode: base('missing_gap', 'ongoing') }))
    expect(p.recentFlow!.status).toContain('확인할 기록이 없어요')
  })
})

/* =====================================================================
   남은 변화(aftereffect)
   ===================================================================== */
describe('남은 변화', () => {
  it('(14) aftereffect를 사람말 한 줄로 만든다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-08'), run('sleep_late', 'sleep', '2026-08-08', '2026-08-09')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['sleep_late'],
      aftereffects: [{ sourceKey: 'thought_loop', remainingKey: 'sleep_late', sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-09', extraDays: 1 }],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    expect(p.aftereffect!.lines[0]).toBe('같은 생각은 8일에 줄었지만, 늦게 잠든 날은 9일까지 이어졌어요.')
  })

  it('(15) 후속 종료가 observed가 아니면 "N일까지"로 확정하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-08'), run('sleep_late', 'sleep', '2026-08-08', '2026-08-09', 'range_edge')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['sleep_late'],
      status: 'ongoing',
      aftereffects: [{ sourceKey: 'thought_loop', remainingKey: 'sleep_late', sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-09', extraDays: 1 }],
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    expect(p.aftereffect!.lines[0]).not.toContain('9일까지')
    expect(p.aftereffect!.lines[0]).toContain('늦게 잠든 날은 그 뒤에도 이어졌어요')
  })

  // 수면 항목별 자연스러운 남은 변화 문장(어색한 명사구 금지).
  const aftereffectLine = (remainingKey: string, endBoundary: RunBoundary): string => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-08'), run(remainingKey, 'sleep', '2026-08-08', '2026-08-09', endBoundary)],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: [remainingKey],
      status: endBoundary === 'observed' ? 'completed' : 'ongoing',
      aftereffects: [{ sourceKey: 'thought_loop', remainingKey, sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-09', extraDays: 1 }],
    })
    return presentEpisodeInsight(snap({ recentEpisode: ep })).aftereffect!.lines[0]
  }

  it('어떤 카드에도 "늦어진 밤" 표현이 없다', () => {
    expect(aftereffectLine('bedtime_delay', 'observed')).not.toContain('늦어진 밤')
    expect(aftereffectLine('bedtime_delay', 'range_edge')).not.toContain('늦어진 밤')
  })

  it('sleep_late — 종료 확인/미확인 자연어', () => {
    expect(aftereffectLine('sleep_late', 'observed')).toBe('같은 생각은 8일에 줄었지만, 늦게 잠든 날은 9일까지 이어졌어요.')
    expect(aftereffectLine('sleep_late', 'range_edge')).toBe('같은 생각은 8일에 줄었지만, 늦게 잠든 날은 그 뒤에도 이어졌어요.')
  })

  it('bedtime_delay — 자는 걸 미룬 날은 더 이어졌어요', () => {
    expect(aftereffectLine('bedtime_delay', 'range_edge')).toBe('같은 생각은 8일에 줄었지만, 자는 걸 미룬 날은 더 이어졌어요.')
  })

  it('sleep_onset_difficulty — 잠들기 어려운 밤은 더 이어졌어요', () => {
    expect(aftereffectLine('sleep_onset_difficulty', 'range_edge')).toBe('같은 생각은 8일에 줄었지만, 잠들기 어려운 밤은 더 이어졌어요.')
  })

  it('sleep_waking — 자주 깬 밤은 더 이어졌어요', () => {
    expect(aftereffectLine('sleep_waking', 'range_edge')).toBe('같은 생각은 8일에 줄었지만, 자주 깬 밤은 더 이어졌어요.')
  })
})

/* =====================================================================
   회복
   ===================================================================== */
describe('회복', () => {
  it('(16) recoveryStartDate와 completionConfirmedDate를 구분해 말한다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-08'), run('state_tired', 'state', '2026-08-09', '2026-08-10')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
      completionConfirmedDate: '2026-08-12',
      recovery: { recoveryStartDate: '2026-08-11', firstRecoveredKeys: ['state_tired'], laterRecoveredKeys: [], nearbyRecoveryActionKeys: ['rest_alone'] },
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    expect(p.recovery!.lines[0]).toBe('11일에 몸이 덜 힘들어지기 시작했고, 12일에 이 흐름이 끝난 것으로 확인됐어요.')
  })

  it('(17) recovery action을 원인으로 단정하지 않는다', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-06', '2026-08-08'), run('state_tired', 'state', '2026-08-09', '2026-08-10')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['state_tired'],
      completionConfirmedDate: '2026-08-12',
      recovery: { recoveryStartDate: '2026-08-11', firstRecoveredKeys: ['state_tired'], laterRecoveredKeys: [], nearbyRecoveryActionKeys: ['rest_alone'] },
    })
    const p = presentEpisodeInsight(snap({ recentEpisode: ep }))
    const text = p.recovery!.lines.join(' ')
    expect(text).not.toMatch(/때문에|덕분에|해서 (회복|돌아)/)
  })
})

/* =====================================================================
   반복된 흐름 / 현재 일치
   ===================================================================== */
describe('반복된 흐름·현재 일치', () => {
  it('(21/22) 3단계 반복 문장 + occurrenceCount는 자연어로만', () => {
    const p = presentEpisodeInsight(
      snap({ repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }], 3)] }),
    )
    const line = p.repeatedFlow!.lines[0]
    expect(line).toContain('세 번')
    expect(line).not.toMatch(/근거|3회|occurrence/)
    expect(line).toContain('같은 생각이 계속 맴돈 다음 날')
    expect(line).toContain('자는 걸 미뤘')
    expect(line).toContain('1~2일')
    expect(line).toContain('평소 하던 일이 버거웠')
  })

  it('(23/24) current partial match 2개 이상 표시, 다음 key 예측 없음', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-18', '2026-08-18'), run('bedtime_delay', 'sleep', '2026-08-19', '2026-08-19', 'range_edge')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: ['bedtime_delay'],
      status: 'ongoing',
    })
    const matches: MotifMatch[] = [{ motifId: 'm1', matchedKeys: ['thought_loop', 'bedtime_delay'], completeMatch: false }]
    const p = presentEpisodeInsight(snap({ recentEpisode: ep, currentMotifMatches: matches, repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }])] }))
    expect(p.currentMatch).not.toBeNull()
    expect(p.currentMatch!.lines[0]).toContain('같은 생각이 계속 맴돈 뒤')
    expect(p.currentMatch!.lines[0]).toContain('자는 걸 미뤘')
    // 아직 안 나타난 세 번째(평소 하던 일)는 말하지 않는다.
    expect(p.currentMatch!.lines[0]).not.toContain('평소 하던 일')
  })

  it('(25) matchedKeys 1개면 현재 일치 카드 숨김', () => {
    const ep = episode({
      runs: [run('thought_loop', 'mind', '2026-08-18', '2026-08-19', 'range_edge')],
      leadingRunKeys: ['thought_loop'],
      followupRunKeys: [],
      status: 'ongoing',
    })
    const matches: MotifMatch[] = [{ motifId: 'm1', matchedKeys: ['thought_loop'], completeMatch: false }]
    const p = presentEpisodeInsight(snap({ recentEpisode: ep, currentMotifMatches: matches }))
    expect(p.currentMatch).toBeNull()
  })
})

/* =====================================================================
   고정 QA (§13) + 금지 표현
   ===================================================================== */
describe('고정 QA', () => {
  const build = () =>
    presentEpisodeInsight(
      snap({
        recentEpisode: episode({
          runs: [
            run('thought_loop', 'mind', '2026-08-06', '2026-08-08'),
            run('bedtime_delay', 'sleep', '2026-08-07', '2026-08-08'),
            run('sleep_late', 'sleep', '2026-08-08', '2026-08-09'),
            run('state_tired', 'state', '2026-08-09', '2026-08-10'),
          ],
          leadingRunKeys: ['thought_loop'],
          followupRunKeys: ['bedtime_delay', 'sleep_late', 'state_tired'],
          status: 'completed',
          completionConfirmedDate: '2026-08-12',
          aftereffects: [{ sourceKey: 'thought_loop', remainingKey: 'sleep_late', sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-09', extraDays: 1 }],
          recovery: { recoveryStartDate: '2026-08-11', firstRecoveredKeys: ['state_tired'], laterRecoveredKeys: [], nearbyRecoveryActionKeys: ['rest_alone'] },
        }),
        repeatedMotifs: [motif(['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'], [{ min: 1, max: 1 }, { min: 1, max: 2 }], 3)],
      }),
    )

  it('(28/29) 모든 사용자 문자열에 금지 표현·내부 key가 없다', () => {
    const p = build()
    expect(allText(p)).not.toMatch(FORBIDDEN)
  })

  it('기대 의미의 카드들을 생성한다', () => {
    const p = build()
    // 최근 흐름
    const flow = p.recentFlow!.lines.join(' ')
    expect(flow).toContain('8월 6일')
    expect(flow).toContain('같은 생각이 계속 맴돌기 시작했')
    expect(flow).toContain('자는 걸 미뤘')
    expect(flow).toContain('평소보다 늦게 잠들었')
    expect(flow).toContain('몸이 쉽게 지쳤')
    // 남은 변화
    expect(p.aftereffect!.lines[0]).toBe('같은 생각은 8일에 줄었지만, 늦게 잠든 날은 9일까지 이어졌어요.')
    // 회복
    expect(p.recovery!.lines[0]).toBe('11일에 몸이 덜 힘들어지기 시작했고, 12일에 이 흐름이 끝난 것으로 확인됐어요.')
    // 반복
    expect(p.repeatedFlow!.lines[0]).toContain('세 번')
    expect(p.repeatedFlow!.lines[0]).toContain('그 뒤 1~2일 안에 평소 하던 일이 버거웠어요.')
    // completed면 현재 일치 카드는 없음
    expect(p.currentMatch).toBeNull()
  })
})
