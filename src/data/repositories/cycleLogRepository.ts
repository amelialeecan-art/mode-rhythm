import { db } from '../db'
import type { CycleLog, CycleLogInput, ISODate } from '../models'

/**
 * cycleLogs 저장 계층 — 생리 관련 "사실" 기록만.
 * 주기 자동 계산(생리 n일째 / 예정일 / 월경 전 구간 등)은 후속 단계 engine/cycle.
 */
export const cycleLogRepository = {
  async listByDate(date: ISODate): Promise<CycleLog[]> {
    return db.cycleLogs.where('date').equals(date).toArray()
  },

  async add(input: CycleLogInput): Promise<number> {
    const now = new Date().toISOString()
    return db.cycleLogs.add({ ...input, createdAt: now, updatedAt: now })
  },

  async update(id: number, changes: Partial<CycleLogInput>): Promise<void> {
    await db.cycleLogs.update(id, { ...changes, updatedAt: new Date().toISOString() })
  },

  async delete(id: number): Promise<void> {
    await db.cycleLogs.delete(id)
  },

  /** 최근 생리 시작일(periodStart=true) N개 — 주기 추정의 입력으로 쓰일 자료. */
  async listRecentPeriodStarts(limit: number): Promise<CycleLog[]> {
    const starts = await db.cycleLogs.filter((c) => c.periodStart === true).toArray()
    return starts.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit)
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<CycleLog[]> {
    return db.cycleLogs.where('date').between(start, end, true, true).sortBy('date')
  },
}
