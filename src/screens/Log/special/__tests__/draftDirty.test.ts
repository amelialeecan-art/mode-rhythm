/* =====================================================================
   MODE · dirty vs canSave 는 서로 독립이다 (전역 저장바 핵심 규칙)
   dirty=true & canSave=false 상태(미완성 draft)가 정상적으로 존재해야 한다.
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  stressDirty, stressCanSave,
  activityDirty, activityCanSave,
  weightDirty, weightCanSave,
  healthDirty,
  medicationDirty, medicationCanSave,
} from '../draftDirty'

describe('스트레스: dirty ≠ canSave', () => {
  it('(1) 종류만 선택 → dirty=true, canSave=false', () => {
    expect(stressDirty('interpersonal_conflict', null)).toBe(true)
    expect(stressCanSave('interpersonal_conflict', null)).toBe(false)
  })
  it('강도만 선택해도 dirty=true, canSave=false', () => {
    expect(stressDirty(null, 5)).toBe(true)
    expect(stressCanSave(null, 5)).toBe(false)
  })
  it('둘 다 있으면 canSave=true', () => {
    expect(stressDirty('interpersonal_conflict', 5)).toBe(true)
    expect(stressCanSave('interpersonal_conflict', 5)).toBe(true)
  })
  it("'모름'(unknown)은 강도 미완성 → canSave=false지만 dirty=true", () => {
    expect(stressDirty('interpersonal_conflict', 'unknown')).toBe(true)
    expect(stressCanSave('interpersonal_conflict', 'unknown')).toBe(false)
  })
  it('(4) 아무것도 안 건드리면 dirty=false', () => {
    expect(stressDirty(null, null)).toBe(false)
  })
})

describe('운동: dirty ≠ canSave', () => {
  it('(2) 종류만 바꾸고 시간 안 적음 → dirty=true, canSave=false', () => {
    expect(activityDirty('cardio', '', null, '')).toBe(true)
    expect(activityCanSave('')).toBe(false)
  })
  it('기본값(strength) 그대로 + 빈 입력 → dirty=false', () => {
    expect(activityDirty('strength', '', null, '')).toBe(false)
  })
  it('시간 입력하면 canSave=true', () => {
    expect(activityDirty('strength', '30', null, '')).toBe(true)
    expect(activityCanSave('30')).toBe(true)
  })
})

describe('체중: dirty ≠ canSave', () => {
  it('(3) 입력 시작했지만 미완성(비숫자) → dirty=true, canSave=false', () => {
    expect(weightDirty('6', null)).toBe(true)
    expect(weightCanSave('6')).toBe(true) // 6은 유효
    expect(weightCanSave('abc')).toBe(false)
    expect(weightDirty('abc', null)).toBe(true) // 뭔가 입력함 → dirty
  })
  it('본 것만 골라도 dirty=true, canSave=false', () => {
    expect(weightDirty('', true)).toBe(true)
    expect(weightCanSave('')).toBe(false)
  })
  it('빈 폼 → dirty=false', () => {
    expect(weightDirty('', null)).toBe(false)
  })
})

describe('건강예외 / 약: 초기 빈 폼은 dirty 아님', () => {
  it('건강예외: 기본(illness)+미입력 → dirty=false, 강도 고르면 dirty=true', () => {
    expect(healthDirty('illness', null)).toBe(false)
    expect(healthDirty('illness', 5)).toBe(true)
    expect(healthDirty('injury', null)).toBe(true) // 종류 바꿈
  })
  it('약: 아무 약 안 고르면 dirty=false, 고르면 dirty=true/canSave=true', () => {
    expect(medicationDirty(null, '')).toBe(false)
    expect(medicationDirty(3, '')).toBe(true)
    expect(medicationCanSave(3)).toBe(true)
    expect(medicationCanSave(null)).toBe(false)
    // dose만 적고 약 미선택 → dirty지만 저장 불가
    expect(medicationDirty(null, '1')).toBe(true)
    expect(medicationCanSave(null)).toBe(false)
  })
})

describe('(5) 되돌리면 dirty=false', () => {
  it('스트레스: 골랐다 다시 해제하면 dirty=false', () => {
    expect(stressDirty(null, null)).toBe(false) // 초기 = 해제 상태
  })
})
