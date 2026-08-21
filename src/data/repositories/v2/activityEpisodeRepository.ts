import { db } from '../../db'
import type { ISODate } from '../../models'
import type { ActivityEpisode, ActivityEpisodeInput } from '../../modelsV2'
import { assertNoErrors, isValidTimestamp, type V2ValidationCode } from '../../v2Validation'

/**
 * activityEpisodes 저장 계층. 하루 여러 개 공존(항상 add).
 * durationMinutes는 0 이상이어야 한다("운동함 Y/N" 대신 구조화 기록).
 */
export const activityEpisodeRepository = {
  async add(input: ActivityEpisodeInput): Promise<number> {
    const errors: V2ValidationCode[] = []
    if (!isValidTimestamp(input.startedAt)) errors.push('timestamp-invalid')
    if (!(Number.isFinite(input.durationMinutes) && input.durationMinutes >= 0)) errors.push('duration-negative')
    if (input.rpe !== undefined && input.rpe !== null && input.rpe !== 'unknown') {
      if (!(Number.isInteger(input.rpe) && input.rpe >= 0 && input.rpe <= 10)) errors.push('rating-range')
    }
    assertNoErrors(errors)
    const now = new Date().toISOString()
    return db.activityEpisodes.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listByDate(localDate: ISODate): Promise<ActivityEpisode[]> {
    return db.activityEpisodes.where('localDate').equals(localDate).sortBy('startedAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<ActivityEpisode[]> {
    return db.activityEpisodes.where('localDate').between(start, end, true, true).sortBy('startedAt')
  },

  async getById(id: number): Promise<ActivityEpisode | undefined> {
    return db.activityEpisodes.get(id)
  },

  /** 단일 운동 부분 수정(merge). createdAt 보존. duration/rpe 재검증. */
  async update(id: number, patch: Partial<ActivityEpisodeInput>): Promise<void> {
    const existing = await db.activityEpisodes.get(id)
    if (!existing) return
    const merged = { ...existing, ...patch }
    const errors: V2ValidationCode[] = []
    if (!(Number.isFinite(merged.durationMinutes) && merged.durationMinutes >= 0)) errors.push('duration-negative')
    if (merged.rpe !== undefined && merged.rpe !== null && merged.rpe !== 'unknown') {
      if (!(Number.isInteger(merged.rpe) && merged.rpe >= 0 && merged.rpe <= 10)) errors.push('rating-range')
    }
    assertNoErrors(errors)
    await db.activityEpisodes.put({ ...merged, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  async deleteById(id: number): Promise<void> {
    await db.activityEpisodes.delete(id)
  },
}
