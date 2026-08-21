import { db } from '../../db'
import type { Experiment, ExperimentInput, ExperimentStatus } from '../../modelsV2'

/**
 * experiments 저장 계층 — N-of-1 개인 실험(생활요인만).
 * ⚠️ 의료 치료 변경 실험은 여기서 생성/제안하지 않는다(interventionCode가 생활요인 한정).
 */
export const experimentRepository = {
  async create(input: ExperimentInput): Promise<number> {
    const now = new Date().toISOString()
    return db.experiments.add({ ...input, createdAt: now, updatedAt: now })
  },

  async getById(id: number): Promise<Experiment | undefined> {
    return db.experiments.get(id)
  },

  async list(): Promise<Experiment[]> {
    return db.experiments.orderBy('id').reverse().toArray()
  },

  async listByStatus(status: ExperimentStatus): Promise<Experiment[]> {
    return db.experiments.where('status').equals(status).toArray()
  },

  async update(id: number, patch: Partial<ExperimentInput>): Promise<void> {
    const existing = await db.experiments.get(id)
    if (!existing) return
    await db.experiments.put({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() })
  },

  async setStatus(id: number, status: ExperimentStatus): Promise<void> {
    await this.update(id, { status })
  },

  async deleteById(id: number): Promise<void> {
    await db.experiments.delete(id)
  },
}
