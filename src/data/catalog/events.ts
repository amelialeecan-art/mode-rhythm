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

  // ---- 식사/혈당 ("먹고 싶음"은 식욕 상태 카드, "실제로 먹음"은 여기 사건으로) ----
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

/** 카테고리별 그룹핑 (기록 화면에서 섹션 표시용). */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  sleep: '수면/리듬',
  food: '식사/혈당',
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
