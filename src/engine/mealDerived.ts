/* =====================================================================
   MODE · 식사 파생값 (순수 함수 — 원자료 수정 없음)
   MealEpisode의 startedAt/endedAt와 pre/post 필드에서 계산한다.
   ⚠️ 저장하지 않는다. 필요할 때 계산한다.
   ===================================================================== */
import type { MealEpisode } from '../data/modelsV2'
import { minutesBetween } from './sleepDerived'

export { minutesBetween }

/** 식사 소요시간(분). startedAt → endedAt. endedAt 없으면 null, 음수면 null. */
export function mealDurationMinutes(m: Pick<MealEpisode, 'startedAt' | 'endedAt'>): number | null {
  const d = minutesBetween(m.startedAt, m.endedAt)
  if (d === null) return null
  return d >= 0 ? d : null
}

/** 두 식사 사이 간격(분) — b.startedAt - a.startedAt. */
export function mealInterval(
  a: Pick<MealEpisode, 'startedAt'>,
  b: Pick<MealEpisode, 'startedAt'>,
): number | null {
  return minutesBetween(a.startedAt, b.startedAt)
}

/**
 * startedAt 오름차순으로 정렬한 뒤 각 식사의 "직전 식사 이후 경과(분)"를 계산한다.
 * 첫 식사는 직전이 없어 null. 반환 배열은 정렬된 순서와 동일 길이.
 */
export function computeMealIntervals(meals: Pick<MealEpisode, 'startedAt'>[]): (number | null)[] {
  const sorted = [...meals].sort((x, y) => Date.parse(x.startedAt) - Date.parse(y.startedAt))
  return sorted.map((m, i) => (i === 0 ? null : mealInterval(sorted[i - 1], m)))
}

/**
 * 특정 식사의 직전 식사 이후 경과(분).
 * meals 중 target.startedAt 보다 이른 식사가 있으면 가장 가까운 것과의 간격, 없으면 null.
 */
export function timeSincePreviousMeal(
  target: Pick<MealEpisode, 'startedAt'>,
  meals: Pick<MealEpisode, 'startedAt'>[],
): number | null {
  const t = Date.parse(target.startedAt)
  if (Number.isNaN(t)) return null
  let prev: number | null = null
  for (const m of meals) {
    const tm = Date.parse(m.startedAt)
    if (Number.isNaN(tm) || tm >= t) continue
    if (prev === null || tm > prev) prev = tm
  }
  return prev === null ? null : Math.round((t - prev) / 60000)
}

/** 값이 "응답됨"인가 — undefined/null만 미응답. 0, false, 'unknown'은 응답으로 센다. */
function answered(v: unknown): boolean {
  return v !== undefined && v !== null
}

export interface Completeness {
  filled: number
  total: number
  complete: boolean
}

/** 식사 직전 3축(prePhysicalHunger/preCraving/preBingeUrge) 채움 정도. */
export function preCompleteness(m: MealEpisode): Completeness {
  const fields = [m.prePhysicalHunger, m.preCraving, m.preBingeUrge]
  const filled = fields.filter(answered).length
  return { filled, total: fields.length, complete: filled === fields.length }
}

/** 식사 후 분류(amount/protein/sweets/ultraProcessed/perceivedOvereating) 채움 정도. */
export function postCompleteness(m: MealEpisode): Completeness {
  const fields = [m.amount, m.proteinIncluded, m.sweetsIncluded, m.ultraProcessedIncluded, m.perceivedOvereating]
  const filled = fields.filter(answered).length
  return { filled, total: fields.length, complete: filled === fields.length }
}
