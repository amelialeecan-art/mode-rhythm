/* =====================================================================
   MODE · 다중 편집기 dirty 집계 + 저장 버스 (순수 · 모듈 상태)
   여러 체크인/에피소드 카드가 동시에 열려 있어도 "하나라도 미저장이면 dirty"가
   되도록 키별 dirty를 OR로 모아 전역 setFormDirty(PWA 업데이트 안전)에 반영한다.

   추가: 각 카드가 자신의 canonical save 핸들러를 등록하면, 플로팅 저장바가
   dirty인 카드들의 저장을 한 번에 호출할 수 있다(새 저장 로직을 만들지 않고 재사용).
   ===================================================================== */
import { setFormDirty } from '../../../lib/pwaUpdate'

type Saver = () => Promise<void> | void
interface Entry {
  dirty: boolean
  save?: Saver
}

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let saving = false

function entryOf(key: string): Entry {
  let e = entries.get(key)
  if (!e) {
    e = { dirty: false }
    entries.set(key, e)
  }
  return e
}

function anyDirty(): boolean {
  for (const e of entries.values()) if (e.dirty) return true
  return false
}

function syncGlobalDirty(): void {
  setFormDirty(anyDirty())
}

function notify(): void {
  for (const l of listeners) l()
}

/** key의 dirty 상태를 갱신하고 전역 dirty를 재계산한다. */
export function reportDirty(key: string, dirty: boolean): void {
  entryOf(key).dirty = dirty
  syncGlobalDirty()
  notify()
}

/** key 등록 해제(언마운트 시). dirty·saver 모두 제거. */
export function clearDirty(key: string): void {
  entries.delete(key)
  syncGlobalDirty()
  notify()
}

/** 카드의 canonical save 핸들러 등록(중복 저장 로직 없이 재사용). */
export function registerSaver(key: string, save: Saver): void {
  entryOf(key).save = save
  notify()
}

/** save 핸들러만 해제(dirty는 clearDirty가 처리). */
export function unregisterSaver(key: string): void {
  const e = entries.get(key)
  if (e) e.save = undefined
  notify()
}

/** 플로팅 저장바 구독(dirty/saving 변화 시 재렌더). */
export function subscribeSaveBus(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** saver가 등록된 카드 중 하나라도 dirty인가(저장바 노출 조건). */
export function hasSavableDirty(): boolean {
  for (const e of entries.values()) if (e.dirty && e.save) return true
  return false
}

export function isSaving(): boolean {
  return saving
}

/** dirty이고 saver가 있는 카드들을 순서대로 저장한다(각 카드의 기존 핸들러 호출). */
export async function saveAllDirty(): Promise<void> {
  if (saving) return
  saving = true
  notify()
  try {
    for (const [, e] of entries) {
      if (e.dirty && e.save) await e.save()
    }
  } finally {
    saving = false
    notify()
  }
}

/** 테스트/리셋용. */
export function resetDirtyRegistry(): void {
  entries.clear()
  saving = false
  setFormDirty(false)
  notify()
}
