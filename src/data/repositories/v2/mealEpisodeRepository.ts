import { db } from '../../db'
import type { ISODate } from '../../models'
import type { MealEpisode, MealEpisodeInput } from '../../modelsV2'
import { assertNoErrors, validateMealChronology } from '../../v2Validation'

/**
 * mealEpisodes 저장 계층. 한 끼/간식 = 1 episode. 하루 여러 개 공존(항상 add).
 * date에 unique 없음 — 같은 날 여러 식사가 정상.
 */
export const mealEpisodeRepository = {
  async add(input: MealEpisodeInput): Promise<number> {
    assertNoErrors(validateMealChronology(input))
    const now = new Date().toISOString()
    return db.mealEpisodes.add({ ...input, createdAt: now, updatedAt: now })
  },

  async update(id: number, input: MealEpisodeInput): Promise<void> {
    assertNoErrors(validateMealChronology(input))
    const existing = await db.mealEpisodes.get(id)
    if (!existing) return
    await db.mealEpisodes.put({ ...existing, ...input, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  /**
   * 부분 갱신(merge). "식사 시작만 저장 후 나중에 식사 후 필드 추가"에 쓴다.
   * 기존 startedAt/pre 값은 유지되고, patch에 준 키만 덮어쓴다.
   * merge 결과로 시각 순서를 재검증한다(종료<시작이면 거부).
   */
  async patch(id: number, patch: Partial<MealEpisodeInput>): Promise<void> {
    const existing = await db.mealEpisodes.get(id)
    if (!existing) return
    const merged = { ...existing, ...patch }
    assertNoErrors(validateMealChronology(merged))
    await db.mealEpisodes.put({ ...merged, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  async getById(id: number): Promise<MealEpisode | undefined> {
    return db.mealEpisodes.get(id)
  },

  async listByDate(localDate: ISODate): Promise<MealEpisode[]> {
    return db.mealEpisodes.where('localDate').equals(localDate).sortBy('startedAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<MealEpisode[]> {
    return db.mealEpisodes.where('localDate').between(start, end, true, true).sortBy('startedAt')
  },

  async deleteById(id: number): Promise<void> {
    await db.mealEpisodes.delete(id)
  },
}
