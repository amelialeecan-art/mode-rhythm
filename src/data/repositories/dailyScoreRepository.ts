import { db } from '../db'
import type { DailyScore, DailyScoreInput, ISODate } from '../models'

/**
 * dailyScores 저장 계층 — 하루 1행(date unique). 점수 "계산"은 후속 단계 engine.
 * 이번 단계는 구조/저장만. upsert로 하루 1행 보장.
 */
export const dailyScoreRepository = {
  async getByDate(date: ISODate): Promise<DailyScore | undefined> {
    return db.dailyScores.where('date').equals(date).first()
  },

  async upsert(input: DailyScoreInput): Promise<number> {
    const now = new Date().toISOString()
    const existing = await db.dailyScores.where('date').equals(input.date).first()
    if (existing?.id != null) {
      await db.dailyScores.put({ ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now })
      return existing.id
    }
    return db.dailyScores.add({ ...input, createdAt: now, updatedAt: now })
  },

  async listByDateRange(start: ISODate, end: ISODate): Promise<DailyScore[]> {
    return db.dailyScores.where('date').between(start, end, true, true).sortBy('date')
  },

  async listRecent(days: number): Promise<DailyScore[]> {
    const all = await db.dailyScores.orderBy('date').reverse().limit(days).toArray()
    return all.reverse()
  },
}
