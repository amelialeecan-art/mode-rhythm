/* =====================================================================
   MODE · 오늘의 4줄 설계 (순수 함수, rule-based)
   "오늘" 기준만. 내일 예보 알고리즘은 여기 없다(후속 단계).
   단정하지 않되 딱딱하지 않게.
   ===================================================================== */
import type { DailyLog, EventLog } from '../data/models'
import type { DayScores } from './classify'

export interface TodayPlan {
  schedule: string
  food: string
  movement: string
  relationship: string
}

function socialEventCount(events: EventLog[]): number {
  return events.filter((e) => e.category === 'relationship').length
}

export interface TodayPlanInput {
  scores: DayScores
  log: DailyLog
  events: EventLog[]
}

export function buildTodayPlan(input: TodayPlanInput): TodayPlan {
  const { scores, log, events } = input
  const { rhythmLoad, appetiteLoad, sleepLoad, cycleLoad, bodyLoad, emotionalLoad } = scores

  // 일정
  let schedule: string
  if (rhythmLoad >= 75) schedule = '최소한만 해도 충분해요'
  else if (rhythmLoad >= 60) schedule = '중요한 일은 줄여도 좋아요'
  else if (rhythmLoad >= 40) schedule = '평소 속도로 가도 괜찮아요'
  else schedule = '집중이 필요한 일을 배치해도 좋아요'

  // 식사
  let food: string
  if (appetiteLoad >= 65) food = '단백질 먼저, 야식은 미리 대비해요'
  else if (sleepLoad >= 65) food = '카페인은 늦게 피하고 규칙적으로 먹어요'
  else if (cycleLoad >= 60) food = '따뜻하고 자극 적은 식사를 챙겨요'
  else food = '평소 리듬대로 챙겨요'

  // 운동
  let movement: string
  if (bodyLoad >= 70) movement = '무리한 운동보다 스트레칭이 좋아요'
  else if (rhythmLoad >= 70) movement = '산책 10~20분이면 충분해요'
  else if (log.energy >= 7 && bodyLoad <= 40) movement = '운동하기 좋은 흐름이에요'
  else movement = '가볍게 움직이면 좋아요'

  // 관계
  let relationship: string
  if (emotionalLoad >= 70 && log.irritability >= 7) relationship = '대화 속도를 늦춰도 좋아요'
  else if (log.anxiety >= 7) relationship = '확인 반복은 잠시 줄여봐요'
  else if (socialEventCount(events) >= 1) relationship = '혼자 있는 시간을 확보해요'
  else relationship = '평소처럼 소통해도 괜찮아요'

  return { schedule, food, movement, relationship }
}
