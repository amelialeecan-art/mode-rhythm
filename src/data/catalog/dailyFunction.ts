/* =====================================================================
   MODE · 오늘 일상 기능 카탈로그 (3단계)
   평소엔 질문 1개(단계)로 끝내고, 기능이 크게 떨어진 날(3·4)에만
   최소한의 세부 입력을 받는다. 상태칩 점수로 자동 추정하지 않는다.
   "무너짐"은 의료 진단이 아니라 사용자가 고르는 일상 기능 저하 표현이다.
   ⚠️ 이번 단계는 기록·저장·복원만 — 점수/분석에는 반영하지 않는다.
   ===================================================================== */
import type { FunctionLevel } from '../models'

export const FUNCTION_LEVELS: { level: FunctionLevel; label: string }[] = [
  { level: 1, label: '유지됨' },
  { level: 2, label: '버거웠지만 할 일은 함' },
  { level: 3, label: '중요한 것 몇 개를 못 함' },
  { level: 4, label: '거의 멈춤 / 무너짐' },
]

/** 세부 입력을 보이는 단계(3·4)인지. */
export function isFunctionDetailLevel(level: FunctionLevel | undefined): boolean {
  return level === 3 || level === 4
}

/** 기능 저하 항목 (다중 선택, 선택). */
export const FUNCTION_IMPACT_CHIPS: { code: string; label: string }[] = [
  { code: 'cancel_plan', label: '약속을 취소함' },
  { code: 'skip_chores', label: '집안일·청소를 못 함' },
  { code: 'mostly_lying', label: '대부분 누워 있었음' },
  { code: 'defer_basics', label: '씻기·식사 같은 기본 일을 미룸' },
  { code: 'cant_start', label: '해야 할 일을 시작하지 못함' },
  { code: 'cant_work', label: '업무·공부를 못 함' },
]

/** 무너짐 시작 시점 (단일 선택, 선택). */
export const FUNCTION_ONSET_OPTIONS: { code: string; label: string }[] = [
  { code: 'wake', label: '일어나자마자' },
  { code: 'morning', label: '오전 중' },
  { code: 'afternoon', label: '오후부터' },
  { code: 'evening', label: '저녁부터' },
  { code: 'gradual', label: '서서히' },
  { code: 'unknown', label: '모르겠음' },
]
