/* =====================================================================
   MODE · Rhythm 반복 흐름 — 실제 service 경로 통합 검증 (update5 audit §12)
   스타일/스냅샷 주입이 아니라 실제 repository fixture → episodeInsightService →
   repeatedMotifs → Rhythm presenter 전체 경로로 카드를 만든다.
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../../../data/reset'
import { dailyLogRepository } from '../../../data/repositories'
import { getEpisodeInsightSnapshot } from '../../../data/services/episodeInsightService'
import { addDaysISO } from '../../../engine'
import type { DailyLogInput } from '../../../data/models'
import { presentRhythmRepeatedFlow } from '../rhythmRepeatedFlow'

const TODAY = '2026-08-20'
const ZERO = {
  moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0, calm: 0, energy: 0, focus: 0, selfCriticism: 0,
  impulsivity: 0, appetite: 0, sweetCraving: 0, saltyCraving: 0, bingeUrge: 0, bodyDiscomfort: 0, pain: 0, bloating: 0,
  fatigue: 0, headache: 0, digestion: 0,
}
const putDay = (date: string, partial: Partial<DailyLogInput> = {}) => dailyLogRepository.upsert({ date, ...ZERO, ...partial })

/** completed 3단계 흐름(thought_loop → 다음날 bedtime_delay → state 저하) + 안정 2일. */
async function seedCompletedFlow(base: string, stateLag: 1 | 2) {
  const d = (n: number) => addDaysISO(base, n)
  await putDay(d(0), { mindSignalCodes: ['thought_loop'] })
  await putDay(d(1), {})
  await putDay(d(2), { lastNightSleep: { issues: ['bedtime_delay'] }, ...(stateLag === 1 ? { functionLevel: 4 as const } : {}) })
  if (stateLag === 2) await putDay(d(3), { functionLevel: 4 })
  const stateDay = stateLag === 1 ? 2 : 3
  await putDay(d(stateDay + 1), {})
  await putDay(d(stateDay + 2), {})
}

const FORBIDDEN =
  /가능성이|추정|추측|예상|예측|경향|편이에요|신뢰도|위험도|증상|진단|몸 에너지|생활기능|감정 부담|episode|motif|transition|factorGroup|state_|_delay|_hard|thought_loop|bedtime|nightOf/

beforeEach(async () => {
  await resetDatabase()
})

describe('Rhythm 반복 흐름 — 실제 service-fed 경로', () => {
  it('completed 3회 흐름이 실제 snapshot을 거쳐 반복 카드로 렌더된다', async () => {
    await seedCompletedFlow('2025-09-01', 1)
    await seedCompletedFlow('2025-11-01', 2)
    await seedCompletedFlow('2026-01-05', 1)

    // 실제 repository → service
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(snap.repeatedMotifs).toHaveLength(1)
    expect(snap.repeatedMotifs[0].occurrenceCount).toBe(3)

    // 실제 snapshot → Rhythm presenter
    const cards = presentRhythmRepeatedFlow(snap)
    expect(cards).toHaveLength(1)
    // 문장은 실제 반복 순서(마음 → 다음 날 수면 → 일 저하)를 사람말로 말한다.
    expect(cards[0].sentence).toContain('최근 세 번의 비슷한 흐름에서는')
    expect(cards[0].sentence).toContain('같은 생각이 계속 맴돈')
    expect(cards[0].sentence).toContain('평소 하던 일이 버거워졌어요')
    // 실제 시작일(2025-09-01 · 2025-11-01 · 2026-01-05) — 기준 연도(최근=2026)는 연도 생략,
    // 다른 해(2025)만 연도 포함.
    expect(cards[0].dates).toContain('2025년 9월 1일')
    expect(cards[0].dates).toContain('1월 5일에 시작됐어요')
    // 진행 중/현재 일치/내부 key/금지 표현은 노출하지 않는다.
    expect(cards[0].sentence).not.toMatch(FORBIDDEN)
    expect(cards[0].dates).not.toMatch(FORBIDDEN)
  })

  it('completed 2회면 반복 카드가 없다(섹션 숨김)', async () => {
    await seedCompletedFlow('2025-09-01', 1)
    await seedCompletedFlow('2025-11-01', 1)
    const snap = await getEpisodeInsightSnapshot(TODAY)
    expect(presentRhythmRepeatedFlow(snap)).toEqual([])
  })
})
