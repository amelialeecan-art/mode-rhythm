/* =====================================================================
   MODE · 지난밤 수면 카탈로그 (1단계)
   수면은 "깨어난 날짜"에 귀속한다. 기록 화면의 별도 카드에서 입력하고,
   DailyLog.lastNightSleep(비인덱스 optional)로 저장한다.
   issue 코드는 기존 sleep eventCode와 동일하게 유지해 legacy 호환을 지킨다.

   ⚠️ 이 코드들은 일반 "오늘 있었던 일" 사건 섹션에서 제거된다(신규 기록은
   여기서만 입력). 단, EVENT_CATALOG의 sleep 항목은 그대로 두어 과거 기록 읽기를
   보장한다. 낮잠(sleep_nap)은 지난밤 수면이 아니라 오늘 사건으로 유지한다.
   ===================================================================== */

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
