import { db } from '../../db'
import type { ISODate } from '../../models'
import type { SleepEpisode, SleepEpisodeInput } from '../../modelsV2'
import { assertNoErrors, validateSleepChronology } from '../../v2Validation'

/**
 * sleepEpisodes 저장 계층. 기본은 wakeDate(localDate) 1행 upsert(밤잠).
 * 낮잠 등 여러 개가 필요하면 add를 쓴다(하루 다중 허용 — date에 unique 없음).
 */
export const sleepEpisodeRepository = {
  async getByDate(localDate: ISODate): Promise<SleepEpisode | undefined> {
    return db.sleepEpisodes.where('localDate').equals(localDate).first()
  },

  async listByDate(localDate: ISODate): Promise<SleepEpisode[]> {
    return db.sleepEpisodes.where('localDate').equals(localDate).sortBy('wakeAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<SleepEpisode[]> {
    return db.sleepEpisodes.where('localDate').between(start, end, true, true).sortBy('localDate')
  },

  async add(input: SleepEpisodeInput): Promise<number> {
    assertNoErrors(validateSleepChronology(input))
    const now = new Date().toISOString()
    return db.sleepEpisodes.add({ ...input, createdAt: now, updatedAt: now })
  },

  /** wakeDate(localDate) 기준 밤잠 upsert. 존재하면 병합 갱신(createdAt 보존). */
  async upsertByDate(input: SleepEpisodeInput): Promise<number> {
    assertNoErrors(validateSleepChronology(input))
    const now = new Date().toISOString()
    const existing = await this.getByDate(input.localDate)
    if (existing?.id != null) {
      await db.sleepEpisodes.put({ ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now })
      return existing.id
    }
    return db.sleepEpisodes.add({ ...input, createdAt: now, updatedAt: now })
  },

  async deleteById(id: number): Promise<void> {
    await db.sleepEpisodes.delete(id)
  },
}
