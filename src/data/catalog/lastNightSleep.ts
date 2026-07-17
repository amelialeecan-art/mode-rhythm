/* =====================================================================
   MODE · 지난밤 수면 카탈로그 (1단계) + 분석 노출 adapter (1.1단계)
   수면은 "깨어난 날짜"에 귀속한다. 기록 화면의 별도 카드에서 입력하고,
   DailyLog.lastNightSleep(비인덱스 optional)로 저장한다.
   issue 코드는 기존 sleep eventCode와 동일하게 유지해 legacy 호환을 지킨다.

   ⚠️ 이 코드들은 일반 "오늘 있었던 일" 사건 섹션에서 제거된다(신규 기록은
   여기서만 입력). 단, EVENT_CATALOG의 sleep 항목은 그대로 두어 과거 기록 읽기를
   보장한다. 낮잠(sleep_nap)은 지난밤 수면이 아니라 오늘 사건으로 유지한다.
   ===================================================================== */
import type { DailyLog, EventLog, LastNightSleep } from '../models'

/** 지난밤 수면 카드에서 다루는 사건 코드 = 일반 사건 섹션에서 감출 코드.
 *  sleep_short는 카드에 별도 칩이 없다(수면시간 구간이 부족을 대신 표현). 단,
 *  과거 기록의 sleep_short는 수면 점수에 반영되도록 인식만 한다. */
export const LAST_NIGHT_SLEEP_CODES: ReadonlySet<string> = new Set([
  'sleep_short',
  'sleep_late',
  'sleep_much',
  'sleep_waking',
  'sleep_allnight',
  'sleep_nightmare',
  'woke_late',
])

/** 수면시간 구간 → 대표 시간(scoring debt tier에 대응). */
export const SLEEP_HOUR_BUCKETS: { code: string; label: string; hours: number }[] = [
  { code: 'h4', label: '4시간 이하', hours: 4 },
  { code: 'h5', label: '5시간쯤', hours: 5 },
  { code: 'h6', label: '6시간쯤', hours: 6 },
  { code: 'h7', label: '7시간쯤', hours: 7 },
  { code: 'h8', label: '8시간 이상', hours: 8 },
]

/** 수면 만족도/질 → 0~10 값. */
export const SLEEP_QUALITY_OPTIONS: { label: string; value: number }[] = [
  { label: '푹 못 잠', value: 2 },
  { label: '뒤척임', value: 4 },
  { label: '보통', value: 6 },
  { label: '잘 잠', value: 9 },
]

/** 지난밤 수면 이슈 칩 (issue 코드 = 기존 sleep eventCode). */
export const SLEEP_ISSUE_CHIPS: { code: string; label: string }[] = [
  { code: 'sleep_late', label: '늦게 잠' },
  { code: 'sleep_waking', label: '자주 깸' },
  { code: 'sleep_nightmare', label: '악몽' },
  { code: 'sleep_allnight', label: '밤샘' },
  { code: 'sleep_much', label: '많이 잠' },
  { code: 'woke_late', label: '늦게 일어남' },
]

/* ---------------------------------------------------------------------
   분석 노출 adapter (1.1단계)
   신규 lastNightSleep는 eventLogs를 만들지 않으므로, 분석 계층이 수면을
   읽을 수 있도록 "날짜당 하나의 canonical 수면 노출"을 즉석 파생한다.
   저장 데이터는 만들지 않는다(순수 함수). 낮잠은 여기 포함하지 않는다.
   --------------------------------------------------------------------- */

/** 수면 이슈 코드 → factorGroup (EVENT_CATALOG의 sleep factorGroup과 동일). */
export const SLEEP_CODE_TO_GROUP: Record<string, string> = {
  sleep_short: 'sleep_deficit',
  sleep_allnight: 'sleep_deficit',
  sleep_late: 'sleep_schedule',
  sleep_much: 'sleep_schedule',
  woke_late: 'sleep_schedule',
  sleep_waking: 'sleep_quality',
  sleep_nightmare: 'sleep_quality',
}

/** lastNightSleep에 실제 입력이 있는지(빈 객체 구분). */
export function hasLastNightSleepContent(ln: LastNightSleep | undefined): boolean {
  return !!ln && (ln.hours !== undefined || ln.quality !== undefined || (ln.issues?.length ?? 0) > 0)
}

export interface SleepExposure {
  /** 그날 수면 노출 factorGroup들 (sleep_deficit/sleep_schedule/sleep_quality). */
  factorGroups: string[]
  /** 출처: 신규 지난밤 수면 / legacy 사건 / 없음. */
  source: 'lastNight' | 'legacy' | 'none'
}

/**
 * 날짜당 canonical 수면 노출. 우선순위: (1) lastNightSleep, (2) 없을 때만 legacy sleep 사건.
 * 둘을 동시에 반환하지 않는다(중복 방지). 저장하지 않고 분석 시점에만 파생한다.
 */
export function getSleepExposureForDate(dailyLog: DailyLog | undefined, legacyEvents: EventLog[]): SleepExposure {
  const ln = dailyLog?.lastNightSleep
  if (hasLastNightSleepContent(ln)) {
    const groups = new Set<string>()
    for (const code of ln!.issues ?? []) {
      const g = SLEEP_CODE_TO_GROUP[code]
      if (g) groups.add(g)
    }
    // 수면시간이 짧으면(부족) sleep_deficit 노출
    if (ln!.hours !== undefined && ln!.hours < 6) groups.add('sleep_deficit')
    return { factorGroups: [...groups], source: 'lastNight' }
  }
  const groups = new Set<string>()
  for (const e of legacyEvents) {
    if (LAST_NIGHT_SLEEP_CODES.has(e.eventCode)) {
      const g = SLEEP_CODE_TO_GROUP[e.eventCode] ?? e.mappedFactorGroup
      if (g) groups.add(g)
    }
  }
  return { factorGroups: [...groups], source: groups.size > 0 ? 'legacy' : 'none' }
}
