import { describe, expect, it } from 'vitest'
import {
  recoveryDelta,
  immediateRecoveryScore,
  dailyRecoveryScore,
  nextDayRecoveryEffect,
  analyzeRecoveryActions,
  recoveryTier,
  type RecoveryDataset,
} from '../recovery'
import type { RecoveryLog } from '../../data/models'
import { addDaysISO } from '../correlation'

function recLog(partial: Partial<RecoveryLog> = {}): RecoveryLog {
  return {
    date: '2026-06-10',
    actionCode: 'walk',
    actionLabel: '산책',
    category: 'body',
    effect: 'little_better',
    createdAt: '',
    ...partial,
  }
}

describe('recoveryDelta', () => {
  it('moodImprovement = afterMood - beforeMood', () => {
    const d = recoveryDelta(recLog({ beforeMood: 3, afterMood: 7 }))
    expect(d.moodImprovement).toBe(4)
    expect(d.hasBeforeAfter).toBe(true)
  })

  it('anxiety가 내려가면 anxietyReduction 양수', () => {
    const d = recoveryDelta(recLog({ beforeAnxiety: 7, afterAnxiety: 3 }))
    expect(d.anxietyReduction).toBe(4)
  })

  it('before/after가 없으면 hasBeforeAfter false', () => {
    const d = recoveryDelta(recLog({}))
    expect(d.hasBeforeAfter).toBe(false)
    expect(d.totalDelta).toBe(0)
  })
})

describe('immediateRecoveryScore (effect 라벨)', () => {
  it('much_better는 높은 점수', () => {
    expect(immediateRecoveryScore(recLog({ effect: 'much_better' }))).toBe(80)
  })
  it('worse는 0점', () => {
    expect(immediateRecoveryScore(recLog({ effect: 'worse' }))).toBe(0)
  })
  it('unknown은 null', () => {
    expect(immediateRecoveryScore(recLog({ effect: 'unknown' }))).toBeNull()
  })
  it('전후값이 있으면 effect 라벨보다 우선 사용한다', () => {
    // anxietyReduction = 8-2 = 6 → raw 6.6 → (6.6/30)*100 = 22 (라벨 same=25가 아님)
    const s = immediateRecoveryScore(recLog({ effect: 'same', beforeAnxiety: 8, afterAnxiety: 2 }))
    expect(s).toBe(22)
  })
})

describe('dailyRecoveryScore', () => {
  it('회복 기록이 있으면 평균 점수, 없으면 0', () => {
    expect(dailyRecoveryScore([recLog({ effect: 'much_better' }), recLog({ effect: 'same' })])).toBe(53) // (80+25)/2
    expect(dailyRecoveryScore([])).toBe(0)
  })
})

function makeDs(): RecoveryDataset {
  // d0..d8, 짝수날 짝수 rhythm 70 / 홀수날 30. walk는 짝수날(d8 제외).
  const dates: string[] = []
  let d = '2026-06-01'
  for (let i = 0; i < 9; i++) {
    dates.push(d)
    d = addDaysISO(d, 1)
  }
  const rhythmByDate = new Map<string, number>()
  const actionsByDate = new Map<string, Set<string>>()
  dates.forEach((date, i) => {
    rhythmByDate.set(date, i % 2 === 0 ? 70 : 30)
    if (i % 2 === 0 && i < 8) actionsByDate.set(date, new Set(['walk']))
  })
  return { dates, rhythmByDate, actionsByDate, baselineRhythm: 50, endDate: dates[dates.length - 1] }
}

describe('nextDayRecoveryEffect', () => {
  it('D+1 점수만 사용한다 (당일 아님)', () => {
    const r = nextDayRecoveryEffect(makeDs(), 'walk', '산책')
    expect(r).not.toBeNull()
    // walk날(짝수, rhythm 70)이지만 다음날(홀수, 30)을 본다
    expect(r!.withActionNextDayMean).toBe(30)
    expect(r!.withoutActionNextDayMean).toBe(70)
    expect(r!.effectSize).toBe(40)
    expect(r!.supportCount).toBe(4)
  })

  it('표본이 부족하면 null', () => {
    const ds: RecoveryDataset = {
      dates: ['2026-06-01', '2026-06-02', '2026-06-03'],
      rhythmByDate: new Map([
        ['2026-06-01', 50],
        ['2026-06-02', 50],
        ['2026-06-03', 50],
      ]),
      actionsByDate: new Map([['2026-06-01', new Set(['walk'])]]),
      baselineRhythm: 50,
      endDate: '2026-06-03',
    }
    expect(nextDayRecoveryEffect(ds, 'walk', '산책')).toBeNull()
  })
})

describe('analyzeRecoveryActions', () => {
  it('combinedScore가 immediate와 nextDay를 섞는다', () => {
    const ds = makeDs()
    const logs: RecoveryLog[] = ['2026-06-01', '2026-06-03', '2026-06-05', '2026-06-07'].map((date) =>
      recLog({ date, effect: 'much_better' }),
    )
    // 주의: walk는 ds에서 짝수날에 기록됨. 위 logs는 immediate 평균용. nextDay는 ds 기준.
    const insights = analyzeRecoveryActions(ds, logs)
    const walk = insights.find((i) => i.actionCode === 'walk')
    expect(walk).toBeDefined()
    expect(walk!.immediateScore).toBe(80) // much_better
    expect(walk!.nextDayEffectSize).toBe(40)
    expect(walk!.combinedScore).toBe(88) // 80*0.6 + 100*0.4
  })
})

describe('recoveryTier', () => {
  it('점수에 맞게 매핑된다', () => {
    expect(recoveryTier(10)).toBe('checking')
    expect(recoveryTier(45)).toBe('some_help')
    expect(recoveryTier(65)).toBe('personal_helper')
    expect(recoveryTier(90)).toBe('strong_helper')
  })
})
