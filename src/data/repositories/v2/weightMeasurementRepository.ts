import { db } from '../../db'
import type { ISODate } from '../../models'
import type { WeightMeasurement, WeightMeasurementInput } from '../../modelsV2'
import { isValidTimestamp, V2ValidationError } from '../../v2Validation'

/**
 * weightMeasurements 저장 계층. 하루 여러 번 잴 수 있어 다중 허용(항상 add).
 * weightKg(신체 값)와 userSawWeight(본 행위 = 심리적 exposure)는 분리 저장된다.
 */
export const weightMeasurementRepository = {
  async add(input: WeightMeasurementInput): Promise<number> {
    if (!isValidTimestamp(input.measuredAt)) throw new V2ValidationError('timestamp-invalid')
    if (!(typeof input.weightKg === 'number' && Number.isFinite(input.weightKg) && input.weightKg > 0)) {
      throw new V2ValidationError('rating-range', 'weightKg must be a positive number')
    }
    const now = new Date().toISOString()
    return db.weightMeasurements.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listByDate(localDate: ISODate): Promise<WeightMeasurement[]> {
    return db.weightMeasurements.where('localDate').equals(localDate).sortBy('measuredAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<WeightMeasurement[]> {
    return db.weightMeasurements.where('localDate').between(start, end, true, true).sortBy('measuredAt')
  },

  async getById(id: number): Promise<WeightMeasurement | undefined> {
    return db.weightMeasurements.get(id)
  },

  /** 단일 체중 부분 수정(merge). createdAt 보존. weightKg 유효성 재검증. */
  async update(id: number, patch: Partial<WeightMeasurementInput>): Promise<void> {
    const existing = await db.weightMeasurements.get(id)
    if (!existing) return
    const merged = { ...existing, ...patch }
    if (!(typeof merged.weightKg === 'number' && Number.isFinite(merged.weightKg) && merged.weightKg > 0)) {
      throw new V2ValidationError('rating-range', 'weightKg must be a positive number')
    }
    await db.weightMeasurements.put({ ...merged, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  async deleteById(id: number): Promise<void> {
    await db.weightMeasurements.delete(id)
  },
}
