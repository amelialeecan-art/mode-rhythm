import { describe, expect, it } from 'vitest'
import {
  buildEpisodeTimeline,
  buildTimelineRuns,
  buildTimelineTransitions,
  buildTimelineAftereffects,
  deriveSequenceContext,
  assembleEpisodeTimelines,
  selectMostRecentEpisode,
  type EpisodeTimeline,
} from '../episodeTimeline'
import { makeLog, makeEvent } from './factories'
import type { DailyLog, EventLog } from '../../data/models'

const TODAY = '2026-08-25'

// 어려운 직접 상태를 만드는 레벨 조각.
const tired = { bodyEnergyLevel: 'empty' as const } // state_tired
const busy = { mentalSpaceLevel: 'overloaded' as const } // state_mind_busy
const focusHard = { focusLevel: 'rarely' as const } // state_focus_hard
const peopleHard = { socialCapacityLevel: 'rarely' as const } // state_people_hard

const pipeline = (
  logs: DailyLog[],
  opts: { today?: string; recoveryActions?: { date: string; actionCode: string }[]; eventLogs?: EventLog[] } = {},
) => {
  const today = opts.today ?? TODAY
  const items = buildEpisodeTimeline({ dailyLogs: logs, eventLogs: opts.eventLogs }, today)
  const ctx = deriveSequenceContext(logs, today)
  const runs = buildTimelineRuns(items, ctx)
  const transitions = buildTimelineTransitions(runs, ctx)
  const aftereffects = buildTimelineAftereffects(runs, transitions)
  const episodes = assembleEpisodeTimelines({ runs, transitions, aftereffects, ctx, recoveryActions: opts.recoveryActions })
  return { items, ctx, runs, transitions, aftereffects, episodes }
}
const repKeys = (e: EpisodeTimeline) => [...e.leadingRunKeys, ...e.followupRunKeys]

/* =====================================================================
   최소 인정 조건
   ===================================================================== */
describe('episode 최소 조건', () => {
  it('(1) 서로 다른 주요 신호 2개 + state/mind 포함이면 episode 생성', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }),
    ])
    expect(episodes).toHaveLength(1)
    expect(repKeys(episodes[0])).toContain('thought_loop')
  })

  it('(2) 단순 사건 하나만 있으면 episode 없음', () => {
    const { episodes } = pipeline([], { eventLogs: [makeEvent({ date: '2026-08-06', eventCode: 'work_pressure', mappedFactorGroup: 'work' })] })
    expect(episodes).toHaveLength(0)
  })

  it('(3) 수면 이슈 하나만 있으면 episode 없음', () => {
    const { episodes } = pipeline([makeLog({ date: '2026-08-06', lastNightSleep: { issues: ['bedtime_delay'] } })])
    expect(episodes).toHaveLength(0)
  })

  it('(4) 의미상 동일 신호 두 개만 있으면 episode 없음', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['mind_would_not_rest'], ...busy }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['mind_would_not_rest'], ...busy }),
    ])
    expect(episodes).toHaveLength(0)
  })

  it('(5) state/mind 없이 사건·수면만 있으면(2그룹이어도) episode 없음', () => {
    const { episodes } = pipeline([makeLog({ date: '2026-08-06', lastNightSleep: { issues: ['bedtime_delay', 'sleep_late'] } })])
    expect(episodes).toHaveLength(0)
  })
})

/* =====================================================================
   연결·분리
   ===================================================================== */
describe('episode 연결·분리', () => {
  it('(6) 관련 transition으로 run들이 한 episode로 연결된다', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }),
    ])
    const keys = episodes[0].runs.map((r) => r.key)
    expect(keys).toContain('thought_loop')
    expect(keys).toContain('bedtime_delay')
  })

  it('(7) 멀리 떨어진 관련 없는 run은 별도 episode로 분리', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-01', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }),
      makeLog({ date: '2026-08-02', mindSignalCodes: ['thought_loop'] }),
      // 8/03~8/19 미기록(3일+ 공백)
      makeLog({ date: '2026-08-20', mindSignalCodes: ['worrying'], lastNightSleep: { issues: ['sleep_late'] } }),
      makeLog({ date: '2026-08-21', mindSignalCodes: ['worrying'] }),
    ])
    expect(episodes).toHaveLength(2)
    expect(episodes[0].startDate < episodes[1].startDate).toBe(true)
  })

  it('(8) exception 경계를 넘어 합치지 않는다', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-08', rhythmExceptionCodes: ['illness'] }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['worrying'], ...tired }),
      makeLog({ date: '2026-08-10', mindSignalCodes: ['worrying'], ...tired }),
    ])
    expect(episodes).toHaveLength(2)
    expect(episodes.every((e) => e.runs.every((r) => !r.dates.includes('2026-08-08')))).toBe(true)
  })

  it('(9) 3일 이상 연속 미기록 경계로 분리', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      // 8/08~8/11 미기록(4일)
      makeLog({ date: '2026-08-12', mindSignalCodes: ['worrying'], ...busy }),
      makeLog({ date: '2026-08-13', mindSignalCodes: ['worrying'], ...busy }),
    ])
    expect(episodes).toHaveLength(2)
  })

  it('(10) 월 경계라도 실제 기록이 연속이면 한 episode', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-07-31', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-01', mindSignalCodes: ['thought_loop'], ...tired }),
    ])
    expect(episodes).toHaveLength(1)
    expect(episodes[0].startDate).toBe('2026-07-31')
    expect(episodes[0].endDate >= '2026-08-01').toBe(true)
  })

  it('(11) 시작일은 대표 run 중 가장 이른 날짜(무관 사건은 제외)', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-08', ...tired }),
      ],
      // 상태 흐름이 시작된 뒤(뒤따르는 state/mind 없음) 붙은 무관 사건 — 대표에서 제외.
      { eventLogs: [makeEvent({ date: '2026-08-08', eventCode: 'errand', mappedFactorGroup: 'life' })] },
    )
    expect(episodes[0].startDate).toBe('2026-08-06')
    expect(episodes[0].runs.map((r) => r.key)).not.toContain('errand')
  })
})

/* =====================================================================
   대표 run 선택
   ===================================================================== */
describe('대표 run 선택', () => {
  it('(12) 시작 신호 최대 2개', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop', 'worrying', 'on_edge'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'worrying', 'on_edge'] }),
    ])
    expect(episodes[0].leadingRunKeys.length).toBe(2)
  })

  it('(13/15) 후속 신호 최대 3개 + 정보가치 우선순위(낮은 state→state 탈락)', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired, ...focusHard }),
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'], ...busy }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-10', ...peopleHard }), // 오직 state→state로만 연결 → 낮은 우선순위
    ])
    const f = episodes[0].followupRunKeys
    expect(f.length).toBe(3)
    expect(f).toContain('state_tired')
    expect(f).toContain('state_focus_hard')
    expect(f).toContain('state_mind_busy')
    expect(f).not.toContain('state_people_hard') // 정보가치 낮아 대표에서 탈락
  })

  it('(14) 의미상 중복은 대표 선택에서 하나만 남긴다', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop', 'mind_would_not_rest'], ...busy }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'mind_would_not_rest'], ...busy }),
    ])
    const keys = repKeys(episodes[0])
    expect(keys).toContain('thought_loop')
    // mind_would_not_rest ↔ state_mind_busy 는 의미중복 → 둘 다 대표로 넣지 않는다.
    expect(keys.includes('mind_would_not_rest') && keys.includes('state_mind_busy')).toBe(false)
    // 원본 runs에는 둘 다 보존된다.
    const runKeys = episodes[0].runs.map((r) => r.key)
    expect(runKeys).toContain('mind_would_not_rest')
    expect(runKeys).toContain('state_mind_busy')
  })
})

/* =====================================================================
   종료 판정
   ===================================================================== */
describe('episode 종료(completed/ongoing)', () => {
  const flow = (extra: Partial<DailyLog>[] = []) => [
    makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
    makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
    ...extra.map((e) => makeLog(e)),
  ]

  it('(16) observed 종료 + 안정 2일이면 completed', () => {
    const { episodes } = pipeline(flow([{ date: '2026-08-08' }, { date: '2026-08-09' }]))
    expect(episodes[0].status).toBe('completed')
  })

  it('(17) 분석 범위 끝까지 이어지면 ongoing', () => {
    const { episodes } = pipeline(flow(), { today: '2026-08-07' }) // today=마지막 신호일
    expect(episodes[0].status).toBe('ongoing')
    expect(episodes[0].runs.some((r) => r.endBoundary === 'range_edge')).toBe(true)
  })

  it('(18) 미기록으로 끊기면 completed로 보지 않는다(ongoing)', () => {
    const { episodes } = pipeline(flow(), { today: '2026-08-20' }) // 8/08 이후 미기록
    expect(episodes[0].status).toBe('ongoing')
  })

  it('(19) 예외일은 안정일로 세지 않는다', () => {
    const { episodes } = pipeline(flow([{ date: '2026-08-08' }, { date: '2026-08-09', rhythmExceptionCodes: ['illness'] }]))
    expect(episodes[0].status).toBe('ongoing') // 안정 1일 뒤 예외 → 2일 못 채움
  })

  it('(20) 사건만 남은 것은 ongoing 유지 이유가 아니다', () => {
    const { episodes } = pipeline(flow([{ date: '2026-08-08' }, { date: '2026-08-09' }]), {
      eventLogs: [makeEvent({ date: '2026-08-08', eventCode: 'errand', mappedFactorGroup: 'life' })],
    })
    expect(episodes[0].status).toBe('completed') // 사건만 있는 8/08도 안정일로 인정
  })
})

/* =====================================================================
   완료 확인일(completionConfirmedDate) — 신호 종료일과 구분
   ===================================================================== */
describe('completionConfirmedDate', () => {
  it('신호 종료 8/10 · 회복 8/11 · 안정 확인 8/12를 각각 구분한다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
        makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }),
        makeLog({ date: '2026-08-09', lastNightSleep: { issues: ['bedtime_delay', 'sleep_late'] }, ...tired }),
        makeLog({ date: '2026-08-10', lastNightSleep: { issues: ['sleep_late'] }, ...tired }), // 마지막 어려운 신호일
        makeLog({ date: '2026-08-11' }), // 안정 1일 + state 회복
        makeLog({ date: '2026-08-12' }), // 안정 2일째 → 완료 확인
        makeLog({ date: '2026-08-13' }),
      ],
      { today: '2026-08-20' },
    )
    const e = episodes[0]
    expect(e.status).toBe('completed')
    expect(e.endDate).toBe('2026-08-10') // 신호 종료일(기존 계산 불변)
    expect(e.recovery.recoveryStartDate).toBe('2026-08-11') // 상태 복귀일(기존 계산 불변)
    expect(e.completionConfirmedDate).toBe('2026-08-12') // 안정 2일째
  })

  it('ongoing episode는 completionConfirmedDate가 없다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      ],
      { today: '2026-08-07' }, // 범위 끝까지 이어짐
    )
    expect(episodes[0].status).toBe('ongoing')
    expect(episodes[0].completionConfirmedDate).toBeUndefined()
  })

  it('미기록일을 완료 확인일로 쓰지 않는다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-08' }), // 안정 1일
        // 8/09 미기록 → 안정 2일 못 채움
      ],
      { today: '2026-08-20' },
    )
    expect(episodes[0].status).toBe('ongoing')
    expect(episodes[0].completionConfirmedDate).toBeUndefined()
  })

  it('exception을 완료 확인일로 쓰지 않는다', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-08' }), // 안정 1일
      makeLog({ date: '2026-08-09', rhythmExceptionCodes: ['illness'] }), // 예외 → 안정일 아님
    ])
    expect(episodes[0].status).toBe('ongoing')
    expect(episodes[0].completionConfirmedDate).toBeUndefined()
  })

  it('recovery action만 있는 날(미기록)은 완료 확인일로 쓰지 않는다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-08' }), // 안정 1일
        // 8/09는 DailyLog 없이 recovery action만 존재 → 안정일 아님
      ],
      { today: '2026-08-20', recoveryActions: [{ date: '2026-08-09', actionCode: 'rest_alone' }] },
    )
    expect(episodes[0].status).toBe('ongoing')
    expect(episodes[0].completionConfirmedDate).toBeUndefined()
  })

  it('selectMostRecentEpisode는 completionConfirmedDate가 아니라 endDate 기준을 유지한다', () => {
    // ep1: 신호 종료 8/02(최근), 완료 확인 없음/이후. ep2: 신호 종료 8/01, 완료 확인 8/12(더 늦음).
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-08', mindSignalCodes: ['worrying'], ...busy }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['worrying'], ...busy }), // 신호 종료 8/09
      makeLog({ date: '2026-08-10' }),
      makeLog({ date: '2026-08-11' }), // ep(worrying) 완료 확인 8/11
      makeLog({ date: '2026-08-20', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-21', mindSignalCodes: ['thought_loop'], ...tired }), // 신호 종료 8/21(더 최근), 이후 미기록 → ongoing
    ])
    const chosen = selectMostRecentEpisode(episodes)!
    expect(chosen.endDate).toBe('2026-08-21') // endDate가 더 최근인 흐름 선택(완료 확인일이 이르다는 이유로 밀리지 않음)
  })
})

/* =====================================================================
   회복 계산
   ===================================================================== */
describe('회복(recovery)', () => {
  it('(21) recoveryStartDate는 state 값이 실제로 정상 범위로 돌아온 날짜', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-08' }), // state_tired 사라짐 → 회복
      makeLog({ date: '2026-08-09' }),
    ])
    expect(episodes[0].recovery.recoveryStartDate).toBe('2026-08-08')
    expect(episodes[0].recovery.firstRecoveredKeys).toContain('state_tired')
  })

  it('(22) 미입력(미기록)은 회복으로 처리하지 않는다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      ],
      { today: '2026-08-20' }, // 8/08 이후 미기록
    )
    expect(episodes[0].recovery.recoveryStartDate).toBeUndefined()
  })

  it('(23) recovery action이 있어도 상태 복귀가 없으면 회복 판정하지 않는다', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      ],
      { today: '2026-08-20', recoveryActions: [{ date: '2026-08-07', actionCode: 'rest_alone' }] },
    )
    expect(episodes[0].recovery.recoveryStartDate).toBeUndefined()
    expect(episodes[0].recovery.nearbyRecoveryActionKeys).toEqual([])
  })

  it('(24) nearbyRecoveryActionKeys는 시간상 참조로만 보존된다(인과 필드 없음)', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-08' }),
        makeLog({ date: '2026-08-09' }),
      ],
      { recoveryActions: [{ date: '2026-08-08', actionCode: 'rest_alone' }] },
    )
    expect(episodes[0].recovery.nearbyRecoveryActionKeys).toContain('rest_alone')
    expect(episodes[0].recovery).not.toHaveProperty('effect')
  })

  it('(26) 회복 상태는 최대 3개 영역', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-06', ...tired, ...busy, ...focusHard, ...peopleHard }),
      makeLog({ date: '2026-08-07', ...tired, ...busy, ...focusHard, ...peopleHard }),
      makeLog({ date: '2026-08-08' }), // 4개 상태 모두 회복
    ])
    const rec = episodes[0].recovery
    expect(rec.firstRecoveredKeys.length + rec.laterRecoveredKeys.length).toBe(3)
  })
})

/* =====================================================================
   최근 episode 선택
   ===================================================================== */
describe('selectMostRecentEpisode', () => {
  it('(27) endDate가 더 최근인 episode를 고른다', () => {
    const { episodes } = pipeline([
      makeLog({ date: '2026-08-01', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-02', mindSignalCodes: ['thought_loop'], ...tired }),
      makeLog({ date: '2026-08-20', mindSignalCodes: ['worrying'], ...busy }),
      makeLog({ date: '2026-08-21', mindSignalCodes: ['worrying'], ...busy }),
    ])
    expect(episodes).toHaveLength(2)
    const chosen = selectMostRecentEpisode(episodes)!
    expect(chosen.startDate).toBe('2026-08-20')
  })

  it('(28) 정보 부족한 최근 조각(비-episode)보다 완결된 유의미 episode 선택', () => {
    const { episodes } = pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'], ...tired }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], ...tired }),
      ],
      // 훨씬 뒤의 단일 사건(최소 조건 미달 → episode 아님)
      { eventLogs: [makeEvent({ date: '2026-08-22', eventCode: 'errand', mappedFactorGroup: 'life' })] },
    )
    const chosen = selectMostRecentEpisode(episodes)!
    expect(chosen.startDate).toBe('2026-08-06')
  })
})

/* =====================================================================
   고정 QA 데이터(스펙 §9)
   ===================================================================== */
describe('고정 QA 데이터', () => {
  const build = () =>
    pipeline(
      [
        makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
        makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
        makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }), // nightOf 8/7
        makeLog({ date: '2026-08-09', lastNightSleep: { issues: ['bedtime_delay', 'sleep_late'] }, ...tired }), // nightOf 8/8
        makeLog({ date: '2026-08-10', lastNightSleep: { issues: ['sleep_late'] }, ...tired }), // nightOf 8/9
        makeLog({ date: '2026-08-11' }),
        makeLog({ date: '2026-08-12' }),
        makeLog({ date: '2026-08-13' }),
      ],
      { today: '2026-08-20', recoveryActions: [{ date: '2026-08-10', actionCode: 'rest_alone' }] },
    )

  it('(29) 기대 구조를 통과한다', () => {
    const { episodes } = build()
    expect(episodes).toHaveLength(1)
    const e = episodes[0]
    expect(e.startDate).toBe('2026-08-06')
    expect(e.endDate).toBe('2026-08-10')
    expect(e.status).toBe('completed')
    expect(e.leadingRunKeys).toContain('thought_loop')
    expect(e.followupRunKeys).toEqual(expect.arrayContaining(['bedtime_delay', 'sleep_late', 'state_tired']))
    // thought_loop → bedtime_delay lag 1
    expect(e.transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'bedtime_delay')!.lagDays).toBe(1)
    // thought_loop 종료 뒤 sleep_late aftereffect 유지
    expect(e.aftereffects.some((a) => a.sourceKey === 'thought_loop' && a.remainingKey === 'sleep_late')).toBe(true)
    expect(e.aftereffects.length).toBeLessThanOrEqual(2)
    // state_tired 실제 observed 종료
    expect(e.runs.find((r) => r.key === 'state_tired')!.endBoundary).toBe('observed')
    // 회복: state_tired가 실제로 정상 범위로 돌아온 8/11
    expect(e.recovery.recoveryStartDate).toBe('2026-08-11')
    expect(e.recovery.firstRecoveredKeys).toEqual(['state_tired'])
    expect(e.recovery.nearbyRecoveryActionKeys).toContain('rest_alone')
  })

  it('(29b) selectMostRecentEpisode가 이 흐름을 고른다', () => {
    const { episodes } = build()
    expect(selectMostRecentEpisode(episodes)!.startDate).toBe('2026-08-06')
  })
})
