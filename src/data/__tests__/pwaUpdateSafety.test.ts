import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { seedDemoData } from '../seed'
import { db } from '../db'
import { DB_NAME, DB_VERSION, SCHEMA_V1 } from '../schema'
import { applyUpdate, checkForUpdateNow, setFormBusy } from '../../lib/pwaUpdate'

async function tableCounts() {
  return {
    dailyLogs: await db.dailyLogs.count(),
    eventLogs: await db.eventLogs.count(),
    cycleLogs: await db.cycleLogs.count(),
    recoveryLogs: await db.recoveryLogs.count(),
    dailyScores: await db.dailyScores.count(),
  }
}

beforeEach(async () => {
  await resetDatabase()
})

describe('PWA 업데이트 흐름의 데이터 안전성', () => {
  it('업데이트 확인/적용을 거쳐도 IndexedDB 기록 수가 그대로다', async () => {
    await seedDemoData()
    const before = await tableCounts()
    expect(before.dailyLogs).toBeGreaterThan(0)

    // 업데이트 흐름 전체 호출 (테스트 환경: SW 없음 → unsupported/noop 경로)
    setFormBusy(false)
    await checkForUpdateNow()
    await applyUpdate()

    const after = await tableCounts()
    expect(after).toEqual(before)
  })

  it('DB 이름/버전/스키마는 그대로다', () => {
    expect(DB_NAME).toBe('MODELocalDB')
    expect(DB_VERSION).toBe(1)
    expect(Object.keys(SCHEMA_V1)).toHaveLength(7)
    expect(SCHEMA_V1.dailyLogs).toBe('++id, &date')
    expect(SCHEMA_V1.dailyScores).toBe('++id, &date, dayType')
  })
})
