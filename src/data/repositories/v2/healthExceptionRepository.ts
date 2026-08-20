import { db } from '../../db'
import type { ISODate } from '../../models'
import type { HealthException, HealthExceptionInput } from '../../modelsV2'

/**
 * healthExceptions 저장 계층. 하루 여러 개 공존(항상 add).
 * category는 고정 집합 — 분석에는 category만 사용한다(customLabel은 표시용).
 */
export const healthExceptionRepository = {
  async add(input: HealthExceptionInput): Promise<number> {
    const now = new Date().toISOString()
    return db.healthExceptions.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listByDate(localDate: ISODate): Promise<HealthException[]> {
    return db.healthExceptions.where('localDate').equals(localDate).sortBy('occurredAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<HealthException[]> {
    return db.healthExceptions.where('localDate').between(start, end, true, true).sortBy('localDate')
  },

  async deleteById(id: number): Promise<void> {
    await db.healthExceptions.delete(id)
  },
}
