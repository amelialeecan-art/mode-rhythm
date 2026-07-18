/* =====================================================================
   MODE · 오늘 모드 분류 (순수 함수)
   괄호 문구(subLabel)는 점수/상황으로 동적 생성한다. 절대 하드코딩 고정 금지.
   문구는 단정하지 않는다.
   ===================================================================== */
import type { DailyLog, DayTypeCode, EventLog } from '../data/models'
import type { CycleContext } from './cycle'

export interface DayScores {
  emotionalLoad: number
  appetiteLoad: number
  sleepLoad: number
  bodyLoad: number
  cycleLoad: number
  eventLoad: number
  rhythmLoad: number
}

export interface ClassifyInput {
  scores: DayScores
  log: DailyLog
  events: EventLog[]
  cycle: CycleContext
  periodPain?: number
}

export interface DayClassification {
  dayType: DayTypeCode
  label: string
  subLabel: string
  description: string
}

export const DAY_TYPE_LABEL: Record<DayTypeCode, string> = {
  stable: '안정일',
  focus: '집중 가능일',
  emotion_sensitive: '감정 민감일',
  appetite_shift: '식욕 변동일',
  body_load: '몸 불편일',
  social_fatigue: '사회 피로일',
  impulse_caution: '충동 경계일',
  recovery_priority: '회복 우선일',
  unknown_cause: '원인 미상일',
  mixed_load: '복합 흔들림일',
}

/** 캘린더 칸용 짧은 라벨 (아이콘 대신 텍스트만). */
export const DAY_TYPE_SHORT_LABEL: Record<DayTypeCode, string> = {
  stable: '안정',
  focus: '집중',
  emotion_sensitive: '예민',
  appetite_shift: '식욕',
  body_load: '몸',
  social_fatigue: '사회',
  impulse_caution: '충동',
  recovery_priority: '회복',
  unknown_cause: '미제',
  mixed_load: '복합',
}

// 설명 문구 — 단정하지 않는 톤.
const DAY_TYPE_DESC: Record<DayTypeCode, string> = {
  stable: '오늘은 비교적 안정적인 흐름으로 기록됐어요.',
  focus: '에너지와 집중이 괜찮게 기록된 날이에요.',
  emotion_sensitive: '작은 일에도 마음이 크게 반응할 수 있는 날이에요. 오늘의 판단은 잠시 보류해도 괜찮아요.',
  appetite_shift: '식욕이 흔들릴 수 있는 날이에요. 미리 챙기면 한결 편해요.',
  body_load: '몸이 보내는 신호가 큰 날이에요. 무리하지 않아도 괜찮아요.',
  social_fatigue: '사람과의 일에서 피로가 함께 관찰된 날이에요.',
  impulse_caution: '충동이 올라올 수 있는 날이에요. 큰 결정은 천천히 가도 좋아요.',
  recovery_priority: '여러 가지가 함께 높게 계산된 날이에요. 오늘은 회복을 먼저 둬도 좋아요.',
  unknown_cause: '오늘의 상태는 현재 기록만으로는 충분히 설명되지 않아요. 이유가 없는 날도 데이터예요.',
  mixed_load: '여러 요인이 겹쳐 보이는 날이에요.',
}

/** 사람/관계 관련 사건 수. */
function socialEventCount(events: EventLog[]): number {
  return events.filter((e) => e.category === 'relationship').length
}

/** 우선순위 규칙 기반 분류. */
export function classifyDay(input: ClassifyInput): DayClassification {
  const { scores, log } = input
  const { emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, eventLoad, rhythmLoad } = scores

  let dayType: DayTypeCode
  if (rhythmLoad >= 75 && sleepLoad >= 60) dayType = 'recovery_priority'
  else if (emotionalLoad >= 65 && appetiteLoad >= 60) dayType = 'mixed_load'
  else if (emotionalLoad >= 70 && log.impulsivity >= 7) dayType = 'impulse_caution'
  else if (emotionalLoad >= 65) dayType = 'emotion_sensitive'
  else if (appetiteLoad >= 65) dayType = 'appetite_shift'
  else if (bodyLoad >= 65) dayType = 'body_load'
  else if (eventLoad >= 55 && socialEventCount(input.events) >= 1) dayType = 'social_fatigue'
  else if (log.energy >= 7 && log.focus >= 7 && rhythmLoad <= 35) dayType = 'focus'
  else if (rhythmLoad <= 25) dayType = 'stable'
  else if (rhythmLoad >= 55) dayType = 'unknown_cause'
  else dayType = 'stable' // 중간 부하 — 억지 배정 대신 안정으로 두고 description으로 표현

  return {
    dayType,
    label: DAY_TYPE_LABEL[dayType],
    subLabel: buildSubLabel(dayType, input),
    description: DAY_TYPE_DESC[dayType],
  }
}

/** 동적 괄호 문구. 상황별로 생성. */
export function buildSubLabel(dayType: DayTypeCode, input: ClassifyInput): string {
  const { log, events, scores, cycle } = input
  const hasLateNight = events.some((e) => e.eventCode === 'meal_latenight')

  switch (dayType) {
    case 'emotion_sensitive':
      if (log.selfCriticism >= 7) return '자기평가 보류'
      if (log.irritability >= 7) return '대화 속도 조절'
      if (log.anxiety >= 7) return '확인 반복 주의'
      if (log.sadness >= 7 || log.heaviness >= 7) return '낮은 기준 권장'
      return '해석 보류 구간'

    case 'appetite_shift':
      if (log.bingeUrge >= 7) return '폭식욕 주의'
      if (log.sweetCraving >= 7) return '단 음식 욕구 상승'
      if (hasLateNight) return '야식 경보'
      if (scores.sleepLoad >= 65) return '잠 부족성 허기'
      return '식욕 변동 관찰'

    case 'body_load':
      if ((input.periodPain ?? 0) >= 5) return '생리통 관리'
      if (log.bloating >= 7) return '붓기 관리'
      if (log.fatigue >= 7) return '몸 회복 우선'
      return '몸 신호 확인'

    case 'recovery_priority':
      if (scores.sleepLoad >= 65) return '수면 회복 우선'
      if (scores.rhythmLoad >= 75) return '낮은 기준 권장'
      return '회복 우선'

    case 'mixed_load':
      return '여러 가지 겹침 구간'

    case 'unknown_cause':
      return '미제 사건'

    case 'impulse_caution':
      return '큰 결정 보류'

    case 'social_fatigue':
      return '혼자 시간 확보'

    case 'focus':
      return '집중 가능 구간'

    case 'stable':
      if (cycle.isPremenstrualWindow) return '월경 전 구간 관찰'
      return scores.rhythmLoad >= 40 ? '중간 정도 구간' : '안정 구간'
  }
}
