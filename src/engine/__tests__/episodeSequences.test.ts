import { describe, expect, it } from 'vitest'
import {
  buildEpisodeTimeline,
  buildTimelineRuns,
  buildTimelineTransitions,
  buildTimelineAftereffects,
  deriveSequenceContext,
  type EpisodeSequenceContext,
  type TimelineRun,
} from '../episodeTimeline'
import { makeLog } from './factories'
import type { DailyLog } from '../../data/models'

const TODAY = '2026-08-31'

const seq = (logs: DailyLog[], ctx?: EpisodeSequenceContext) => {
  const items = buildEpisodeTimeline({ dailyLogs: logs }, TODAY)
  const c = ctx ?? deriveSequenceContext(logs)
  const runs = buildTimelineRuns(items, c)
  const transitions = buildTimelineTransitions(runs, c)
  const aftereffects = buildTimelineAftereffects(runs, transitions, c)
  return { items, runs, transitions, aftereffects }
}

const run = (runs: TimelineRun[], key: string, start?: string) =>
  runs.find((r) => r.key === key && (start === undefined || r.startDate === start))

/* =====================================================================
   run 병합·분리
   ===================================================================== */
describe('buildTimelineRuns — 이어진 구간', () => {
  it('(1) 같은 key 연속일을 하나의 run으로 병합한다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'] }),
    ]
    const { runs } = seq(logs)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ key: 'thought_loop', source: 'mind', startDate: '2026-08-06', endDate: '2026-08-08', validDays: 3, calendarDays: 3 })
  })

  it('(2) 실제 기록일에 미선택이면 run을 분리한다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07' }), // 기록은 있으나 thought_loop 미선택
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'] }),
    ]
    const { runs } = seq(logs)
    expect(runs.filter((r) => r.key === 'thought_loop')).toHaveLength(2)
  })

  it('(3) 미기록일을 정상(없음)으로 채우지 않고 경계로 분리한다', () => {
    // 8/7 DailyLog 자체가 없음(미기록). 8/6·8/8만 기록.
    const logs = [makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }), makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'] })]
    const { runs } = seq(logs)
    expect(runs.filter((r) => r.key === 'thought_loop')).toHaveLength(2)
    // 8/7을 자동으로 run에 끼워넣지 않는다.
    expect(runs.every((r) => !r.dates.includes('2026-08-07'))).toBe(true)
  })

  it('(4) 3일 이상 연속 미기록은 확실한 새 블록 — transition으로 잇지 않는다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      // 8/7~8/09 미기록
      makeLog({ date: '2026-08-10', mindSignalCodes: ['worrying'] }),
    ]
    const { runs, transitions } = seq(logs)
    expect(runs).toHaveLength(2)
    expect(transitions).toHaveLength(0) // lag 4 이자 3일+ 공백 경계
  })

  it('(5) 예외일이 끼면 일반 흐름을 분리하고 그날을 run에서 뺀다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'], rhythmExceptionCodes: ['illness'] }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['thought_loop'] }),
    ]
    const { runs } = seq(logs)
    expect(runs.filter((r) => r.key === 'thought_loop')).toHaveLength(2)
    expect(runs.every((r) => !r.dates.includes('2026-08-08'))).toBe(true)
  })

  it('(6) 월 경계라도 실제 기록이 연속이면 하나의 run으로 유지한다', () => {
    const logs = [makeLog({ date: '2026-07-31', mindSignalCodes: ['worrying'] }), makeLog({ date: '2026-08-01', mindSignalCodes: ['worrying'] })]
    const { runs } = seq(logs)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ startDate: '2026-07-31', endDate: '2026-08-01', validDays: 2, calendarDays: 2 })
  })

  it('(7) factorGroup이 같아도 eventKey가 다르면 별도 run', () => {
    // bedtime_delay·phone_sleep_delay는 둘 다 factorGroup "bedtime_delay".
    const logs = [makeLog({ date: '2026-08-07', lastNightSleep: { issues: ['bedtime_delay', 'phone_sleep_delay'] } })]
    const { runs } = seq(logs)
    const bd = run(runs, 'bedtime_delay')!
    const ph = run(runs, 'phone_sleep_delay')!
    expect(bd.factorGroup).toBe('bedtime_delay')
    expect(ph.factorGroup).toBe('bedtime_delay')
    expect(bd.key).not.toBe(ph.key)
    expect(runs).toHaveLength(2)
  })

  it('(8) mind/sleep/event source를 합치지 않고 보존한다', () => {
    const logs = [makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['sleep_late'] } })]
    const items = buildEpisodeTimeline({ dailyLogs: logs, eventLogs: [{ date: '2026-08-07', eventCode: 'work_heavy', eventLabel: 'x', category: 'unknown', timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'work', createdAt: '' }] }, TODAY)
    const runs = buildTimelineRuns(items, deriveSequenceContext(logs))
    expect(run(runs, 'thought_loop')!.source).toBe('mind')
    expect(run(runs, 'sleep_late')!.source).toBe('sleep')
    expect(run(runs, 'work_heavy')!.source).toBe('event')
  })
})

/* =====================================================================
   수면 recordedOn / nightOf 정렬
   ===================================================================== */
describe('수면 날짜 정렬 — recordedOn vs nightOf', () => {
  it('(9) sleep item은 recordedOn과 nightOf를 모두 보존한다', () => {
    const items = buildEpisodeTimeline({ dailyLogs: [makeLog({ date: '2026-08-08', lastNightSleep: { issues: ['bedtime_delay'] } })] }, TODAY)
    const sleep = items.find((i) => i.eventKey === 'bedtime_delay')!
    expect(sleep.recordedOn).toBe('2026-08-08')
    expect(sleep.nightOf).toBe('2026-08-07')
    expect(sleep.date).toBe('2026-08-08') // 타임라인 date는 기존대로 recordedOn 유지
  })

  it('(10) D 낮 상태 → D+1 수면은 nightOf(=D) 기준으로 정렬한다', () => {
    // 8/7 낮 thought_loop, 8/8 아침 기록 lastNightSleep(=8/7 밤).
    const logs = [makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }), makeLog({ date: '2026-08-08', lastNightSleep: { issues: ['bedtime_delay'] } })]
    const { runs, transitions } = seq(logs)
    // 수면 run은 nightOf 8/7에 놓인다.
    expect(run(runs, 'bedtime_delay')!.startDate).toBe('2026-08-07')
    // 같은 밤(8/7)에 놓여 lag 0.
    const t = transitions.find((x) => x.fromKey === 'thought_loop' && x.toKey === 'bedtime_delay')!
    expect(t.lagDays).toBe(0)
  })

  it('(11) 같은 날짜 lastNightSleep를 그날 낮 이후로 계산하지 않는다', () => {
    // 8/7 낮 thought_loop + 8/7 아침 기록 lastNightSleep(=8/6 밤).
    const logs = [makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['sleep_late'] } })]
    const { runs, transitions } = seq(logs)
    expect(run(runs, 'sleep_late')!.startDate).toBe('2026-08-06') // 낮(8/7)보다 앞
    // 수면(8/6) → 낮(8/7) 방향만, 낮→수면(같은 날) 관계는 없다.
    expect(transitions.some((t) => t.fromKey === 'thought_loop' && t.toKey === 'sleep_late')).toBe(false)
    expect(transitions.some((t) => t.fromKey === 'sleep_late' && t.toKey === 'thought_loop' && t.lagDays === 1)).toBe(true)
  })
})

/* =====================================================================
   transition · aftereffect
   ===================================================================== */
describe('buildTimelineTransitions / Aftereffects', () => {
  it('(12) lag 0·1·2를 정확히 계산한다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop', 'worrying'] }), // 같은 날 시작 → lag 0
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'worrying', 'on_edge'] }), // on_edge lag 1
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop', 'self_blame'] }), // self_blame lag 2
    ]
    const { transitions } = seq(logs)
    expect(transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'worrying')!.lagDays).toBe(0)
    expect(transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'on_edge')!.lagDays).toBe(1)
    expect(transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'self_blame')!.lagDays).toBe(2)
  })

  it('(13) 실제 겹친 날짜 수를 overlapDays로 계산한다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'worrying'] }),
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop', 'worrying'] }),
    ]
    const { transitions } = seq(logs)
    // thought_loop {6,7,8} vs worrying {7,8} → 겹침 2
    expect(transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'worrying')!.overlapDays).toBe(2)
  })

  it('(14) 같은 from/to가 여러 번이면 가장 가까운 대표 하나만 유지', () => {
    const logs = [
      makeLog({ date: '2026-08-01', mindSignalCodes: ['worrying'] }), // A run1
      makeLog({ date: '2026-08-02' }), // A 미선택(기록 있음) → A run 분리
      makeLog({ date: '2026-08-03', mindSignalCodes: ['worrying', 'thought_loop'] }), // A run2 + B
      makeLog({ date: '2026-08-04', mindSignalCodes: ['thought_loop'] }),
    ]
    const { transitions } = seq(logs)
    const aToB = transitions.filter((t) => t.fromKey === 'worrying' && t.toKey === 'thought_loop')
    expect(aToB).toHaveLength(1)
    expect(aToB[0].lagDays).toBe(0) // 8/3 시작 A run2 → 8/3 시작 B
  })

  it('(15) aftereffect: 먼저 끝난 뒤 후속이 남은 일수를 계산한다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'worrying'] }),
      makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop', 'worrying'] }),
      makeLog({ date: '2026-08-09', mindSignalCodes: ['worrying'] }),
      makeLog({ date: '2026-08-10', mindSignalCodes: ['worrying'] }),
    ]
    const { aftereffects } = seq(logs)
    const ae = aftereffects.find((a) => a.sourceKey === 'thought_loop' && a.remainingKey === 'worrying')!
    expect(ae).toMatchObject({ sourceEndDate: '2026-08-08', remainingEndDate: '2026-08-10', extraDays: 2 })
  })

  it('(16) 미기록 공백으로 생긴 종료일 차이는 aftereffect로 만들지 않는다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop', 'worrying'] }),
      makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop', 'worrying'] }),
      // 8/08 미기록
      makeLog({ date: '2026-08-09', mindSignalCodes: ['worrying'] }), // worrying이 공백 뒤 다시 등장(별도 run)
    ]
    const { aftereffects } = seq(logs)
    // 8/09 worrying은 8/07 worrying과 끊긴 별도 run이고, thought_loop와 겹치지 않아 가짜 여파 없음.
    expect(aftereffects.filter((a) => a.remainingEndDate === '2026-08-09')).toHaveLength(0)
  })

  it('(17) 예외일을 넘는 transition/aftereffect는 만들지 않는다', () => {
    const logs = [
      makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
      makeLog({ date: '2026-08-07', rhythmExceptionCodes: ['illness'] }), // 예외일
      makeLog({ date: '2026-08-08', mindSignalCodes: ['worrying'] }),
    ]
    const { transitions, aftereffects } = seq(logs)
    expect(transitions.some((t) => t.fromKey === 'thought_loop' && t.toKey === 'worrying')).toBe(false)
    expect(aftereffects).toHaveLength(0)
  })
})

/* =====================================================================
   고정 테스트 데이터(스펙 §7)
   ===================================================================== */
describe('고정 데이터 — 정확한 결과', () => {
  const logs = [
    makeLog({ date: '2026-08-06', mindSignalCodes: ['thought_loop'] }),
    makeLog({ date: '2026-08-07', mindSignalCodes: ['thought_loop'] }),
    makeLog({ date: '2026-08-08', mindSignalCodes: ['thought_loop'], lastNightSleep: { issues: ['bedtime_delay'] } }), // nightOf 8/7
    makeLog({ date: '2026-08-09', lastNightSleep: { issues: ['bedtime_delay', 'sleep_late'] } }), // nightOf 8/8
    makeLog({ date: '2026-08-10', lastNightSleep: { issues: ['sleep_late'] } }), // nightOf 8/9
    makeLog({ date: '2026-08-11' }), // 기록 있음, thought_loop·sleep_late 없음
  ]

  it('run 시작·끝이 nightOf 기준으로 정확하다', () => {
    const { runs } = seq(logs)
    expect(run(runs, 'thought_loop')).toMatchObject({ startDate: '2026-08-06', endDate: '2026-08-08', validDays: 3 })
    expect(run(runs, 'bedtime_delay')).toMatchObject({ startDate: '2026-08-07', endDate: '2026-08-08', validDays: 2 })
    expect(run(runs, 'sleep_late')).toMatchObject({ startDate: '2026-08-08', endDate: '2026-08-09', validDays: 2 })
  })

  it('transition·overlap·aftereffect가 기대값과 일치한다', () => {
    const { transitions, aftereffects } = seq(logs)
    const tlToBd = transitions.find((t) => t.fromKey === 'thought_loop' && t.toKey === 'bedtime_delay')!
    expect(tlToBd).toMatchObject({ lagDays: 1, overlapDays: 2 })
    const ae = aftereffects.find((a) => a.sourceKey === 'thought_loop' && a.remainingKey === 'sleep_late')!
    expect(ae.extraDays).toBe(1)
  })

  it('recordedOn과 nightOf가 모두 보존된다', () => {
    const items = buildEpisodeTimeline({ dailyLogs: logs }, TODAY)
    const bd = items.find((i) => i.eventKey === 'bedtime_delay' && i.recordedOn === '2026-08-08')!
    expect(bd.nightOf).toBe('2026-08-07')
    expect(bd.recordedOn).toBe('2026-08-08')
  })
})
