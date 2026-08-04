import { describe, expect, it } from 'vitest'
import { buildEpisodeTimeline, type EpisodeTimelineItem } from '../episodeTimeline'
import { makeEvent, makeLog } from './factories'

const TODAY = '2026-06-30'

const keys = (items: EpisodeTimelineItem[]) => items.map((i) => `${i.date}:${i.source}:${i.eventKey}`)

/* =====================================================================
   공통 이벤트 타임라인 (update2 연결 1단계 · 순수 함수)
   ===================================================================== */
describe('buildEpisodeTimeline — 병합·정렬·중복 제거', () => {
  it('빈 입력이면 빈 타임라인', () => {
    expect(buildEpisodeTimeline({}, TODAY)).toEqual([])
    expect(buildEpisodeTimeline({ eventLogs: [], dailyLogs: [] }, TODAY)).toEqual([])
  })

  it('날짜순 오름차순으로 정렬한다(같은 날짜는 key순)', () => {
    const out = buildEpisodeTimeline(
      {
        eventLogs: [
          makeEvent({ date: '2026-06-28', eventCode: 'work_heavy', mappedFactorGroup: 'work' }),
          makeEvent({ date: '2026-06-25', eventCode: 'conflict', mappedFactorGroup: 'relation' }),
          makeEvent({ date: '2026-06-28', eventCode: 'argument', mappedFactorGroup: 'relation' }),
        ],
      },
      TODAY,
    )
    expect(out.map((i) => i.date)).toEqual(['2026-06-25', '2026-06-28', '2026-06-28'])
    // 같은 날짜(28일)는 eventKey 오름차순: argument < work_heavy
    expect(out.filter((i) => i.date === '2026-06-28').map((i) => i.eventKey)).toEqual(['argument', 'work_heavy'])
  })

  it('같은 날짜 + 같은 key는 중복 제거하고, 사건을 우선 유지한다', () => {
    const out = buildEpisodeTimeline(
      {
        // legacy sleep 사건과 신규 lastNightSleep이 같은 날 같은 코드
        eventLogs: [makeEvent({ date: '2026-06-27', eventCode: 'sleep_late', mappedFactorGroup: 'sleep_schedule' })],
        dailyLogs: [makeLog({ date: '2026-06-27', lastNightSleep: { issues: ['sleep_late'] } })],
      },
      TODAY,
    )
    const late = out.filter((i) => i.eventKey === 'sleep_late')
    expect(late).toHaveLength(1)
    expect(late[0].source).toBe('event') // 사건 > 수면 우선
  })

  it('수면 issue를 타임라인에 포함한다 — 기존 그룹과 새 그룹 모두', () => {
    const out = buildEpisodeTimeline(
      {
        dailyLogs: [
          makeLog({
            date: '2026-06-26',
            lastNightSleep: {
              issues: ['sleep_waking', 'phone_sleep_delay', 'bedtime_reluctance', 'sleep_onset_difficulty', 'sleep_late'],
            },
          }),
        ],
      },
      TODAY,
    )
    const byKey = new Map(out.map((i) => [i.eventKey, i]))
    // 기존 그룹
    expect(byKey.get('sleep_waking')?.factorGroup).toBe('sleep_quality')
    expect(byKey.get('sleep_late')?.factorGroup).toBe('sleep_schedule')
    // 새 그룹도 포함(getSleepExposureForDate와 달리 걸러내지 않는다)
    expect(byKey.get('phone_sleep_delay')?.factorGroup).toBe('bedtime_delay')
    expect(byKey.get('bedtime_reluctance')?.factorGroup).toBe('bedtime_resistance')
    expect(byKey.get('sleep_onset_difficulty')?.factorGroup).toBe('sleep_onset')
    expect(out.every((i) => i.source === 'sleep')).toBe(true)
  })

  it('매핑 없는 수면 코드는 건너뛴다', () => {
    const out = buildEpisodeTimeline(
      { dailyLogs: [makeLog({ date: '2026-06-26', lastNightSleep: { issues: ['totally_unknown_sleep'] } })] },
      TODAY,
    )
    expect(out).toEqual([])
  })

  it('마음 신호를 타임라인 event로 변환한다(factorGroup은 아직 코드 그대로)', () => {
    const out = buildEpisodeTimeline(
      { dailyLogs: [makeLog({ date: '2026-06-24', mindSignalCodes: ['thought_loop', 'sensory_overload'] })] },
      TODAY,
    )
    expect(out).toHaveLength(2)
    const loop = out.find((i) => i.eventKey === 'thought_loop')!
    expect(loop.source).toBe('mind')
    expect(loop.factorGroup).toBe('thought_loop')
  })

  it('기존 event 로그를 그대로 유지한다(발생 추정일·factorGroup 보존)', () => {
    const out = buildEpisodeTimeline(
      {
        eventLogs: [
          makeEvent({ date: '2026-06-25', timing: 'yesterday', eventCode: 'work_heavy', mappedFactorGroup: 'work' }),
          makeEvent({ date: '2026-06-25', timing: 'exact', occurredOn: '2026-06-20', eventCode: 'trip', mappedFactorGroup: 'life' }),
        ],
      },
      TODAY,
    )
    const work = out.find((i) => i.eventKey === 'work_heavy')!
    expect(work.date).toBe('2026-06-24') // yesterday = date - 1
    expect(work.source).toBe('event')
    expect(work.factorGroup).toBe('work')
    const trip = out.find((i) => i.eventKey === 'trip')!
    expect(trip.date).toBe('2026-06-20') // exact → occurredOn
  })

  it('정확한 발생일이 없는 사건(recent3/7days)은 타임라인에서 제외한다', () => {
    const out = buildEpisodeTimeline(
      {
        eventLogs: [
          makeEvent({ date: '2026-06-25', timing: 'recent3days', eventCode: 'r3' }),
          makeEvent({ date: '2026-06-25', timing: 'recent7days', eventCode: 'r7' }),
          makeEvent({ date: '2026-06-25', timing: 'today', eventCode: 'kept' }),
        ],
      },
      TODAY,
    )
    expect(keys(out)).toEqual(['2026-06-25:event:kept'])
  })

  it('미래 날짜는 타임라인에 넣지 않는다', () => {
    const out = buildEpisodeTimeline(
      {
        eventLogs: [
          makeEvent({ date: '2026-07-05', timing: 'today', eventCode: 'future_event' }),
          makeEvent({ date: '2026-06-29', timing: 'today', eventCode: 'past_event' }),
          // exact 미래 발생일도 제외
          makeEvent({ date: '2026-06-29', timing: 'exact', occurredOn: '2026-07-10', eventCode: 'future_exact' }),
        ],
        dailyLogs: [
          makeLog({ date: '2026-07-01', mindSignalCodes: ['thought_loop'] }),
          makeLog({ date: '2026-06-30', lastNightSleep: { issues: ['sleep_waking'] } }),
        ],
      },
      TODAY,
    )
    expect(out.every((i) => i.date <= TODAY)).toBe(true)
    expect(keys(out)).toEqual(['2026-06-29:event:past_event', '2026-06-30:sleep:sleep_waking'])
  })

  it('세 출처를 하나의 날짜 정렬 타임라인으로 합친다', () => {
    const out = buildEpisodeTimeline(
      {
        eventLogs: [makeEvent({ date: '2026-06-28', timing: 'today', eventCode: 'work_heavy', mappedFactorGroup: 'work' })],
        dailyLogs: [
          makeLog({ date: '2026-06-26', mindSignalCodes: ['worrying'] }),
          makeLog({ date: '2026-06-27', lastNightSleep: { issues: ['bedtime_delay'] } }),
        ],
      },
      TODAY,
    )
    expect(out.map((i) => i.source)).toEqual(['mind', 'sleep', 'event'])
    expect(out.map((i) => i.date)).toEqual(['2026-06-26', '2026-06-27', '2026-06-28'])
  })

  it('회귀: 입력을 변형하지 않고 빈 날짜를 만들지 않는다', () => {
    const eventLogs = [makeEvent({ date: '2026-06-25', eventCode: 'a' })]
    const dailyLogs = [makeLog({ date: '2026-06-28', mindSignalCodes: ['worrying'] })]
    const before = JSON.stringify({ eventLogs, dailyLogs })
    const out = buildEpisodeTimeline({ eventLogs, dailyLogs }, TODAY)
    // 입력 불변
    expect(JSON.stringify({ eventLogs, dailyLogs })).toBe(before)
    // 25일과 28일 사이 빈 날짜(26/27) 자동 생성 없음
    expect(out.map((i) => i.date)).toEqual(['2026-06-25', '2026-06-28'])
  })
})
