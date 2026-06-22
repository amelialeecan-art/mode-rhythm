import { db } from '../db'
import type { InsightType, PatternInsight, PatternInsightInput } from '../models'

/**
 * patternInsights 저장 계층 — 분석 결과 보관. "분석" 자체는 후속 단계 engine.
 * message는 단정 문구를 넣지 않는다(후속 단계에서 copy guard 연결).
 */
export const patternInsightRepository = {
  async add(input: PatternInsightInput): Promise<number> {
    return db.patternInsights.add({ ...input, createdAt: new Date().toISOString() })
  },

  async listRecent(limit: number): Promise<PatternInsight[]> {
    const all = await db.patternInsights.orderBy('createdAt').reverse().limit(limit).toArray()
    return all
  },

  async listByType(insightType: InsightType): Promise<PatternInsight[]> {
    return db.patternInsights.where('insightType').equals(insightType).toArray()
  },

  async clearAll(): Promise<void> {
    await db.patternInsights.clear()
  },
}
