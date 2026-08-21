/* =====================================================================
   MODE · 미저장 draft 이탈 보호 (native confirm — 새 UI 프레임워크 없음)
   사용자가 명시적으로 "그냥 이동"을 고르지 않는 한 미저장 기록을 조용히 버리지 않는다.
   reload/close/PWA는 App의 beforeunload가, 탭/날짜 in-app 이동은 이 함수가 막는다.
   ===================================================================== */
import { isFormDirty } from './pwaUpdate'

/**
 * 미저장 기록이 있으면 확인창을 띄운다. true=이동 진행(discard 동의), false=머무름.
 * 미저장이 없으면 항상 true.
 */
export function confirmLeaveIfDirty(): boolean {
  if (!isFormDirty()) return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm('아직 저장하지 않은 기록이 있어. 저장하지 않고 이동할까?')
}
