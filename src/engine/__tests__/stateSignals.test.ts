import { describe, expect, it } from 'vitest'
import {
  buildEpisodeTimeline,
  buildStateTimelineItems,
  buildTimelineRuns,
  buildTimelineTransitions,
  buildTimelineAftereffects,
  deriveSequenceContext,
  areSemanticallyOverlappingSignals,
  STATE_SIGNAL_LABEL,
  type EpisodeTimelineItem,
  type TimelineRun,
} from '../episodeTimeline'
import { makeLog } from './factories'
import type { DailyLog } from '../../data/models'

const TODAY = '2026-08-31'
const stateKeys = (items: EpisodeTimelineItem[]) => items.filter((i) => i.source === 'state').map((i) => i.eventKey)
const runOf = (runs: TimelineRun[], key: string) => runs.find((r) => r.key === key)!

/* =====================================================================
   직접 상태 → state timeline item
   ===================================================================== */
describe('buildStateTimelineItems — 직접 상태', () => {
  it('새 직접 입력 상태가 어려운 값일 때 state item으로 생성된다', () => {
    const log = makeLog({
      date: '2026-08-10',
      mentalSpaceLevel: 'overloaded', // 여유 낮음 → state_mind_busy
      focusLevel: 'rarely', // 집중 낮음 → state_focus_hard
      bodyEnergyLevel: 'empty', // 에너지 낮음 → state_tired
      functionLevel: 4, // 생활기능 저하 → state_daily_tasks_hard
    })
    const keys = stateKeys(buildStateTimelineItems([log], TODAY))
    expect(keys).toEqual(expect.arrayContaining(['state_mind_busy', 'state_focus_hard', 'state_tired', 'state_daily_tasks_hard']))
    expect(new Set(keys).size).toBe(keys.length) // 중복 없음
  })

  it('legacy 상태 기록(stateCodes)도 resolver를 통해 state item이 된다', () => {
    // drained → bodyEnergy cap 20(어려움), unfocused → focus cap 30(어려움)
    const log = makeLog({ date: '2026-08-10', stateCodes: ['drained', 'unfocused'] })
    const keys = stateKeys(buildStateTimelineItems([log], TODAY))
    expect(keys).toContain('state_tired')
    expect(keys).toContain('state_focus_hard')
  })

  it('상태 미입력이면 state item을 만들지 않는다', () => {
    // makeLog는 숫자 0·레벨 없음 → 모든 영역 undefined
    expect(buildStateTimelineItems([makeLog({ date: '2026-08-10' })], TODAY)).toEqual([])
  })

  it('capacity/strain 방향을 반대로 해석하지 않는다(양호한 값은 item 없음)', () => {
    const good = makeLog({
      date: '2026-08-10',
      mentalSpaceLevel: 'spacious', // 여유 많음(양호)
      emotionalStabilityLevel: 'very_stable', // 안정(양호)
      focusLevel: 'well', // 집중 잘됨(양호)
      functionLevel: 1, // 생활기능 유지(양호)
    })
    expect(buildStateTimelineItems([good], TODAY)).toEqual([])
    // 반대로 어려운 값은 item 생성
    const hard = makeLog({ date: '2026-08-10', mentalSpaceLevel: 'overloaded', emotionalStabilityLevel: 'mostly_shaken' })
    const keys = stateKeys(buildStateTimelineItems([hard], TODAY))
    expect(keys).toContain('state_mind_busy')
    expect(keys).toContain('state_emotion_unsteady')
  })

  it('generic 수면 상태는 state item에서 제외한다(구체 lastNightSleep과 겹침 방지)', () => {
    // 수면 부족으로 sleep 영역이 어려워도 state 신호는 만들지 않는다.
    const log = makeLog({ date: '2026-08-10', lastNightSleep: { hours: 4, quality: 2, issues: ['sleep_late'] } })
    expect(buildStateTimelineItems([log], TODAY)).toEqual([])
    // 단, 구체 수면 item 자체는 timeline에 남는다.
    const items = buildEpisodeTimeline({ dailyLogs: [log] }, TODAY)
    expect(items.some((i) => i.source === 'sleep' && i.eventKey === 'sleep_late')).toBe(true)
    expect(items.some((i) => i.source === 'state')).toBe(false)
  })

  it('state label 맵이 사람말 라벨을 제공한다', () => {
    expect(STATE_SIGNAL_LABEL.get('state_tired')).toBe('몸이 쉽게 지침')
    expect(STATE_SIGNAL_LABEL.get('state_people_hard')).toBe('사람을 대하기 버거움')
  })
})

/* =====================================================================
   같은 날짜의 서로 다른 source 보존
   ===================================================================== */
describe('source 공존', () => {
  it('같은 날짜의 mind와 state item이 모두 보존된다', () => {
    const log = makeLog({ date: '2026-08-10', mindSignalCodes: ['thought_loop'], bodyEnergyLevel: 'empty' })
    const items = buildEpisodeTimeline({ dailyLogs: [log] }, TODAY)
    expect(items.some((i) => i.source === 'mind' && i.eventKey === 'thought_loop')).toBe(true)
    expect(items.some((i) => i.source === 'state' && i.eventKey === 'state_tired')).toBe(true)
  })

  it('같은 날짜의 sleep과 state item이 모두 보존된다', () => {
    const log = makeLog({ date: '2026-08-10', lastNightSleep: { issues: ['bedtime_delay'] }, focusLevel: 'rarely' })
    const items = buildEpisodeTimeline({ dailyLogs: [log] }, TODAY)
    expect(items.some((i) => i.source === 'sleep' && i.eventKey === 'bedtime_delay')).toBe(true)
    expect(items.some((i) => i.source === 'state' && i.eventKey === 'state_focus_hard')).toBe(true)
  })

  it('mindSignalCodes를 state로 변환하지 않는다(감정·state 서로 덮어쓰지 않음)', () => {
    const log = makeLog({ date: '2026-08-10', mindSignalCodes: ['thought_loop'] })
    // 어떤 어려운 상태 입력도 없으므로 state item은 없고 mind만 있다.
    const items = buildEpisodeTimeline({ dailyLogs: [log] }, TODAY)
    expect(items.filter((i) => i.source === 'state')).toHaveLength(0)
    expect(items.filter((i) => i.source === 'mind')).toHaveLength(1)
  })
})

/* =====================================================================
   run 시작/종료 경계 이유
   ===================================================================== */
const hardMind = (date: string) => makeLog({ date, bodyEnergyLevel: 'empty' }) // state_tired 생성용

describe('run 경계 이유(startBoundary/endBoundary)', () => {
  const seqRuns = (logs: DailyLog[], today = TODAY) => buildTimelineRuns(buildEpisodeTimeline({ dailyLogs: logs }, today), deriveSequenceContext(logs, today))

  it('실제 기록일에서 신호가 사라지면 endBoundary=observed', () => {
    const logs = [
      hardMind('2026-08-06'),
      hardMind('2026-08-07'),
      makeLog({ date: '2026-08-08' }), // 기록 있음, state_tired 미선택 → 관찰된 종료
    ]
    const r = runOf(seqRuns(logs), 'state_tired')
    expect(r.endDate).toBe('2026-08-07')
    expect(r.endBoundary).toBe('observed')
  })

  it('DailyLog 미기록으로 끊기면 endBoundary=missing_gap (회복으로 처리하지 않음)', () => {
    const logs = [hardMind('2026-08-06'), hardMind('2026-08-07')] // 8/08 이후 DailyLog 없음
    const r = runOf(seqRuns(logs), 'state_tired')
    expect(r.endBoundary).toBe('missing_gap')
    expect(r.endBoundary).not.toBe('observed') // 미기록을 정상·회복으로 단정하지 않음
  })

  it('rhythm exception으로 끊기면 endBoundary=exception', () => {
    const logs = [
      hardMind('2026-08-06'),
      hardMind('2026-08-07'),
      makeLog({ date: '2026-08-08', bodyEnergyLevel: 'empty', rhythmExceptionCodes: ['illness'] }), // 예외일
    ]
    const r = runOf(seqRuns(logs), 'state_tired')
    expect(r.endDate).toBe('2026-08-07')
    expect(r.endBoundary).toBe('exception')
  })

  it('분석 범위 끝까지 이어지면 endBoundary=range_edge', () => {
    const logs = [hardMind('2026-08-06'), hardMind('2026-08-07')]
    const r = runOf(seqRuns(logs, '2026-08-07'), 'state_tired') // today=끝날=8/7
    expect(r.endDate).toBe('2026-08-07')
    expect(r.endBoundary).toBe('range_edge')
  })

  it('분석 범위 시작이면 startBoundary=range_edge', () => {
    const logs = [hardMind('2026-08-06'), hardMind('2026-08-07')]
    const r = runOf(seqRuns(logs), 'state_tired')
    expect(r.startBoundary).toBe('range_edge') // 8/06 이전은 관찰 범위 밖
  })

  it('미기록으로 끝난 run에서는 aftereffect를 새로 만들지 않는다', () => {
    // thought_loop 8/6~8/7 (미기록으로 종료), worrying 8/9~8/10
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['worrying'] }),
      makeLog({ date: '2026-08-10', mindSignalCodes: ['worrying'] }),
    ]
    const items = buildEpisodeTimeline({ dailyLogs: logs }, TODAY)
    const ctx = deriveSequenceContext(logs, TODAY)
    const runs = buildTimelineRuns(items, ctx)
    expect(runOf(runs, 'thought_loop').endBoundary).toBe('missing_gap')
    const aftereffects = buildTimelineAftereffects(runs, buildTimelineTransitions(runs, ctx))
    expect(aftereffects.some((a) => a.sourceKey === 'thought_loop')).toBe(false)
  })
})

/* =====================================================================
   의미상 중복 helper (다음 단계 준비)
   ===================================================================== */
describe('areSemanticallyOverlappingSignals', () => {
  it('지정된 의미상 중복 조합은 true (순서 무관)', () => {
    expect(areSemanticallyOverlappingSignals('mind_would_not_rest', 'state_mind_busy')).toBe(true)
    expect(areSemanticallyOverlappingSignals('state_mind_busy', 'mind_would_not_rest')).toBe(true)
    expect(areSemanticallyOverlappingSignals('hard_to_start', 'state_daily_tasks_hard')).toBe(true)
    expect(areSemanticallyOverlappingSignals('sensory_overload', 'state_people_hard')).toBe(true)
    expect(areSemanticallyOverlappingSignals('no_desire', 'state_daily_tasks_hard')).toBe(true)
  })

  it('관계없는 조합·자기 자신은 false', () => {
    expect(areSemanticallyOverlappingSignals('thought_loop', 'state_tired')).toBe(false)
    expect(areSemanticallyOverlappingSignals('state_mind_busy', 'state_mind_busy')).toBe(false)
    expect(areSemanticallyOverlappingSignals('worrying', 'sleep_late')).toBe(false)
  })
})
