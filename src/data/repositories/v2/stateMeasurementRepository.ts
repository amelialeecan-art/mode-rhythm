import { db } from '../../db'
import type { ISODate } from '../../models'
import type { CheckInType, StateMeasurement, StateMeasurementInput } from '../../modelsV2'
import { assertNoErrors, isValidTimestamp, validateStateMetrics, V2ValidationError } from '../../v2Validation'

/**
 * stateMeasurements 저장 계층.
 * - morning/evening: 같은 날짜에 하나씩만 존재하도록 repository가 upsert(중복 방지).
 * - adhoc: 같은 날짜에 여러 개 공존 가능(항상 add).
 * DB에 unique를 걸지 않고 여기서 단일성을 강제한다(adhoc 다중 허용을 위해).
 * ⚠️ 안 물어본 metric을 0으로 채우지 않는다 — 입력의 metrics를 그대로 저장한다.
 */
export const stateMeasurementRepository = {
  async getByDateAndType(localDate: ISODate, checkInType: CheckInType): Promise<StateMeasurement | undefined> {
    return db.stateMeasurements.where('[localDate+checkInType]').equals([localDate, checkInType]).first()
  },

  async listByDate(localDate: ISODate): Promise<StateMeasurement[]> {
    return db.stateMeasurements.where('localDate').equals(localDate).sortBy('recordedAt')
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<StateMeasurement[]> {
    return db.stateMeasurements.where('localDate').between(start, end, true, true).sortBy('recordedAt')
  },

  /**
   * 체크인 저장. morning/evening은 같은 날짜의 기존 것을 병합 갱신(createdAt 보존).
   * adhoc은 항상 새 행. 검증 실패 시 V2ValidationError를 던지고 저장하지 않는다.
   */
  async upsertCheckIn(input: StateMeasurementInput): Promise<number> {
    if (!isValidTimestamp(input.recordedAt)) throw new V2ValidationError('timestamp-invalid')
    assertNoErrors(validateStateMetrics(input.metrics, input.promptedMetrics))

    const now = new Date().toISOString()

    if (input.checkInType === 'adhoc') {
      return db.stateMeasurements.add({ ...input, createdAt: now, updatedAt: now })
    }

    const existing = await this.getByDateAndType(input.localDate, input.checkInType)
    if (existing?.id != null) {
      await db.stateMeasurements.put({
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      })
      return existing.id
    }
    return db.stateMeasurements.add({ ...input, createdAt: now, updatedAt: now })
  },

  async deleteById(id: number): Promise<void> {
    await db.stateMeasurements.delete(id)
  },
}
