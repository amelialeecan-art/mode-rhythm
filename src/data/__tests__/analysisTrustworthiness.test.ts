import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { db } from '../db'
import { DB_NAME, DB_VERSION, SCHEMA_V1 } from '../schema'
import { saveDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getTodaySummary } from '../services/dailyScoreService'
import {
  getAnalysisViewModel,
  isValidOutcomeLog,
  eventOccurrenceDate,
  analysisStageFor,
} from '../services/patternAnalysisService'
import { buildCycleContext } from '../../engine'
import { addDaysISO } from '../../engine'
import { FACTOR_GROUP_DISPLAY, RECOVERY_LIKE_FACTOR_GROUPS } from '../catalog/events'
import type { CycleLog, DailyLog } from '../models'
import serviceSource from '../services/patternAnalysisService.ts?raw'

/* 합성 데이터만 사용 (실제 사용자 백업 미사용). */

const END = '2026-08-31'
function makeLog(p: Partial<DailyLog> = {}): DailyLog {
  return {
    date: '2026-08-01', moodLow: 0, anxiety: 0, irritability: 0, sadness: 0, heaviness: 0, calm: 0,
    energy: 0, focus: 0, selfCriticism: 0, impulsivity: 0, appetite: 0, sweetCraving: 0, saltyCraving: 0,
    bingeUrge: 0, bodyDiscomfort: 0, pain: 0, bloating: 0, fatigue: 0, headache: 0, digestion: 0,
    stateCodes: [], createdAt: '', updatedAt: '', ...p,
  }
}
function draft(date: string, p: Partial<DailyEntryDraft> = {}): DailyEntryDraft {
  return { ...emptyDraft(date), ...p, date }
}
const HIGH = { stateCodes: ['anxious', 'sad'], overallIntensity: 'much' as const }
const MED = { stateCodes: ['irritable'], overallIntensity: 'some' as const }
const LOW = { stateCodes: ['calm'], overallIntensity: 'some' as const }

/** total일을 END에서 역순으로 채운다. optFor(i)가 각 날 draft 부분을 준다. */
async function seed(total: number, optFor: (i: number) => Partial<DailyEntryDraft>, end = END) {
  const start = addDaysISO(end, -(total - 1))
  for (let i = 0; i < total; i++) {
    await saveDailyEntry(draft(addDaysISO(start, i), optFor(i)))
  }
}

// 요인 시드: 짝수일=요인(reply_stress)+높은 상태, 홀수일=낮은 상태
const factorOpt = (i: number): Partial<DailyEntryDraft> =>
  i % 2 === 0 ? { ...HIGH, catalogEventCodes: ['reply_stress'] } : { ...LOW }

// 조합 시드: 앞 9일 A&B+높음, 다음 5일 A만+중간, 다음 5일 B만+중간, 나머지 낮음
const comboOpt = (i: number): Partial<DailyEntryDraft> => {
  if (i < 9) return { ...HIGH, catalogEventCodes: ['reply_stress', 'work_heavy'] }
  if (i < 14) return { ...MED, catalogEventCodes: ['reply_stress'] }
  if (i < 19) return { ...MED, catalogEventCodes: ['work_heavy'] }
  return { ...LOW }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('유효 결과일 판정 (1~4)', () => {
  it('1. 빈 dailyLog(모든 값 0, stateCodes=[])는 유효 결과일에서 제외', () => {
    expect(isValidOutcomeLog(makeLog())).toBe(false)
    // memo만 있는 날도 숫자 비교 결과일에서 제외
    expect(isValidOutcomeLog(makeLog({ memo: '오늘 메모' }))).toBe(false)
  })
  it('2. stateCodes가 있으면 숫자 0이어도 유효', () => {
    expect(isValidOutcomeLog(makeLog({ stateCodes: ['calm'] }))).toBe(true)
  })
  it('3. 숫자 상태값이 있는 옛 기록(stateCodes 없음)도 유효', () => {
    expect(isValidOutcomeLog(makeLog({ stateCodes: undefined, anxiety: 5 }))).toBe(true)
    expect(isValidOutcomeLog(makeLog({ sleepHours: 6 }))).toBe(true)
    expect(isValidOutcomeLog(makeLog({ appetiteRatings: { appetite: 5 } }))).toBe(true)
  })
  it('4. 저장일 수와 비교 가능일 수가 구분된다', async () => {
    await seed(10, () => ({ ...LOW })) // 유효 10일
    await saveDailyEntry(draft(addDaysISO(END, -20))) // 빈 저장 1
    await saveDailyEntry(draft(addDaysISO(END, -21))) // 빈 저장 2
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.savedDayCount).toBe(12)
    expect(vm.validOutcomeDayCount).toBe(10)
  })
})

describe('분석 단계 게이팅 (5~8)', () => {
  it('단계 경계', () => {
    expect(analysisStageFor(13)).toBe('collecting')
    expect(analysisStageFor(14)).toBe('early_flow')
    expect(analysisStageFor(30)).toBe('factor_ready')
    expect(analysisStageFor(45)).toBe('combo_ready')
    expect(analysisStageFor(60)).toBe('sufficient')
  })
  it('5. 29일에는 factor 카드 없음', async () => {
    await seed(29, factorOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.validOutcomeDayCount).toBe(29)
    expect(vm.factorPatterns).toHaveLength(0)
  }, 30000)
  it('6. 30일에는 factor 카드 가능', async () => {
    await seed(30, factorOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.validOutcomeDayCount).toBe(30)
    expect(vm.factorPatterns.length).toBeGreaterThan(0)
  }, 30000)
  it('7. 44일에는 combo 없음', async () => {
    await seed(44, comboOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.validOutcomeDayCount).toBe(44)
    expect(vm.combos).toHaveLength(0)
  }, 40000)
  it('8. 45일에는 combo 가능', async () => {
    await seed(45, comboOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.validOutcomeDayCount).toBe(45)
    expect(vm.combos.length).toBeGreaterThan(0)
  }, 40000)
})

describe('사건 timing 보수 처리 (15~18)', () => {
  it('15. today 사건은 저장 날짜에 반영', () => {
    expect(eventOccurrenceDate('today', '2026-08-10')).toBe('2026-08-10')
  })
  it('16. yesterday 사건은 전날로 이동', () => {
    expect(eventOccurrenceDate('yesterday', '2026-08-10')).toBe('2026-08-09')
  })
  it('17/18. recent3days/recent7days는 정밀 분석에서 제외(여러 날짜 복제 없음 → null)', () => {
    expect(eventOccurrenceDate('recent3days', '2026-08-10')).toBeNull()
    expect(eventOccurrenceDate('recent7days', '2026-08-10')).toBeNull()
  })
  it('exact 사건은 고른 발생일을 그대로 쓴다(없으면 기록 날짜)', () => {
    expect(eventOccurrenceDate('exact', '2026-08-10', '2026-08-05')).toBe('2026-08-05')
    expect(eventOccurrenceDate('exact', '2026-08-10')).toBe('2026-08-10')
  })
  it('옛 recent 기간 기록은 정밀 분석(factor)에서 제외된다 (읽기 호환)', async () => {
    // 새 입력은 recent를 만들지 않는다. 옛 형식(recent3days) 사건을 raw로 주입해
    // 읽기 호환에서 여전히 factor 후보에서 빠지는지 확인한다.
    await seed(30, (i) => (i % 2 === 0 ? { ...HIGH } : { ...LOW }))
    const start = addDaysISO(END, -29)
    const raw = []
    for (let i = 0; i < 30; i += 2) {
      raw.push({
        date: addDaysISO(start, i), eventCode: 'reply_stress', eventLabel: '연락/답장 때문에 신경 쓰였음',
        category: 'relationship' as const, timing: 'recent3days' as const, intensity: 6, isCustom: false,
        mappedFactorGroup: 'reply_stress', createdAt: new Date().toISOString(),
      })
    }
    await db.eventLogs.bulkAdd(raw)
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.factorPatterns.find((f) => f.factorGroup === 'reply_stress')).toBeUndefined()
  }, 30000)
})

describe('회복성 사건 제외 (19~20)', () => {
  it('상수에 exercise/walk/self_care가 포함된다', () => {
    for (const g of ['exercise', 'walk', 'self_care']) expect(RECOVERY_LIKE_FACTOR_GROUPS.has(g)).toBe(true)
  })
  it('19/20. 운동/산책/씻음은 factor 후보에서 제외되지만 recovery 분석에는 남는다', async () => {
    // 요인일에 '산책함'(walk 그룹) 사건 + 회복행동 walk 기록
    await seed(30, (i) =>
      i % 2 === 0
        ? { ...HIGH, catalogEventCodes: ['walked'], recoveryCodes: ['walk'], recoveryEffect: 'little_better' }
        : { ...LOW },
    )
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.factorPatterns.find((f) => f.factorGroup === 'walk')).toBeUndefined()
    expect(vm.recoveryEffects.some((r) => r.actionCode === 'walk')).toBe(true)
  }, 30000)
})

describe('combo 안전장치 (21~23)', () => {
  it('21/22. A만 또는 B만 표본이 부족하면 combo 거부(baseline 대체 없음)', async () => {
    // A&B 6일, A만 2일(부족), B만 6일, 나머지 낮음 → A-only<4 → combo 없음
    await seed(45, (i) => {
      if (i < 6) return { ...HIGH, catalogEventCodes: ['reply_stress', 'work_heavy'] }
      if (i < 8) return { ...MED, catalogEventCodes: ['reply_stress'] }
      if (i < 14) return { ...MED, catalogEventCodes: ['work_heavy'] }
      return { ...LOW }
    })
    const vm = await getAnalysisViewModel({ endDate: END })
    expect(vm.combos.find((c) => new Set([c.factorA, c.factorB]).has('reply_stress'))).toBeUndefined()
  }, 40000)
  it('23. combo support가 충분(≥5)하고 A만/B만 4↑이면 combo 노출', async () => {
    await seed(45, comboOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    const combo = vm.combos.find((c) => new Set([c.factorA, c.factorB]).size === 2)
    expect(combo).toBeDefined()
    expect(combo!.supportCount).toBeGreaterThanOrEqual(5)
    expect(combo!.factorAOnlyCount).toBeGreaterThanOrEqual(4)
    expect(combo!.factorBOnlyCount).toBeGreaterThanOrEqual(4)
  }, 40000)
})

describe('표시 정보 (12~14, 24~25)', () => {
  it('6/24. factor 카드가 그룹 표준 라벨을 쓴다', async () => {
    await seed(30, factorOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    const f = vm.factorPatterns.find((x) => x.factorGroup === 'reply_stress')
    expect(f).toBeDefined()
    expect(f!.title).toBe(FACTOR_GROUP_DISPLAY['reply_stress'].title)
    expect(f!.subtitle).toBe(FACTOR_GROUP_DISPLAY['reply_stress'].subtitle)
  }, 30000)
  it('25. factor 카드에 comparisonCount와 두 평균이 담긴다', async () => {
    await seed(30, factorOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    const f = vm.factorPatterns[0]
    expect(typeof f.comparisonCount).toBe('number')
    expect(typeof f.withFactorMean).toBe('number')
    expect(typeof f.withoutFactorMean).toBe('number')
    expect(f.effectSize).toBeGreaterThanOrEqual(8)
  }, 30000)
  it('12. 30~44일은 표시 등급이 초기 관찰 이하', async () => {
    await seed(30, factorOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    for (const f of vm.factorPatterns) {
      expect(['reference', 'early']).toContain(f.evidence)
    }
  }, 30000)
  it('13/14. 45~59일은 반복 관찰 이하 (자료 충분 금지)', async () => {
    await seed(45, comboOpt)
    const vm = await getAnalysisViewModel({ endDate: END })
    for (const f of vm.factorPatterns) expect(f.evidence).not.toBe('sufficient')
    for (const c of vm.combos) expect(c.evidence).not.toBe('sufficient')
  }, 40000)
})

describe('Today 사건 표시 (26)', () => {
  it('26. 사건 부하 100 대신 개수·주요 사건(최대 3개)을 제공', async () => {
    await saveDailyEntry(
      draft('2026-08-15', {
        ...HIGH,
        catalogEventCodes: ['reply_stress', 'work_heavy', 'conflict', 'sns_heavy'],
        eventIntensity: 'much',
      }),
    )
    const s = await getTodaySummary('2026-08-15')
    expect(s).not.toBeNull()
    expect(s!.eventSummary.count).toBe(4)
    expect(s!.eventSummary.top).toHaveLength(3)
  })
})

describe('생리 데이터 표시 (27~28)', () => {
  const cyc = (date: string, periodStart = false): CycleLog => ({
    date, periodStart, periodEnd: false, createdAt: '', updatedAt: '',
  })
  it('27. 시작 기록 0개면 confidence none (→ 화면 "주기 데이터 없음")', () => {
    expect(buildCycleContext('2026-08-15', []).confidence).toBe('none')
  })
  it('28. 시작 횟수에 따라 low/medium/high 구분', () => {
    expect(buildCycleContext('2026-08-15', [cyc('2026-08-01', true)]).confidence).toBe('low')
    expect(
      buildCycleContext('2026-08-30', [cyc('2026-08-01', true), cyc('2026-08-29', true)]).confidence,
    ).toBe('medium')
    expect(
      buildCycleContext('2026-08-30', [
        cyc('2026-05-01', true), cyc('2026-06-01', true), cyc('2026-07-01', true), cyc('2026-08-01', true),
      ]).confidence,
    ).toBe('high')
  })
})

describe('불변/결합 (29~30)', () => {
  it('29. DB_NAME/DB_VERSION/SCHEMA_V1 불변', () => {
    expect(DB_NAME).toBe('MODELocalDB')
    expect(DB_VERSION).toBe(1)
    expect(Object.keys(SCHEMA_V1)).toHaveLength(7)
    // (참고) db 인스턴스도 동일 스키마
    expect(db.tables.map((t) => t.name).sort()).toEqual(Object.keys(SCHEMA_V1).sort())
  })
  it('30. 분석 서비스는 export/import/PWA 코드에 결합하지 않는다', () => {
    const code = serviceSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code.includes('dataExportService')).toBe(false)
    expect(code.includes('dataImportService')).toBe(false)
    expect(code.includes('pwaUpdate')).toBe(false)
  })
})
