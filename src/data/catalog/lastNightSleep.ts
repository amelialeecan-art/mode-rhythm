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
  // update2: 잠들기 전 행동 + 잠의 결과(잠들기 어려움). 지난밤 수면 카드에서만 입력한다.
  'bedtime_reluctance',
  'bedtime_delay',
  'intentional_wakefulness',
  'phone_sleep_delay',
  'sleep_onset_difficulty',
])

/** 일반 "오늘 있었던 일" UI에서 새로 고를 수 없게 감출 코드.
 *  = 지난밤 수면 코드 전체 + phone_in_bed(취침 미룸과 겹칠 수 있어 사건 목록에서는 숨김).
 *  ⚠️ phone_in_bed는 옛 eventLog 보존을 위해 LAST_NIGHT_SLEEP_CODES에는 넣지 않는다
 *     (buildEventInputs가 재저장 시 stripping하지 않도록). 여기 UI 숨김 목록에만 둔다. */
export const EVENT_LIST_HIDDEN_CODES: ReadonlySet<string> = new Set([...LAST_NIGHT_SLEEP_CODES, 'phone_in_bed'])

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

/** 지난밤 수면 이슈 칩 — "잠들기 전" 행동과 "잠의 결과"를 두 그룹으로 구분.
 *  issue 코드는 저장 시 LastNightSleep.issues 배열에 그대로 들어간다(새 저장 필드 없음). */
export const SLEEP_ISSUE_GROUPS: { title: string; items: { code: string; label: string }[] }[] = [
  {
    title: '잠들기 전',
    items: [
      { code: 'bedtime_reluctance', label: '잠자리에 들 마음이 안 났어요' },
      { code: 'bedtime_delay', label: '잘 시간인데도 자는 걸 미뤘어요' },
      { code: 'intentional_wakefulness', label: '졸려도 일부러 깨어 있었어요' },
      { code: 'phone_sleep_delay', label: '폰을 보며 잠을 미뤘어요' },
    ],
  },
  {
    title: '잠의 결과',
    items: [
      { code: 'sleep_late', label: '평소보다 늦게 잠들었어요' },
      { code: 'sleep_onset_difficulty', label: '누웠는데 잠이 안 왔어요' },
      { code: 'sleep_waking', label: '자주 깼어요' },
      { code: 'sleep_nightmare', label: '악몽을 꿨어요' },
      { code: 'sleep_allnight', label: '밤을 새웠어요' },
      { code: 'sleep_much', label: '너무 오래 잤어요' },
      { code: 'woke_late', label: '늦게 일어났어요' },
    ],
  },
]

/** 평탄한 이슈 칩 목록(라벨 조회·하위 호환). 그룹에서 파생. */
export const SLEEP_ISSUE_CHIPS: { code: string; label: string }[] = SLEEP_ISSUE_GROUPS.flatMap((g) => g.items)

/** 수면 이슈 코드 → 사람말 라벨(Calendar 원본 표시용). unknown 코드는 여기 없으면 미표시. */
export const SLEEP_ISSUE_LABEL: Map<string, string> = new Map(SLEEP_ISSUE_CHIPS.map((c) => [c.code, c.label]))

/* ---------------------------------------------------------------------
   분석 노출 adapter (1.1단계)
   신규 lastNightSleep는 eventLogs를 만들지 않으므로, 분석 계층이 수면을
   읽을 수 있도록 "날짜당 하나의 canonical 수면 노출"을 즉석 파생한다.
   저장 데이터는 만들지 않는다(순수 함수). 낮잠은 여기 포함하지 않는다.
   --------------------------------------------------------------------- */

/** 수면 이슈 코드 → factorGroup. 다음 단계 분석 연결용 매핑도 함께 준비한다.
 *  ⚠️ 새 취침 전/잠들기 어려움 그룹은 이번 단계에서 분석하지 않는다
 *     (getSleepExposureForDate가 SLEEP_EXPOSURE_GROUPS로만 노출 → 기존 분석 불변). */
export const SLEEP_CODE_TO_GROUP: Record<string, string> = {
  sleep_short: 'sleep_deficit',
  sleep_allnight: 'sleep_deficit',
  sleep_late: 'sleep_schedule',
  sleep_much: 'sleep_schedule',
  woke_late: 'sleep_schedule',
  sleep_waking: 'sleep_quality',
  sleep_nightmare: 'sleep_quality',
  // update2 — 다음 단계에서 각 행동을 따로 분석하기 위한 매핑(합치지 않음).
  bedtime_reluctance: 'bedtime_resistance',
  bedtime_delay: 'bedtime_delay',
  intentional_wakefulness: 'bedtime_delay',
  phone_sleep_delay: 'bedtime_delay',
  sleep_onset_difficulty: 'sleep_onset',
}

/** 이번 단계에서 분석에 노출하는 수면 factorGroup(기존 3종). 새 그룹은 아직 제외. */
const SLEEP_EXPOSURE_GROUPS: ReadonlySet<string> = new Set(['sleep_deficit', 'sleep_schedule', 'sleep_quality'])

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
      // 이번 단계 분석 대상 그룹만 노출(새 취침 전/잠들기 어려움 그룹은 아직 제외).
      if (g && SLEEP_EXPOSURE_GROUPS.has(g)) groups.add(g)
    }
    // 수면시간이 짧으면(부족) sleep_deficit 노출
    if (ln!.hours !== undefined && ln!.hours < 6) groups.add('sleep_deficit')
    return { factorGroups: [...groups], source: 'lastNight' }
  }
  const groups = new Set<string>()
  for (const e of legacyEvents) {
    if (LAST_NIGHT_SLEEP_CODES.has(e.eventCode)) {
      const g = SLEEP_CODE_TO_GROUP[e.eventCode] ?? e.mappedFactorGroup
      if (g && SLEEP_EXPOSURE_GROUPS.has(g)) groups.add(g)
    }
  }
  return { factorGroups: [...groups], source: groups.size > 0 ? 'legacy' : 'none' }
}
