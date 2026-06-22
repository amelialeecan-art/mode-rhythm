import { db } from '../db'
import type { RecoveryLog, RecoveryLogInput, ISODate } from '../models'

/**
 * recoveryLogs 저장 계층 — 회복 행동 기록. 하루 여러 개 가능.
 * 전후/다음날 효과 "분석"은 후속 단계 engine/recovery. 여기는 저장만.
 */
export const recoveryLogRepository = {
  async listByDate(date: ISODate): Promise<RecoveryLog[]> {
    return db.recoveryLogs.where('date').equals(date).toArray()
  },

  async add(input: RecoveryLogInput): Promise<number> {
    return db.recoveryLogs.add({ ...input, createdAt: new Date().toISOString() })
  },

  async update(id: number, changes: Partial<RecoveryLogInput>): Promise<void> {
    await db.recoveryLogs.update(id, changes)
  },

  async delete(id: number): Promise<void> {
    await db.recoveryLogs.delete(id)
  },

  /** 같은 날짜 기록 일괄 삭제 (quick log 저장 시 replace 용). */
  async deleteByDate(date: ISODate): Promise<void> {
    await db.recoveryLogs.where('date').equals(date).delete()
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<RecoveryLog[]> {
    return db.recoveryLogs.where('date').between(start, end, true, true).sortBy('date')
  },

  /** 분석용: 특정 회복 행동 코드의 기록들. */
  async listByActionCode(actionCode: string): Promise<RecoveryLog[]> {
    return db.recoveryLogs.where('actionCode').equals(actionCode).toArray()
  },
}
