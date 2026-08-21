/* =====================================================================
   MODE · 다중 편집기 dirty 집계 + PWA update safety
   여러 체크인이 열려 있어도 서로의 dirty를 덮어쓰지 않고 OR로 모인다.
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDirty, reportDirty, resetDirtyRegistry } from '../checkIn/dirtyRegistry'
import { isFormDirty, setFormDirty } from '../../../lib/pwaUpdate'

beforeEach(() => {
  resetDirtyRegistry()
})

describe('dirtyRegistry — OR 집계', () => {
  it('하나라도 dirty면 전역 dirty가 true', () => {
    expect(isFormDirty()).toBe(false)
    reportDirty('checkin-morning', true)
    expect(isFormDirty()).toBe(true)
  })

  it('한 편집기의 false가 다른 편집기의 dirty를 덮어쓰지 않는다', () => {
    reportDirty('checkin-morning', true)
    reportDirty('checkin-evening', true)
    // morning을 저장(=false)해도 evening이 남아 여전히 dirty
    reportDirty('checkin-morning', false)
    expect(isFormDirty()).toBe(true)
    // evening까지 정리되면 clean
    clearDirty('checkin-evening')
    expect(isFormDirty()).toBe(false)
  })

  it('reset은 전역 dirty를 해제한다 (PWA 업데이트 보류 사유 제거)', () => {
    reportDirty('checkin-morning', true)
    resetDirtyRegistry()
    expect(isFormDirty()).toBe(false)
    // pwaUpdate의 순수 API는 그대로 동작
    setFormDirty(true)
    expect(isFormDirty()).toBe(true)
    setFormDirty(false)
    expect(isFormDirty()).toBe(false)
  })
})
