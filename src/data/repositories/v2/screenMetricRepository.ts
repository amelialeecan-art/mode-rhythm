import { db } from '../../db'
import type { ISODate } from '../../models'
import type { ScreenMetric, ScreenMetricInput } from '../../modelsV2'
import { isNonNegativeOrNull, V2ValidationError } from '../../v2Validation'

/**
 * screenMetrics 저장 계층. 하루 1행 집계 upsert(localDate 기준).
 * ⚠️ 웹 PWA에서 Apple Screen Time을 직접 읽지 않는다 — 값은 수동/미래 native 연동으로만 채운다.
 */
export const screenMetricRepository = {
  async getByDate(localDate: ISODate): Promise<ScreenMetric | undefined> {
    return db.screenMetrics.where('localDate').equals(localDate).first()
  },

  async upsertByDate(input: ScreenMetricInput): Promise<number> {
    for (const v of [input.totalMinutes, input.socialMinutes, input.shortFormMinutes, input.preBed2hMinutes]) {
      if (!isNonNegativeOrNull(v)) throw new V2ValidationError('duration-negative')
    }
    const now = new Date().toISOString()
    const existing = await this.getByDate(input.localDate)
    if (existing?.id != null) {
      await db.screenMetrics.put({ ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now })
      return existing.id
    }
    return db.screenMetrics.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<ScreenMetric[]> {
    return db.screenMetrics.where('localDate').between(start, end, true, true).sortBy('localDate')
  },

  async deleteByDate(localDate: ISODate): Promise<void> {
    await db.screenMetrics.where('localDate').equals(localDate).delete()
  },
}
