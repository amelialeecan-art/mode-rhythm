/* =====================================================================
   MODE · 사용자 문구 전수 점검 (update5 · user-language-audit)
   화면에 실제로 렌더되는 동적 문장을 fixture로 만들어, 개발자식 용어·애매한
   추정·방어적 표현이 없는지 확인한다. (단순 grep 0이 아니라 생성 결과 검사)
   ⚠️ 여기서 검사하는 건 "사용자에게 보이는 표시 문자열"이다. 내부 key·타입명은 대상 아님.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import { resolveDailyStateDomains, describeTodayState, selectTodayDecision } from '../../engine'
import type { RecoveryActionInsight, RecentFlow, PersonalRhythm, MonthlyComparison, FlowDomain } from '../../engine'
import type { DailyLog } from '../../data/models'
import { makeLog } from '../../engine/__tests__/factories'
import { recentChangeSentence, followUpSentence } from '../Today/todayVoice'
import { recentFlowSentence, personalRhythmSentence, monthlyComparisonView, cycleCompareSentence } from '../Rhythm/rhythmVoice'
import { presentRhythmRepeatedFlow } from '../Rhythm/rhythmRepeatedFlow'
import type { EpisodeInsightSnapshot } from '../../data/services/episodeInsightService'

/* §3 금지 표현 + 개발자 용어 + 추상 표현. (일상적 '상태'·정상 슬랭은 제외) */
const FORBIDDEN =
  /가능성이|가능해요|추정|추측|예상|예측|경향|편이에요|편이었|보입니다|판단됩니다|신뢰도|위험도|고위험|의심|증상|진단|조울|우울증|불안장애|공황장애|ADHD|HSP|몸 에너지|정신적 여유|사회적 여유|생활기능|감정 부담|누적 요인|상태 영역|마음 신호|수면 결과|수면 행동|누적 노출|걱정 기록|초기 추정|episode|motif|transition|aftereffect|factorGroup|mindSignal|sleepIssue|nightOf|state_|_delay|_hard|thought_loop/

const clean = (label: string, texts: (string | null | undefined)[]) => {
  for (const t of texts) {
    if (!t) continue
    expect(t, `${label}: "${t}"`).not.toMatch(FORBIDDEN)
  }
}

/* ---- Today: 오늘 상태 narrative (모든 영역 대비) ---- */
describe('Today 오늘 상태 문장 — 금지 표현 없음', () => {
  const drops: Partial<DailyLog>[] = [
    { bodyEnergyLevel: 'empty' },
    { functionLevel: 4 },
    { mentalSpaceLevel: 'overloaded' },
    { socialCapacityLevel: 'low' },
    { focusLevel: 'often_scattered' },
    { emotionalStabilityLevel: 'mostly_shaken', emotionCodes: ['irritated'], emotionImpactLevel: 'most_day' },
    { bodyEnergyLevel: 'low', functionLevel: 3, socialCapacityLevel: 'low', mentalSpaceLevel: 'busy' },
  ]
  it('영역별 상태 문장에 개발자식 용어가 없다', () => {
    let produced = 0
    for (const p of drops) {
      const lines = describeTodayState(resolveDailyStateDomains(makeLog(p)), makeLog(p))
      produced += lines.length
      clean('describeTodayState', lines)
    }
    expect(produced).toBeGreaterThan(0) // fixture가 실제로 문장을 만들었는지 보장
  })
})

/* ---- Today: 오늘의 결정(개인화) ---- */
describe('Today 오늘의 결정 — 금지 표현 없음', () => {
  const rec: RecoveryActionInsight = {
    actionCode: 'sleep_early', actionLabel: '일찍 자기', category: 'body',
    combinedScore: 25, supportCount: 6, confidence: 72, confidenceTier: 'personal_helper', message: '',
  }
  it('개인 회복 결정 문장이 "편이에요" 없이 직접 말한다', () => {
    const d = resolveDailyStateDomains(makeLog({ emotionalStabilityLevel: 'mostly_stable', calm: 6 }))
    const decision = selectTodayDecision({ domains: d, isExceptionDay: false, recoveryRecs: [rec] })
    expect(decision?.source).toBe('personal')
    clean('selectTodayDecision', [decision?.text])
  })
})

/* ---- Today: 최근 변화 / 이어진 변화 ---- */
describe('Today 흐름 보조 문장 — 금지 표현 없음', () => {
  const flow = (leading: FlowDomain[], holding: FlowDomain[] = []): RecentFlow =>
    ({ status: 'depleting', startDate: '2026-08-14', lengthDays: 6, leading, holding, displayable: true })
  it('recentChangeSentence 영역명이 사람말이다', () => {
    clean('recentChangeSentence', [
      recentChangeSentence(flow(['function'])),
      recentChangeSentence(flow(['body', 'function'])),
    ])
  })
  it('followUpSentence 영역명이 사람말이다', () => {
    const driver = { label: '마감·압박', affectedDomains: ['function'] as FlowDomain[], cumulative: true } as Parameters<typeof followUpSentence>[0]
    clean('followUpSentence', [followUpSentence(driver)])
  })
})

/* ---- Rhythm: 최근 흐름 / 반복 흐름 / 월간 비교 / 주기 비교 ---- */
describe('Rhythm 문장 — 금지 표현 없음', () => {
  it('recentFlowSentence 영역명이 사람말이다', () => {
    const f = (leading: FlowDomain[], holding: FlowDomain[]): RecentFlow =>
      ({ status: 'depleting', startDate: '2026-08-12', lengthDays: 8, leading, holding, displayable: true })
    clean('recentFlowSentence', [
      recentFlowSentence(f(['function'], ['body'])),
      recentFlowSentence(f(['body', 'function'], [])),
    ])
  })

  it('personalRhythmSentence 문장이 사람말이다', () => {
    const r: PersonalRhythm = {
      sequence: ['stable', 'depleting', 'recovering'],
      occurrenceCount: 3,
      typicalLengthMin: 18, typicalLengthMax: 22, cycleRelated: true,
      currentMatch: { matchedStates: ['stable', 'depleting'], currentState: 'depleting', daysInCurrentFlow: 4 },
      commonLeadingDomains: ['function', 'body'], commonDrivers: [],
    }
    clean('personalRhythmSentence', personalRhythmSentence(r))
  })

  it('monthlyComparisonView 모든 영역 문구가 사람말이다', () => {
    const domains = ['bodyEnergy', 'functionLevel', 'emotionalStability', 'emotionalBurden', 'mentalSpace', 'focus', 'socialCapacity', 'bodyDiscomfort', 'sleep', 'appetite']
    const insights = domains.map((domain) => ({ key: `state:${domain}`, domain, direction: 'better', kind: 'state', trend: 'down', magnitude: 0.4 }))
    const mc = { partialMonth: false, currentStart: '2026-07-01', previousStart: '2026-06-01', insights } as unknown as MonthlyComparison
    const view = monthlyComparisonView(mc)
    clean('monthlyComparisonView', [view.lead, ...view.lines])
  })

  it('cycleCompareSentence가 "편이에요" 없이 말한다', () => {
    const pts = (v: number) => Array.from({ length: 22 }, (_, i) => ({ rel: i - 14, mean: v }))
    const quieter = { baseline: 50, recent: pts(40), previous: pts(60) }
    clean('cycleCompareSentence', [cycleCompareSentence('emotional', quieter)])
  })
})

/* ---- Rhythm: 반복 흐름 카드(예시 문장 포함) ---- */
describe('Rhythm 반복 흐름 카드 — 금지 표현 없음', () => {
  it('예시 3단계 카드가 금지 표현·내부 key 없이 렌더된다', () => {
    const snap: EpisodeInsightSnapshot = {
      recentEpisode: null, currentMotifMatches: [],
      analysisRange: { recentStartDate: '2026-05-01', motifStartDate: '2025-08-01', endDate: '2026-08-04' },
      repeatedMotifs: [{
        id: 'm', sequenceKeys: ['thought_loop', 'bedtime_delay', 'state_daily_tasks_hard'],
        occurrenceCount: 3,
        occurrences: ['2026-05-01', '2026-06-10', '2026-07-20'].map((s) => ({ episodeId: 'e', episodeStartDate: s, episodeEndDate: s, sequenceStartDate: s, lagDays: [1, 1], matchedRunKeys: [] })),
        typicalLagRanges: [{ min: 1, max: 1 }, { min: 1, max: 2 }], latestOccurrenceDate: '2026-07-20',
      }],
    }
    const cards = presentRhythmRepeatedFlow(snap)
    expect(cards).toHaveLength(1)
    clean('presentRhythmRepeatedFlow', [cards[0].sentence, cards[0].dates])
  })
})
