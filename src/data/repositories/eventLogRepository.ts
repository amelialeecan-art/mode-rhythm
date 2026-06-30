import { db } from '../db'
import type { EventLog, EventLogInput, ISODate } from '../models'

/**
 * eventLogs 저장 계층 — "오늘 있었던 일"(사건/상황). 하루 여러 개 가능.
 * 생리/주기는 절대 여기 저장하지 않는다(→ cycleLogRepository).
 */
export const eventLogRepository = {
  async listByDate(date: ISODate): Promise<EventLog[]> {
    return db.eventLogs.where('date').equals(date).toArray()
  },

  async add(input: EventLogInput): Promise<number> {
    return db.eventLogs.add({ ...input, createdAt: new Date().toISOString() })
  },

  async bulkAdd(inputs: EventLogInput[]): Promise<number[]> {
    const now = new Date().toISOString()
    const rows = inputs.map((e) => ({ ...e, createdAt: now }))
    const keys = await db.eventLogs.bulkAdd(rows, { allKeys: true })
    return keys as number[]
  },

  async delete(id: number): Promise<void> {
    await db.eventLogs.delete(id)
  },

  async deleteByDate(date: ISODate): Promise<void> {
    await db.eventLogs.where('date').equals(date).delete()
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<EventLog[]> {
    return db.eventLogs.where('date').between(start, end, true, true).sortBy('date')
  },

  /** 분석용: 특정 요인 그룹에 속한 사건들. */
  async listByFactorGroup(factorGroup: string): Promise<EventLog[]> {
    return db.eventLogs.where('mappedFactorGroup').equals(factorGroup).toArray()
  },
}
