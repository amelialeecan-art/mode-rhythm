/* =====================================================================
   MODE · 미저장 이탈 가드 (confirmLeaveIfDirty)
   ===================================================================== */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmLeaveIfDirty } from './unsavedGuard'
import { setFormDirty } from './pwaUpdate'

afterEach(() => {
  setFormDirty(false)
  vi.unstubAllGlobals()
})

describe('confirmLeaveIfDirty', () => {
  it('미저장이 없으면 확인창 없이 이동 허용(true)', () => {
    setFormDirty(false)
    expect(confirmLeaveIfDirty()).toBe(true)
  })

  it('미저장이 있고 사용자가 확인(OK)하면 true', () => {
    setFormDirty(true)
    vi.stubGlobal('window', { confirm: () => true })
    expect(confirmLeaveIfDirty()).toBe(true)
  })

  it('미저장이 있고 사용자가 취소하면 false(머무름)', () => {
    setFormDirty(true)
    vi.stubGlobal('window', { confirm: () => false })
    expect(confirmLeaveIfDirty()).toBe(false)
  })

  it('confirm이 없는 환경이면 안전하게 true(막지 않음)', () => {
    setFormDirty(true)
    vi.stubGlobal('window', {})
    expect(confirmLeaveIfDirty()).toBe(true)
  })
})
