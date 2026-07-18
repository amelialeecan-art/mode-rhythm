import { describe, expect, it } from 'vitest'
import {
  valueAtLag,
  lagSeries,
  cumulativeValue,
  cumulativeWindows,
  consecutiveOccurrence,
  baselineDeviation,
  worseningSlope,
  type DaySeries,
} from '../episodeTime'
import {
  detectEpisodes,
  buildDayTimeline,
  estimateCollapseThreshold,
  assembleEpisodeSignals,
  type EpisodeDayInput,
  type EpisodeEvent,
} from '../episode'
import { factorWindowFor, isLagWithinWindow, DEFAULT_FACTOR_WINDOW } from '../../data/catalog/events'
import type { CycleContext } from '../cycle'

function series(entries: [string, number][]): DaySeries {
  return new Map(entries)
}

/* =====================================================================
   G · 연속 lag / 누적 / 연속발생 / 기준선 / 기울기
   ===================================================================== */
describe('episodeTime — 연속 시간 원시 함수(G)', () => {
  it('valueAtLag / lagSeries', () => {
    const s = series([
      ['2026-06-10', 30],
      ['2026-06-09', 20],
      ['2026-06-08', 10],
    ])
    expect(valueAtLag(s, '2026-06-10', 0)).toBe(30)
    expect(valueAtLag(s, '2026-06-10', 2)).toBe(10)
    expect(valueAtLag(s, '2026-06-10', 3)).toBeUndefined()
    expect(lagSeries(s, '2026-06-10', 3)).toEqual([30, 20, 10, undefined])
  })

  it('cumulativeValue / cumulativeWindows (결측=0)', () => {
    const s = series([
      ['2026-06-10', 5],
      ['2026-06-09', 3],
      ['2026-06-08', 2],
    ])
    expect(cumulativeValue(s, '2026-06-10', 2)).toBe(8)
    expect(cumulativeValue(s, '2026-06-10', 3)).toBe(10)
    expect(cumulativeValue(s, '2026-06-10', 5)).toBe(10) // D-3, D-4 결측=0
    expect(cumulativeWindows(s, '2026-06-10', [2, 3])).toEqual({ 2: 8, 3: 10 })
  })

  it('consecutiveOccurrence — 연속 노출 일수', () => {
    const s = series([
      ['2026-06-10', 1],
      ['2026-06-09', 1],
      ['2026-06-08', 1],
      // 06-07 결측 → 끊김
      ['2026-06-06', 1],
    ])
    expect(consecutiveOccurrence(s, '2026-06-10')).toBe(3)
  })

  it('baselineDeviation — 개인 기준선 대비(D 미포함)', () => {
    const s = series([
      ['2026-06-10', 80],
      ['2026-06-09', 40],
      ['2026-06-08', 20],
    ])
    const r = baselineDeviation(s, '2026-06-10', 30)!
    expect(r.value).toBe(80)
    expect(r.baseline).toBe(30) // (40+20)/2
    expect(r.deviation).toBe(50)
    expect(r.baselineCount).toBe(2)
  })

  it('worseningSlope — anchor로 갈수록 오르면 양수', () => {
    const s = series([
      ['2026-06-10', 30],
      ['2026-06-09', 20],
      ['2026-06-08', 10],
    ])
    expect(worseningSlope(s, '2026-06-10', 3)).toBe(10)
    expect(worseningSlope(s, '2026-06-10', 1)).toBe(0) // 점 1개
  })

  it('누수 방지 — anchor 이후 값을 주입해도 결과 불변(G)', () => {
    const base = series([
      ['2026-06-10', 30],
      ['2026-06-09', 20],
      ['2026-06-08', 10],
    ])
    const before = {
      cum: cumulativeValue(base, '2026-06-10', 3),
      slope: worseningSlope(base, '2026-06-10', 3),
      dev: baselineDeviation(base, '2026-06-10', 30)!.deviation,
    }
    const leaked = new Map(base)
    leaked.set('2026-06-11', 999)
    leaked.set('2026-06-15', 999)
    expect(cumulativeValue(leaked, '2026-06-10', 3)).toBe(before.cum)
    expect(worseningSlope(leaked, '2026-06-10', 3)).toBe(before.slope)
    expect(baselineDeviation(leaked, '2026-06-10', 30)!.deviation).toBe(before.dev)
  })
})

/* =====================================================================
   H · plausible time window
   ===================================================================== */
describe('plausible window(H)', () => {
  it('그룹별 창 + 기본값', () => {
    expect(factorWindowFor('sleep_schedule')).toEqual({ minLag: 3, maxLag: 14, mode: 'trend' })
    expect(factorWindowFor('무명그룹')).toEqual(DEFAULT_FACTOR_WINDOW)
  })
  it('창 밖 lag는 제외', () => {
    expect(isLagWithinWindow('sleep_schedule', 2)).toBe(false) // min 3
    expect(isLagWithinWindow('sleep_schedule', 5)).toBe(true)
    expect(isLagWithinWindow('caffeine_timing', 2)).toBe(false) // max 1
    expect(isLagWithinWindow('interpersonal_stress', 0)).toBe(true)
  })
})

/* =====================================================================
   J · 에피소드 묶기 (start/continuation/recovery)
   ===================================================================== */
function d(date: string, functionLevel?: 1 | 2 | 3 | 4, rhythmLoad?: number): EpisodeDayInput {
  return { date, functionLevel, rhythmLoad }
}

describe('detectEpisodes — 묶기 규칙(J)', () => {
  it('단일 무너짐 → 회복 확정', () => {
    const eps = detectEpisodes([
      d('2026-06-01', 2),
      d('2026-06-02', 4),
      d('2026-06-03', 2),
      d('2026-06-04', 2),
      d('2026-06-05', 2),
    ])
    expect(eps).toHaveLength(1)
    expect(eps[0].startDate).toBe('2026-06-02')
    expect(eps[0].endDate).toBe('2026-06-02')
    expect(eps[0].lengthDays).toBe(1)
    expect(eps[0].peakFunctionLevel).toBe(4)
    expect(eps[0].status).toBe('recovered')
    expect(eps[0].recoveryStartDate).toBe('2026-06-03')
    expect(eps[0].confidence).toBe('reported')
  })

  it('사이 휴지 1일은 같은 에피소드로 잇는다', () => {
    const eps = detectEpisodes([
      d('2026-06-01', 4),
      d('2026-06-02', 2), // 휴지 1일
      d('2026-06-03', 4),
      d('2026-06-04', 2),
      d('2026-06-05', 2),
    ])
    expect(eps).toHaveLength(1)
    expect(eps[0].startDate).toBe('2026-06-01')
    expect(eps[0].endDate).toBe('2026-06-03')
    expect(eps[0].lengthDays).toBe(3)
    expect(eps[0].status).toBe('recovered')
  })

  it('2일 이상 안정이면 별개 에피소드', () => {
    const eps = detectEpisodes([
      d('2026-06-01', 4),
      d('2026-06-02', 2),
      d('2026-06-03', 2), // 휴지 2일 → 분리
      d('2026-06-04', 4),
    ])
    expect(eps).toHaveLength(2)
    expect(eps[0].startDate).toBe('2026-06-01')
    expect(eps[0].status).toBe('recovered')
    expect(eps[1].startDate).toBe('2026-06-04')
    expect(eps[1].status).toBe('ongoing')
  })

  it('마지막 날 무너짐 → ongoing', () => {
    const eps = detectEpisodes([d('2026-06-01', 2), d('2026-06-02', 4)])
    expect(eps[0].status).toBe('ongoing')
    expect(eps[0].recoveryStartDate).toBeUndefined()
  })

  it('회복일 부족(1일) → recovering', () => {
    const eps = detectEpisodes([d('2026-06-01', 4), d('2026-06-02', 2)])
    expect(eps[0].status).toBe('recovering')
    expect(eps[0].daysToRecovery).toBe(1)
  })

  it('functionLevel 미기록은 rhythmLoad로 보조 추정(estimated)', () => {
    const inputs = [d('2026-06-01', undefined, 40), d('2026-06-02', undefined, 90), d('2026-06-03', undefined, 45)]
    const threshold = estimateCollapseThreshold(inputs)
    expect(threshold).toBeCloseTo(73.33, 1)
    const eps = detectEpisodes(inputs)
    expect(eps).toHaveLength(1)
    expect(eps[0].startDate).toBe('2026-06-02')
    expect(eps[0].estimated).toBe(true)
    expect(eps[0].confidence).toBe('estimated')
  })

  it('보고+추정 혼합 → mixed', () => {
    const eps = detectEpisodes([
      d('2026-06-01', 4, 80),
      d('2026-06-02', undefined, 90), // 추정 무너짐 (휴지 없이 이어짐)
      d('2026-06-03', 2, 30),
      d('2026-06-04', 2, 25),
    ])
    expect(eps).toHaveLength(1)
    expect(eps[0].confidence).toBe('mixed')
    expect(eps[0].estimated).toBe(true)
  })

  it('빈 입력 → 빈 목록', () => {
    expect(detectEpisodes([])).toEqual([])
  })

  it('buildDayTimeline은 빠진 날짜를 unknown으로 채운다', () => {
    const tl = buildDayTimeline([d('2026-06-01', 4), d('2026-06-03', 2)])
    expect(tl.map((x) => x.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
    expect(tl[1].state).toBe('unknown')
  })
})

/* =====================================================================
   신호 조립 (§G buckets) + relationToShift + 누수 방지(§12) + 주기(I)
   ===================================================================== */
function ev(date: string, factorGroup: string, label: string, relationToShift?: EpisodeEvent['relationToShift']): EpisodeEvent {
  return { date, factorGroup, label, relationToShift }
}
const EPISODE = detectEpisodes([d('2026-06-10', 4), d('2026-06-11', 2), d('2026-06-12', 2)])[0]

describe('assembleEpisodeSignals — 버킷/관계/누수/주기', () => {
  it('lag별 버킷 분류(당일/전날/선행) + 창 필터', () => {
    const s = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-10', 'interpersonal_stress', '갈등'), // lag0 당일
      ev('2026-06-09', 'sleep_deficit', '잠 부족'), // lag1 전날, 창 0..3
      ev('2026-06-08', 'sleep_deficit', '잠 부족'), // lag2 선행, 창 안
    ])
    expect(s.sameDayCompanion.map((x) => x.factorGroup)).toContain('interpersonal_stress')
    expect(s.dayBeforeWarning.map((x) => x.factorGroup)).toContain('sleep_deficit')
    expect(s.earlyLeadUp.map((x) => x.lagDays)).toContain(2)
  })

  it('허용 창 밖 선행 lag는 제외', () => {
    // sleep_schedule 창 3..14. lag2는 제외, lag5는 배경(trend)으로 포함
    const s = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-08', 'sleep_schedule', '불규칙'), // lag2 → 창 밖, 제외
    ])
    expect(s.earlyLeadUp).toHaveLength(0)
    expect(s.backgroundConditions).toHaveLength(0)
    const s2 = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-05', 'sleep_schedule', '불규칙'), // lag5 → 창 안, 배경
    ])
    expect(s2.backgroundConditions.map((x) => x.factorGroup)).toContain('sleep_schedule')
  })

  it('누적/연속 그룹은 배경 조건으로 집계(occurrences)', () => {
    const s = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-07', 'clutter', '집 지저분'),
      ev('2026-06-06', 'clutter', '집 지저분'),
      ev('2026-06-05', 'clutter', '집 지저분'),
    ])
    const bg = s.backgroundConditions.find((x) => x.factorGroup === 'clutter')!
    expect(bg.occurrences).toBe(3)
    expect(bg.lagDays).toBe(3) // 가장 가까운 발생
  })

  it("relationToShift='after' 사건은 선행에서 빠지고 afterShift로", () => {
    const s = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-09', 'interpersonal_stress', '갈등', 'after'), // lag1이지만 이후로 분류
    ])
    expect(s.dayBeforeWarning).toHaveLength(0)
    expect(s.afterShift.map((x) => x.factorGroup)).toContain('interpersonal_stress')
  })

  it('result_side 그룹(쇼츠/누워있음)은 관계 없어도 afterShift', () => {
    const s = assembleEpisodeSignals(EPISODE, [ev('2026-06-09', 'short_video', '쇼츠')])
    expect(s.dayBeforeWarning).toHaveLength(0)
    expect(s.afterShift.map((x) => x.factorGroup)).toContain('short_video')
  })

  it('누수 방지 — 시작 S 이후 사건은 선행신호에 절대 안 들어간다(§12)', () => {
    const clean = assembleEpisodeSignals(EPISODE, [ev('2026-06-09', 'sleep_deficit', '잠 부족')])
    const leaked = assembleEpisodeSignals(EPISODE, [
      ev('2026-06-09', 'sleep_deficit', '잠 부족'),
      ev('2026-06-11', 'interpersonal_stress', '갈등'), // S 이후
      ev('2026-06-13', 'failure', '실수'), // S 이후
    ])
    expect(leaked.dayBeforeWarning).toEqual(clean.dayBeforeWarning)
    expect(leaked.earlyLeadUp).toEqual(clean.earlyLeadUp)
    expect(leaked.sameDayCompanion).toEqual(clean.sameDayCompanion)
  })

  it('주기 위치(I) — context에서 phase 매핑', () => {
    const ctx: CycleContext = {
      isPeriod: false,
      isPremenstrualWindow: true,
      isOvulationWindow: false,
      daysUntilNextPeriod: 3,
      confidence: 'high',
    }
    const s = assembleEpisodeSignals(EPISODE, [], ctx)
    expect(s.cyclePosition).toEqual({
      phase: 'premenstrual',
      periodDay: undefined,
      daysUntilNextPeriod: 3,
      confidence: 'high',
    })
    // context 없으면 undefined
    expect(assembleEpisodeSignals(EPISODE, []).cyclePosition).toBeUndefined()
  })

  it('confidence none이면 phase unknown', () => {
    const ctx: CycleContext = { isPeriod: false, isPremenstrualWindow: false, isOvulationWindow: false, confidence: 'none' }
    expect(assembleEpisodeSignals(EPISODE, [], ctx).cyclePosition!.phase).toBe('unknown')
  })
})
