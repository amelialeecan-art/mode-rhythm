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
  // ---- 수면 (숫자형 수면시간/질은 dailyLogs로, 사건성 수면은 eventLogs로) ----
  { code: 'sleep_short', label: '잠이 부족했음', category: 'sleep', factorGroup: 'sleep_deficit' },
  { code: 'sleep_late', label: '늦게 잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_much', label: '많이 잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_waking', label: '자주 깸', category: 'sleep', factorGroup: 'sleep_quality' },
  { code: 'sleep_allnight', label: '밤샘', category: 'sleep', factorGroup: 'sleep_deficit' },
  { code: 'sleep_nap', label: '낮잠', category: 'sleep', factorGroup: 'sleep_schedule' },
  { code: 'sleep_nightmare', label: '악몽', category: 'sleep', factorGroup: 'sleep_quality' },

  // ---- 식사 ----
  { code: 'meal_skipped', label: '식사를 거름', category: 'food', factorGroup: 'meal_skip' },
  { code: 'meal_overeat', label: '과식함', category: 'food', factorGroup: 'overeat' },
  { code: 'meal_latenight', label: '야식 먹음', category: 'food', factorGroup: 'late_night_eating' },
  { code: 'caffeine_high', label: '카페인을 많이 마심', category: 'food', factorGroup: 'caffeine' },
  { code: 'alcohol', label: '술을 마심', category: 'food', factorGroup: 'alcohol' },

  // ---- 일 ----
  { code: 'work_heavy', label: '일이 많았음', category: 'work', factorGroup: 'workload' },
  { code: 'work_pressure', label: '마감/압박이 있었음', category: 'work', factorGroup: 'deadline_pressure' },

  // ---- 관계 ----
  { code: 'conflict', label: '사람과 갈등이 있었음', category: 'relationship', factorGroup: 'interpersonal_stress' },
  { code: 'reply_stress', label: '연락/답장 때문에 신경 쓰였음', category: 'relationship', factorGroup: 'reply_stress' },

  // ---- 외모/몸 이미지 ----
  { code: 'appearance', label: '외모/몸 때문에 신경 쓰였음', category: 'appearance', factorGroup: 'body_image' },
  { code: 'weighed', label: '몸무게를 봄', category: 'appearance', factorGroup: 'body_image' },

  // ---- 디지털 ----
  { code: 'sns_heavy', label: 'SNS를 많이 봄', category: 'digital', factorGroup: 'social_media' },
  { code: 'shorts_heavy', label: '쇼츠/릴스를 많이 봄', category: 'digital', factorGroup: 'short_video' },

  // ---- 환경 ----
  { code: 'stayed_in', label: '집에만 있었음', category: 'environment', factorGroup: 'low_activity' },
  { code: 'moved_lot', label: '이동이 많았음', category: 'environment', factorGroup: 'high_movement' },
  { code: 'weather_gloomy', label: '날씨가 흐렸음', category: 'environment', factorGroup: 'weather' },
  { code: 'noise_space', label: '소음/공간 스트레스가 있었음', category: 'environment', factorGroup: 'environment_stress' },

  // ---- 몸을 움직인 일 (회복적 사건도 사건으로 기록) ----
  { code: 'exercised', label: '운동함', category: 'movement', factorGroup: 'exercise' },
  { code: 'walked', label: '산책함', category: 'movement', factorGroup: 'walk' },
  { code: 'washed', label: '씻음', category: 'body', factorGroup: 'self_care' },

  // ---- 모름 ----
  { code: 'unknown', label: '잘 모르겠음', category: 'unknown', factorGroup: 'unknown' },
]

/** 카테고리별 그룹핑 (기록 화면에서 섹션 표시용). */
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  sleep: '수면',
  food: '식사',
  relationship: '관계',
  work: '일',
  body: '몸',
  appearance: '외모',
  environment: '환경',
  digital: '디지털',
  movement: '활동',
  unknown: '모름',
}
