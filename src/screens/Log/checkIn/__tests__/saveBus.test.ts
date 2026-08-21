/* =====================================================================
   MODE · dirty 집계 + 저장 버스 (플로팅 저장바 로직)
   ===================================================================== */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  reportDirty,
  clearDirty,
  registerSaver,
  unregisterSaver,
  hasSavableDirty,
  isSaving,
  saveAllDirty,
  resetDirtyRegistry,
} from '../dirtyRegistry'

beforeEach(() => resetDirtyRegistry())

describe('저장바 노출 조건 — saver가 있고 dirty일 때만', () => {
  it('(12) dirty=false면 노출 안 함', () => {
    registerSaver('a', () => {})
    reportDirty('a', false)
    expect(hasSavableDirty()).toBe(false)
  })
  it('(13) dirty=true면 노출', () => {
    registerSaver('a', () => {})
    reportDirty('a', true)
    expect(hasSavableDirty()).toBe(true)
  })
  it('saver 없이 dirty만이면 저장바 노출 안 함(자기 버튼으로 저장)', () => {
    reportDirty('x', true)
    expect(hasSavableDirty()).toBe(false)
  })
})

describe('(14/15) saveAllDirty — 각 카드의 기존 핸들러 재사용, 중복 저장 없음', () => {
  it('dirty이고 saver가 있는 카드만, 등록 순서대로 저장', async () => {
    const calls: string[] = []
    registerSaver('a', () => { calls.push('a') })
    registerSaver('b', () => { calls.push('b') })
    registerSaver('c', () => { calls.push('c') })
    reportDirty('a', true)
    reportDirty('b', false) // dirty 아님 → 저장 안 함
    reportDirty('c', true)
    await saveAllDirty()
    expect(calls).toEqual(['a', 'c'])
  })

  it('저장 중 재호출은 무시(중복 save 방지)', async () => {
    let resolve!: () => void
    const gate = new Promise<void>((r) => { resolve = r })
    const saver = vi.fn(() => gate)
    registerSaver('a', saver)
    reportDirty('a', true)
    const first = saveAllDirty()
    expect(isSaving()).toBe(true)
    const second = saveAllDirty() // 진행 중 → 무시
    resolve()
    await Promise.all([first, second])
    expect(saver).toHaveBeenCalledTimes(1)
    expect(isSaving()).toBe(false)
  })
})

describe('(16) 저장 후 상태', () => {
  it('카드가 저장 성공 시 자기 dirty를 false로 만들면 저장바가 사라진다', async () => {
    registerSaver('a', () => { reportDirty('a', false) }) // 카드 onSave가 하는 일
    reportDirty('a', true)
    expect(hasSavableDirty()).toBe(true)
    await saveAllDirty()
    expect(hasSavableDirty()).toBe(false)
  })

  it('clearDirty(언마운트)는 dirty와 saver를 모두 제거', () => {
    registerSaver('a', () => {})
    reportDirty('a', true)
    clearDirty('a')
    expect(hasSavableDirty()).toBe(false)
    unregisterSaver('a') // 존재하지 않아도 안전
    expect(hasSavableDirty()).toBe(false)
  })
})
