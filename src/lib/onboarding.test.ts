import { beforeEach, describe, expect, it } from 'vitest'
import { isOnboardingCompleted, setOnboardingCompleted, clearOnboarding } from './onboarding'

beforeEach(() => {
  const store = new Map<string, string>()
  // 노드 환경에 간단한 localStorage 목 주입
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

describe('onboarding helper', () => {
  it('완료 상태 저장/조회가 된다', () => {
    expect(isOnboardingCompleted()).toBe(false)
    setOnboardingCompleted()
    expect(isOnboardingCompleted()).toBe(true)
  })

  it('clear 시 다시 보기 상태가 된다', () => {
    setOnboardingCompleted()
    clearOnboarding()
    expect(isOnboardingCompleted()).toBe(false)
  })
})
