/* =====================================================================
   MODE · 기록 탭 전역 저장 버스 (FloatingSaveBar 로직)
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
  SAVE_ORDER,
} from '../dirtyRegistry'

beforeEach(() => resetDirtyRegistry())

describe('전역 저장바 노출 조건 — saver가 있고 dirty일 때만', () => {
  it('(1~9) 각 영역이 dirty로 등록되면 저장바가 뜬다', () => {
    // 실제 컴포넌트가 쓰는 키/순서를 모사 — 어떤 영역 하나만 dirty여도 노출.
    for (const [key, order] of [
      ['checkin-morning', SAVE_ORDER.checkin],
      ['sleep-episode', SAVE_ORDER.sleep],
      ['meal-quick', SAVE_ORDER.meal],
      ['stress-event', SAVE_ORDER.event],
      ['activity-episode', SAVE_ORDER.event],
      ['medication-dose', SAVE_ORDER.health],
      ['health-exception', SAVE_ORDER.health],
      ['weight-measurement', SAVE_ORDER.health],
      ['legacy-log', SAVE_ORDER.legacy],
    ] as const) {
      resetDirtyRegistry()
      registerSaver(key, () => true, key, order)
      reportDirty(key, true)
      expect(hasSavableDirty(), key).toBe(true)
    }
  })

  it('saver 없이 dirty만이면 저장바 노출 안 함(즉시 저장 영역)', () => {
    reportDirty('atomic-x', true)
    expect(hasSavableDirty()).toBe(false)
  })
})

describe('(7) 저장 순서는 등록 순서가 아니라 SAVE_ORDER를 따른다', () => {
  it('역순 등록해도 checkin→sleep→meal→event→health→legacy 순으로 저장', async () => {
    const calls: string[] = []
    registerSaver('legacy-log', () => { calls.push('legacy') }, '이전 방식 기록', SAVE_ORDER.legacy)
    registerSaver('weight-measurement', () => { calls.push('weight') }, '체중 기록', SAVE_ORDER.health)
    registerSaver('meal-quick', () => { calls.push('meal') }, '식사 기록', SAVE_ORDER.meal)
    registerSaver('sleep-episode', () => { calls.push('sleep') }, '수면 기록', SAVE_ORDER.sleep)
    registerSaver('checkin-morning', () => { calls.push('checkin') }, '아침 상태', SAVE_ORDER.checkin)
    for (const k of ['legacy-log', 'weight-measurement', 'meal-quick', 'sleep-episode', 'checkin-morning']) reportDirty(k, true)
    await saveAllDirty()
    expect(calls).toEqual(['checkin', 'sleep', 'meal', 'weight', 'legacy'])
  })
})

describe('(10/14) saveAllDirty — 한 번에 저장, 중복 방지', () => {
  it('(10) 서로 다른 3개 영역 동시 dirty → 한 번에 세 saver 모두 호출', async () => {
    const calls: string[] = []
    registerSaver('checkin-morning', () => { calls.push('a') }, '아침 상태', SAVE_ORDER.checkin)
    registerSaver('sleep-episode', () => { calls.push('b') }, '수면 기록', SAVE_ORDER.sleep)
    registerSaver('meal-quick', () => { calls.push('c') }, '식사 기록', SAVE_ORDER.meal)
    for (const k of ['checkin-morning', 'sleep-episode', 'meal-quick']) reportDirty(k, true)
    const failed = await saveAllDirty()
    expect(calls).toEqual(['a', 'b', 'c'])
    expect(failed).toEqual([])
  })

  it('(14) 저장 중 재호출 무시(연타 방지)', async () => {
    let resolve!: () => void
    const gate = new Promise<void>((r) => { resolve = r })
    const saver = vi.fn(async () => { await gate; return true })
    registerSaver('sleep-episode', saver, '수면 기록', SAVE_ORDER.sleep)
    reportDirty('sleep-episode', true)
    const first = saveAllDirty()
    expect(isSaving()).toBe(true)
    const second = saveAllDirty() // 진행 중 → 무시
    resolve()
    await Promise.all([first, second])
    expect(saver).toHaveBeenCalledTimes(1)
    expect(isSaving()).toBe(false)
  })
})

describe('(6/11/12) invalid draft + valid draft 동시 저장', () => {
  it('valid는 저장, invalid(false/throw/{ok:false})는 구체 메시지로 남는다', async () => {
    // 수면 valid(저장), 운동 invalid({ok:false,message}), 아침 throw
    registerSaver('sleep-episode', () => { reportDirty('sleep-episode', false); return true }, '수면 기록', SAVE_ORDER.sleep)
    registerSaver('activity-episode', () => ({ ok: false, message: '운동 기록에서 운동 시간을 아직 안 적었어.' }), '운동 기록', SAVE_ORDER.event)
    registerSaver('checkin-morning', () => { throw new Error('boom') }, '아침 상태', SAVE_ORDER.checkin)
    for (const k of ['sleep-episode', 'activity-episode', 'checkin-morning']) reportDirty(k, true)
    const failed = await saveAllDirty()
    // 구체 메시지 그대로, 라벨 fallback 메시지도 포함
    expect(failed.some((m) => m.includes('운동 시간을 아직 안 적었어'))).toBe(true)
    expect(failed.some((m) => m.includes('아침 상태'))).toBe(true)
    expect(failed.some((m) => m.includes('수면 기록'))).toBe(false)
    // 수면은 저장돼 dirty 해제, 나머지는 남음
    expect(hasSavableDirty()).toBe(true)
  })

  it('(12) 한 영역만 저장되고 다른 dirty가 남으면 저장바는 계속 표시', async () => {
    // 수면은 저장 성공(자기 dirty 해제), 저녁 상태는 아직 dirty
    registerSaver('sleep-episode', () => { reportDirty('sleep-episode', false); return true }, '수면 기록', SAVE_ORDER.sleep)
    registerSaver('checkin-evening', () => false, '저녁 상태', SAVE_ORDER.checkin)
    reportDirty('sleep-episode', true)
    reportDirty('checkin-evening', true)
    await saveAllDirty()
    // 저녁 상태가 여전히 dirty → 바 유지(§9: 한 영역 저장이 다른 영역 dirty를 지우지 않는다)
    expect(hasSavableDirty()).toBe(true)
  })
})

describe('(13) 모두 저장 완료 → 저장바 숨김 / 언마운트 정리', () => {
  it('모든 영역이 성공하면 dirty 없음', async () => {
    registerSaver('checkin-morning', () => { reportDirty('checkin-morning', false); return true }, '아침 상태', SAVE_ORDER.checkin)
    registerSaver('sleep-episode', () => { reportDirty('sleep-episode', false); return true }, '수면 기록', SAVE_ORDER.sleep)
    reportDirty('checkin-morning', true)
    reportDirty('sleep-episode', true)
    const failed = await saveAllDirty()
    expect(failed).toEqual([])
    expect(hasSavableDirty()).toBe(false)
  })

  it('clearDirty(언마운트)는 dirty와 saver를 모두 제거', () => {
    registerSaver('a', () => true, 'A', 1)
    reportDirty('a', true)
    clearDirty('a')
    expect(hasSavableDirty()).toBe(false)
    unregisterSaver('a')
    expect(hasSavableDirty()).toBe(false)
  })
})
