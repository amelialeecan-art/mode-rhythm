import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { userSettingsRepository } from '../repositories'

beforeEach(async () => {
  await resetDatabase()
})

describe('userSettingsRepository (Settings 연결)', () => {
  it('toneMode update가 저장된다', async () => {
    await userSettingsRepository.ensureDefault()
    await userSettingsRepository.update({ toneMode: 'direct' })
    expect((await userSettingsRepository.get())!.toneMode).toBe('direct')
  })

  it('cycleEnabled / averageCycleLength update가 저장된다', async () => {
    await userSettingsRepository.ensureDefault()
    await userSettingsRepository.update({ cycleEnabled: false, averageCycleLength: 31 })
    const s = (await userSettingsRepository.get())!
    expect(s.cycleEnabled).toBe(false)
    expect(s.averageCycleLength).toBe(31)
  })

  it('reminderEnabled update가 저장된다', async () => {
    await userSettingsRepository.ensureDefault()
    await userSettingsRepository.update({ reminderEnabled: true })
    expect((await userSettingsRepository.get())!.reminderEnabled).toBe(true)
  })

  it('privacyMode는 local로 유지된다', async () => {
    const s = await userSettingsRepository.ensureDefault()
    expect(s.privacyMode).toBe('local')
  })
})
