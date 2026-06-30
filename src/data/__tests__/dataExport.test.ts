import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { seedDemoData } from '../seed'
import { exportAllData } from '../services/dataExportService'

beforeEach(async () => {
  await resetDatabase()
})

describe('exportAllData', () => {
  it('app/version/exportedAt + 모든 테이블을 포함한다', async () => {
    await seedDemoData()
    const payload = await exportAllData()
    expect(payload.app).toBe('MODE')
    expect(payload.version).toBe(1)
    expect(payload.exportedAt).toBeTruthy()
    expect(payload.tables.dailyLogs.length).toBeGreaterThan(0)
    expect(payload.tables.userSettings.length).toBe(1)
    // 7개 테이블 키 모두 존재
    expect(Object.keys(payload.tables).sort()).toEqual(
      ['cycleLogs', 'dailyLogs', 'dailyScores', 'eventLogs', 'patternInsights', 'recoveryLogs', 'userSettings'].sort(),
    )
  })

  it('reset 후 export하면 모든 테이블이 빈 배열이다', async () => {
    await resetDatabase()
    const payload = await exportAllData()
    expect(payload.tables.dailyLogs).toHaveLength(0)
    expect(payload.tables.userSettings).toHaveLength(0)
    expect(payload.tables.cycleLogs).toHaveLength(0)
  })
})
