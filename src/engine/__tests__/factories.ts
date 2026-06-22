import type { CycleLog, DailyLog, EventLog } from '../../data/models'

/** 테스트용 DailyLog (모든 숫자 0 기본). */
export function makeLog(partial: Partial<DailyLog> = {}): DailyLog {
  return {
    date: '2026-06-21',
    moodLow: 0,
    anxiety: 0,
    irritability: 0,
    sadness: 0,
    heaviness: 0,
    calm: 0,
    energy: 0,
    focus: 0,
    selfCriticism: 0,
    impulsivity: 0,
    appetite: 0,
    sweetCraving: 0,
    saltyCraving: 0,
    bingeUrge: 0,
    bodyDiscomfort: 0,
    pain: 0,
    bloating: 0,
    fatigue: 0,
    headache: 0,
    digestion: 0,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

export function makeEvent(partial: Partial<EventLog> = {}): EventLog {
  return {
    date: '2026-06-21',
    eventCode: 'x',
    eventLabel: 'x',
    category: 'unknown',
    timing: 'today',
    intensity: 5,
    isCustom: false,
    mappedFactorGroup: 'x',
    createdAt: '',
    ...partial,
  }
}

export function makeCycle(partial: Partial<CycleLog> = {}): CycleLog {
  return {
    date: '2026-06-21',
    periodStart: false,
    periodEnd: false,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}
