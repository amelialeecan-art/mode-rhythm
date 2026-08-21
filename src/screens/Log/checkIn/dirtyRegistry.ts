/* =====================================================================
   MODE · 다중 편집기 dirty 집계 (순수 · 모듈 상태)
   여러 체크인 카드가 동시에 열려 있어도 "하나라도 미저장이면 dirty"가 되도록
   키별 dirty를 OR로 모아 전역 setFormDirty에 반영한다.
   (독립 카드들이 setFormDirty(false)로 서로를 덮어쓰는 문제를 방지)
   ===================================================================== */
import { setFormDirty } from '../../../lib/pwaUpdate'

const dirtyKeys = new Set<string>()

/** key의 dirty 상태를 갱신하고 전역 dirty를 재계산한다. */
export function reportDirty(key: string, dirty: boolean): void {
  if (dirty) dirtyKeys.add(key)
  else dirtyKeys.delete(key)
  setFormDirty(dirtyKeys.size > 0)
}

/** key 등록 해제(언마운트 시). */
export function clearDirty(key: string): void {
  dirtyKeys.delete(key)
  setFormDirty(dirtyKeys.size > 0)
}

/** 테스트/리셋용. */
export function resetDirtyRegistry(): void {
  dirtyKeys.clear()
  setFormDirty(false)
}
