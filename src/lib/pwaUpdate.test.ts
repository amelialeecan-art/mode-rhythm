import { describe, expect, it } from 'vitest'
import pwaUpdateSource from './pwaUpdate.ts?raw'
import {
  shouldCheckForUpdate,
  setFormBusy,
  isFormBusy,
  applyUpdate,
  MIN_CHECK_INTERVAL_MS,
} from './pwaUpdate'

describe('shouldCheckForUpdate (스로틀)', () => {
  it('최소 간격이 지나야 true', () => {
    expect(shouldCheckForUpdate(1000, 0, 500)).toBe(true)
    expect(shouldCheckForUpdate(400, 0, 500)).toBe(false)
    expect(shouldCheckForUpdate(500, 0, 500)).toBe(true) // 경계 포함
  })

  it('기본 간격은 60초', () => {
    expect(MIN_CHECK_INTERVAL_MS).toBe(60_000)
    expect(shouldCheckForUpdate(59_999, 0)).toBe(false)
    expect(shouldCheckForUpdate(60_000, 0)).toBe(true)
  })
})

describe('applyUpdate 안전 가드', () => {
  it('폼 저장 중이면 busy를 반환하고 아무것도 하지 않는다', async () => {
    setFormBusy(true)
    expect(isFormBusy()).toBe(true)
    expect(await applyUpdate()).toBe('busy')
    setFormBusy(false)
  })

  it('SW 미등록(테스트/미지원) 환경에서는 noop', async () => {
    setFormBusy(false)
    expect(await applyUpdate()).toBe('noop')
  })
})

describe('업데이트 모듈은 DB를 건드리지 않는다', () => {
  it('코드(주석 제외)에 resetDatabase/clear/deleteDatabase 참조가 없다', () => {
    // 주석 제거 후 실제 코드만 검사 (헤더 주석의 "금지" 안내문은 예외)
    const code = pwaUpdateSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code.includes('resetDatabase')).toBe(false)
    expect(/\.\s*clear\s*\(/.test(code)).toBe(false)
    expect(code.includes('deleteDatabase')).toBe(false)
    expect(code.includes("from '../data")).toBe(false) // data 계층 import 자체가 없음
    expect(code.includes('indexedDB')).toBe(false)
  })
})
