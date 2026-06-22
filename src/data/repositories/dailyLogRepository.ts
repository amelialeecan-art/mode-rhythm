import { db } from '../db'
import type { DailyLog, DailyLogInput, ISODate } from '../models'

/**
 * dailyLogs 저장 계층. 하루 1행(date unique) — upsert로 안정 동작.
 * UI/engine은 Dexie를 직접 만지지 말고 이 repository만 사용한다.
 */
export const dailyLogRepository = {
  async getByDate(date: ISODate): Promise<DailyLog | undefined> {
    return db.dailyLogs.where('date').equals(date).first()
  },

  /** date 기준 upsert. 존재하면 병합 갱신(createdAt 보존), 없으면 신규. id 반환. */
  async upsert(input: DailyLogInput): Promise<number> {
    const now = new Date().toISOString()
    const existing = await db.dailyLogs.where('date').equals(input.date).first()
    if (existing?.id != null) {
      await db.dailyLogs.put({ ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now })
      return existing.id
    }
    return db.dailyLogs.add({ ...input, createdAt: now, updatedAt: now })
  },

  async deleteByDate(date: ISODate): Promise<void> {
    await db.dailyLogs.where('date').equals(date).delete()
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<DailyLog[]> {
    return db.dailyLogs.where('date').between(start, end, true, true).sortBy('date')
  },

  /** 오늘 포함 최근 N일. (날짜 문자열 비교 기반 — 호출부에서 start 계산해 넘겨도 됨) */
  async listRecent(days: number): Promise<DailyLog[]> {
    const all = await db.dailyLogs.orderBy('date').reverse().limit(days).toArray()
    return all.reverse()
  },
}
