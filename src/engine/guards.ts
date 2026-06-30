/* =====================================================================
   MODE · engine 공통 수치 helper (순수 함수)
   engine은 React/Dexie/repository를 절대 모른다. 입력→결과만.
   ===================================================================== */

/** 값을 [min, max]로 자른다. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** raw 값을 max 기준 0~100으로 정규화(+clamp). */
export function normalizeTo100(value: number, max: number): number {
  if (max <= 0) return 0
  return clamp((value / max) * 100, 0, 100)
}

/** 점수를 정수로 반올림. */
export function roundScore(value: number): number {
  return Math.round(value)
}
