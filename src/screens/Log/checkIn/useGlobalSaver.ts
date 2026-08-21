/* =====================================================================
   MODE · 전역 저장바에 편집 영역을 연결하는 훅
   dirty 보고 + canonical save 등록(라벨/순서)을 한 번에 처리한다.
   save는 성공 true / 실패 false(또는 throw)를 반환한다.
   ===================================================================== */
import { useEffect, useRef } from 'react'
import { reportDirty, registerSaver, unregisterSaver, clearDirty, type SaveOutcome } from './dirtyRegistry'

export function useGlobalSaver(
  key: string,
  dirty: boolean,
  save: () => Promise<SaveOutcome> | SaveOutcome,
  opts: { label: string; order: number },
): void {
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    reportDirty(key, dirty)
  }, [key, dirty])

  useEffect(() => {
    registerSaver(key, () => saveRef.current(), opts.label, opts.order)
    return () => {
      unregisterSaver(key)
      clearDirty(key)
    }
  }, [key, opts.label, opts.order])
}
