import type { EventCategory } from '../types'

/**
 * "오늘 있었던 일" 카탈로그.
 * !! 중요 !! 이것은 "원인 추측" 목록이 아니라 "사건/상황 기록" 목록이다.
 * 사용자는 원인을 고르지 않는다. 생리/주기는 여기에 없다(별도 cycleLogs).
 *
 * factorGroup: 후속 단계 분석에서 비슷한 사건을 묶는 그룹 키.
 */
export interface EventCatalogItem {
  code: string
  label: string
  category: EventCategory
  factorGroup: string
}

export const EVENT_CATALOG: EventCatalogItem[] = [
  // ---- 수면/리듬 (숫자형 수면시간/질은 dailyLogs로, 사건성 수면은 eventLogs로) ----
  { code: 'sleep_short', label: '잠이 부족했음', category: 'sleep', factorGroup: 'sleep_deficit' },
  { code: 'sleep_late', label: '늦게 잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_much', label: '많이 잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_waking', label: '자주 깸', category: 'sleep', factorGroup: 'sleep_quality' },
  { code: 'sleep_allnight', label: '밤샘', category: 'sleep', factorGroup: 'sleep_deficit' },
  { code: 'sleep_nap', label: '낮잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_nightmare', label: '악몽', category: 'sleep', factorGroup: 'sleep_quality' },
  { code: 'woke_late', label: '늦게 일어남', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'no_morning_light', label: '아침 햇빛 못 봄', category: 'sleep', factorGroup: 'morning_light' },
  { code: 'irregular_sleep', label: '기상/취침 불규칙', category: 'sleep', factorGroup: 'sleep_schedule' },

  // ---- 식사 ("먹고 싶음"은 식욕 상태 카드, "실제로 먹음"은 여기 사건으로. 혈당·CGM 입력은 없다) ----
  { code: 'meal_skipped', label: '식사를 거름', category: 'food', factorGroup: 'meal_skip' },
  { code: 'meal_overeat', label: '과식함', category: 'food', factorGroup: 'overeat' },
  { code: 'meal_latenight', label: '야식 먹음', category: 'food', factorGroup: 'late_night_eating' },
  { code: 'ate_sweets', label: '단 음식 먹음', category: 'food', factorGroup: 'sugar_intake' },
  { code: 'ate_ultraprocessed', label: '초가공식품 먹음', category: 'food', factorGroup: 'ultraprocessed' },
  { code: 'late_meal', label: '늦은 식사', category: 'food', factorGroup: 'late_meal' },
  { code: 'caffeine_high', label: '카페인을 많이 마심', category: 'food', factorGroup: 'caffeine' },
  { code: 'caffeine_late', label: '카페인 늦게 마심', category: 'food', factorGroup: 'caffeine_timing' },
  { code: 'low_water', label: '물 부족', category: 'food', factorGroup: 'hydration' },
  { code: 'alcohol', label: '술을 마심', category: 'food', factorGroup: 'alcohol' },

  // ---- 일 ----
  { code: 'work_heavy', label: '일이 많았음', category: 'work', factorGroup: 'workload' },
  { code: 'work_pressure', label: '마감/압박이 있었음', category: 'work', factorGroup: 'deadline_pressure' },

  // ---- 관계/사회 (혼자 있음은 좋다/나쁘다 판단 없이 사실로만 — 방향은 앱이 학습) ----
  { code: 'conflict', label: '사람과 갈등이 있었음', category: 'relationship', factorGroup: 'interpersonal_stress' },
  { code: 'reply_stress', label: '연락/답장 때문에 신경 쓰였음', category: 'relationship', factorGroup: 'reply_stress' },
  { code: 'long_alone', label: '혼자 오래 있음', category: 'relationship', factorGroup: 'alone_time' },
  { code: 'crowded', label: '사람 많음', category: 'relationship', factorGroup: 'crowd_exposure' },
  { code: 'social_comparison', label: '사회적 비교', category: 'relationship', factorGroup: 'social_comparison' },

  // ---- 통제감/좌절 (오늘 안 터져도 앞둔 일정만으로 몸은 긴장함 — 예기불안 축) ----
  { code: 'plan_disrupted', label: '계획 틀어짐', category: 'control', factorGroup: 'plan_disruption' },
  { code: 'not_my_way', label: '내 뜻대로 안 됨', category: 'control', factorGroup: 'control_loss' },
  { code: 'failure_mistake', label: '실패/실수', category: 'control', factorGroup: 'failure' },
  { code: 'new_burden', label: '부담 일정 생김', category: 'control', factorGroup: 'anticipatory_stress' },
  { code: 'upcoming_stress', label: '앞둔 약속 스트레스', category: 'control', factorGroup: 'anticipatory_stress' },

  // ---- 외모/몸 이미지 ----
  { code: 'appearance', label: '외모/몸 때문에 신경 쓰였음', category: 'appearance', factorGroup: 'body_image' },
  { code: 'weighed', label: '몸무게를 봄', category: 'appearance', factorGroup: 'body_image' },

  // ---- 디지털/빛 ----
  { code: 'sns_heavy', label: 'SNS를 많이 봄', category: 'digital', factorGroup: 'social_media' },
  { code: 'shorts_heavy', label: '쇼츠/릴스를 많이 봄', category: 'digital', factorGroup: 'short_video' },
  { code: 'phone_in_bed', label: '누워서 폰', category: 'digital', factorGroup: 'late_screen' },
  { code: 'late_screen', label: '밤에 화면 오래 봄', category: 'digital', factorGroup: 'late_screen' },

  // ---- 공간/환경 (클러터·과밀은 "기분 탓"이 아니라 실측되는 자극) ----
  { code: 'stayed_in', label: '집에만 있었음', category: 'environment', factorGroup: 'low_activity' },
  { code: 'moved_lot', label: '이동이 많았음', category: 'environment', factorGroup: 'high_movement' },
  { code: 'weather_gloomy', label: '날씨가 흐렸음', category: 'environment', factorGroup: 'weather' },
  { code: 'noise_space', label: '소음/공간 스트레스가 있었음', category: 'environment', factorGroup: 'environment_stress' },
  { code: 'messy_home', label: '집 지저분함', category: 'environment', factorGroup: 'clutter' },
  { code: 'cramped', label: '공간 답답함', category: 'environment', factorGroup: 'cramped_space' },
  { code: 'low_sunlight', label: '햇빛 부족', category: 'environment', factorGroup: 'sunlight' },

  // ---- 몸을 움직인 일 (회복적 사건도 사건으로 기록) ----
  { code: 'exercised', label: '운동함', category: 'movement', factorGroup: 'exercise' },
  { code: 'walked', label: '산책함', category: 'movement', factorGroup: 'walk' },
  { code: 'washed', label: '씻음', category: 'body', factorGroup: 'self_care' },

  // ---- 기타/모름 ----
  { code: 'unknown', label: '잘 모르겠음', category: 'unknown', factorGroup: 'unknown' },
  // 기록 자체가 불안을 키우는 시점을 잡아내는 안전장치 칩
  { code: 'tracking_burden', label: '기록이 부담됐음', category: 'unknown', factorGroup: 'tracking_burden' },
]

/**
 * 회복성(self-care) factor 그룹 — 부하를 높이는 "위험 요인" 분석(factorEffect/combo)에서 제외한다.
 * 부하가 높은 날 오히려 더 하기 쉬운 행동이라 역인과로 잘못 잡히기 때문.
 * 이 그룹들은 recoveryLogs 기반 회복 분석에서만 평가된다. (원본 eventLog는 그대로 보존)
 */
export const RECOVERY_LIKE_FACTOR_GROUPS: ReadonlySet<string> = new Set(['exercise', 'walk', 'self_care'])

/**
 * 회복 행동과 겹치는 사건 코드. 운동·산책·씻음(샤워/목욕)은 회복 행동에서만 새로 입력한다.
 * 새 기록 UI의 '오늘 있었던 일' 목록에서는 감추되, 옛 기록의 이 코드는 계속 읽고 재저장할 수
 * 있도록 EVENT_CATALOG 항목 자체는 남긴다(라벨·factorGroup 조회 호환).
 */
export const RECOVERY_DUP_EVENT_CODES: ReadonlySet<string> = new Set(['exercised', 'walked', 'washed'])

/**
 * factor 그룹 표준 표시(분석 화면용). 최빈 eventLabel 하나를 제목으로 쓰는 대신,
 * 그룹이 실제로 묶는 사건들을 제목+설명으로 정직하게 보여준다.
 * 여기 없는(custom 등) 그룹은 대표 eventLabel을 fallback으로 사용한다.
 */
export interface FactorGroupDisplay {
  title: string
  subtitle?: string
}
export const FACTOR_GROUP_DISPLAY: Record<string, FactorGroupDisplay> = {
  sleep_deficit: { title: '수면 부족', subtitle: '잠 부족·밤샘 포함' },
  sleep_schedule: { title: '수면 시간대 불규칙', subtitle: '늦게 잠·늦게 일어남·기상/취침 불규칙 포함' },
  sleep_quality: { title: '수면의 질 저하', subtitle: '자주 깸·악몽 포함' },
  morning_light: { title: '아침 햇빛 부족', subtitle: '아침 햇빛 못 봄' },
  meal_skip: { title: '식사 거름', subtitle: '끼니를 거른 기록' },
  overeat: { title: '과식', subtitle: '과식 기록' },
  late_night_eating: { title: '야식', subtitle: '야식 기록' },
  sugar_intake: { title: '단 음식 섭취', subtitle: '단 음식 먹음' },
  ultraprocessed: { title: '초가공식품 섭취', subtitle: '초가공식품 먹음' },
  late_meal: { title: '늦은 식사', subtitle: '늦은 시간 식사' },
  caffeine: { title: '카페인 과다', subtitle: '카페인을 많이 마심' },
  caffeine_timing: { title: '카페인 늦은 시간', subtitle: '카페인을 늦게 마심' },
  hydration: { title: '수분 부족', subtitle: '물 부족' },
  alcohol: { title: '음주', subtitle: '술 마심' },
  workload: { title: '업무량 많음', subtitle: '일이 많았음' },
  deadline_pressure: { title: '마감·압박', subtitle: '마감/압박이 있었음' },
  interpersonal_stress: { title: '대인 갈등', subtitle: '사람과 갈등이 있었음' },
  reply_stress: { title: '연락 스트레스', subtitle: '연락/답장 신경 쓰임' },
  alone_time: { title: '혼자 있는 시간', subtitle: '혼자 오래 있음' },
  crowd_exposure: { title: '사람 많은 환경', subtitle: '사람 많음' },
  social_comparison: { title: '사회적 비교', subtitle: '남과 비교하게 됨' },
  plan_disruption: { title: '계획 틀어짐', subtitle: '계획이 틀어짐' },
  control_loss: { title: '내 뜻대로 안 됨', subtitle: '통제감 저하' },
  failure: { title: '실패·실수', subtitle: '실패/실수 기록' },
  anticipatory_stress: { title: '앞둔 일정 부담', subtitle: '부담 일정·앞둔 약속 스트레스 포함' },
  body_image: { title: '외모·몸 관련 자극', subtitle: '몸무게 확인·외모 신경 쓰임 포함' },
  social_media: { title: 'SNS 과다', subtitle: 'SNS를 많이 봄' },
  short_video: { title: '쇼츠·릴스 과다', subtitle: '쇼츠/릴스를 많이 봄' },
  late_screen: { title: '밤 화면 노출', subtitle: '누워서 폰·밤에 화면 오래 봄 포함' },
  low_activity: { title: '활동 부족', subtitle: '집에만 있었음' },
  high_movement: { title: '이동 많음', subtitle: '이동이 많았음' },
  weather: { title: '흐린 날씨', subtitle: '날씨가 흐렸음' },
  environment_stress: { title: '소음·공간 스트레스', subtitle: '소음/공간 스트레스' },
  clutter: { title: '어수선한 공간', subtitle: '집 지저분함' },
  cramped_space: { title: '답답한 공간', subtitle: '공간 답답함' },
  sunlight: { title: '햇빛 부족', subtitle: '햇빛 부족' },
  tracking_burden: { title: '기록 부담', subtitle: '기록이 부담됐음' },
  cycle_period: { title: '생리 구간', subtitle: '날짜 기준 자동 계산' },
  cycle_premenstrual_window: { title: '월경 전 구간', subtitle: '날짜 기준 자동 계산' },
  cycle_ovulation_window: { title: '배란 추정 구간', subtitle: '날짜 기준 자동 계산' },
}

/* =====================================================================
   요인별 plausible time window (§15 · cherry-picking 방지, 4단계)
   에피소드 분석 엔진은 이 허용 범위 '안에서만' lag/누적을 탐색한다.
   정적 카탈로그(=DB 아님) — 저장/인덱스 영향 없음.
   ===================================================================== */
export type FactorWindowMode =
  | 'nightly' // 지난밤 귀속 + 단기 lag (수면류)
  | 'short' // 당일~며칠 단기 lag
  | 'trend' // 며칠~2주 추세
  | 'cumulative' // 연속 노출/누적
  | 'cycle' // 주기 위치(연속 거리, 별도 처리)
  | 'result_side' // 결과쪽(relationToShift='after')이면 선행신호에서 제외

export interface FactorWindow {
  /** 결과일 D 기준, 요인이 놓일 수 있는 최소 lag(일). 0 = 당일 허용. */
  minLag: number
  /** 최대 lag(일). */
  maxLag: number
  mode: FactorWindowMode
}

/** 명시되지 않은 그룹의 보수적 기본값(당일~3일 단기). */
export const DEFAULT_FACTOR_WINDOW: FactorWindow = { minLag: 0, maxLag: 3, mode: 'short' }

/** §15 표를 코드화. 여기 없는 그룹은 DEFAULT_FACTOR_WINDOW. */
export const FACTOR_WINDOW: Record<string, FactorWindow> = {
  // 잠 부족/악몽/자주 깸: 당일 아침 ~ D+3 (지난밤 귀속 + 단기 lag)
  sleep_deficit: { minLag: 0, maxLag: 3, mode: 'nightly' },
  sleep_quality: { minLag: 0, maxLag: 3, mode: 'nightly' },
  // 취침/기상 불규칙: 3~14일 추세
  sleep_schedule: { minLag: 3, maxLag: 14, mode: 'trend' },
  morning_light: { minLag: 0, maxLag: 3, mode: 'nightly' },
  // 늦은 카페인: 그날 밤 ~ 다음날
  caffeine_timing: { minLag: 0, maxLag: 1, mode: 'short' },
  caffeine: { minLag: 0, maxLag: 1, mode: 'short' },
  // 단 음식 섭취: 당일 ~ 다음날(식욕/감정 교차)
  sugar_intake: { minLag: 0, maxLag: 1, mode: 'short' },
  // 갈등/실수: 당일 ~ D+3
  interpersonal_stress: { minLag: 0, maxLag: 3, mode: 'short' },
  failure: { minLag: 0, maxLag: 3, mode: 'short' },
  control_loss: { minLag: 0, maxLag: 3, mode: 'short' },
  plan_disruption: { minLag: 0, maxLag: 3, mode: 'short' },
  // 앞둔 일정 부담: 발생일 ~ 일정 전(최대 14일) 예기/누적
  anticipatory_stress: { minLag: 0, maxLag: 14, mode: 'cumulative' },
  // 집 지저분/공간 답답: 연속 노출 일수
  clutter: { minLag: 0, maxLag: 14, mode: 'cumulative' },
  cramped_space: { minLag: 0, maxLag: 14, mode: 'cumulative' },
  environment_stress: { minLag: 0, maxLag: 7, mode: 'cumulative' },
  // 쇼츠/누워 있음: relationToShift='after'면 선행신호 제외 → 결과쪽
  short_video: { minLag: 0, maxLag: 2, mode: 'result_side' },
  low_activity: { minLag: 0, maxLag: 2, mode: 'result_side' },
  // SNS/사회적 비교: 당일 ~ D+2
  social_media: { minLag: 0, maxLag: 2, mode: 'short' },
  social_comparison: { minLag: 0, maxLag: 2, mode: 'short' },
}

/** 그룹의 탐색 허용 창(없으면 기본값). */
export function factorWindowFor(group: string): FactorWindow {
  return FACTOR_WINDOW[group] ?? DEFAULT_FACTOR_WINDOW
}

/**
 * 이 lag(결과일 D − 요인 발생일)가 그룹의 허용 창 안인지.
 * 창 밖 lag는 에피소드 선행신호 후보에서 제외한다(cherry-picking 방지).
 */
export function isLagWithinWindow(group: string, lag: number): boolean {
  const w = factorWindowFor(group)
  return lag >= w.minLag && lag <= w.maxLag
}

/** 카테고리별 그룹핑 (기록 화면에서 섹션 표시용). */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  sleep: '수면/리듬',
  food: '식사',
  relationship: '관계/사회',
  work: '일',
  body: '몸',
  appearance: '외모',
  environment: '공간/환경',
  digital: '디지털/빛',
  movement: '활동',
  control: '통제감/좌절',
  unknown: '기타',
}
