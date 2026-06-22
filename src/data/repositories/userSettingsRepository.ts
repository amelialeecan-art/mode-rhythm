import { db } from '../db'
import { DEFAULT_USER_SETTINGS, type UserSettings } from '../models'

/**
 * userSettings 저장 계층 — 단일 행. 항상 기본값을 보장한다(ensureDefault).
 */
export const userSettingsRepository = {
  /** 첫 행 반환(없으면 undefined). 보통은 ensureDefault를 먼저 호출. */
  async get(): Promise<UserSettings | undefined> {
    return db.userSettings.toCollection().first()
  },

  /** 설정 행이 없으면 MVP 기본값으로 생성. 항상 유효한 설정을 반환. */
  async ensureDefault(): Promise<UserSettings> {
    const existing = await db.userSettings.toCollection().first()
    if (existing) return existing
    const now = new Date().toISOString()
    const row: UserSettings = { ...DEFAULT_USER_SETTINGS, createdAt: now, updatedAt: now }
    const id = await db.userSettings.add(row)
    return { ...row, id }
  },

  /** 기존 설정을 부분 갱신. 행이 없으면 먼저 기본값을 만든 뒤 적용. */
  async update(changes: Partial<Omit<UserSettings, 'id' | 'createdAt' | 'updatedAt'>>): Promise<UserSettings> {
    const current = await this.ensureDefault()
    const updated: UserSettings = { ...current, ...changes, updatedAt: new Date().toISOString() }
    await db.userSettings.put(updated)
    return updated
  },
}
