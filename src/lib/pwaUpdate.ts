/* =====================================================================
   MODE · PWA 업데이트 흐름 (1단계: 기존 설치본 업데이트 안정화)
   - registerType 'prompt' + virtual:pwa-register 명시 연결
   - 새 버전 감지(onNeedRefresh) → 전역 배너 → 사용자가 "지금 업데이트"
   - 백그라운드 복귀(visibilitychange/focus) 시 registration.update() (스로틀)

   ⚠️ 이 모듈은 서비스워커/앱 셸만 다룬다. IndexedDB(개인 기록)는 절대
   건드리지 않는다 — resetDatabase/clear/deleteDatabase 호출 금지(테스트로 강제).
   ===================================================================== */

type UpdateListener = (available: boolean) => void

let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null
let updateAvailable = false
let initialized = false
let lastCheckAt = 0
let formBusy = false
let formDirty = false

const listeners = new Set<UpdateListener>()

/** 백그라운드 복귀 시 업데이트 확인 최소 간격 (과도한 반복 호출 방지). */
export const MIN_CHECK_INTERVAL_MS = 60_000

/** 스로틀 판정 (순수 함수 — 테스트용으로 분리). */
export function shouldCheckForUpdate(now: number, lastAt: number, minMs: number = MIN_CHECK_INTERVAL_MS): boolean {
  return now - lastAt >= minMs
}

/** Log 저장 중 플래그 — 저장 도중 reload로 기록이 끊기지 않게 업데이트를 보류. */
export function setFormBusy(busy: boolean): void {
  formBusy = busy
}
export function isFormBusy(): boolean {
  return formBusy
}

/** 저장하지 않은 Log 입력 플래그 — 아직 저장 안 한 입력이 reload로 유실되지 않게 업데이트를 보류. */
export function setFormDirty(dirty: boolean): void {
  formDirty = dirty
}
export function isFormDirty(): boolean {
  return formDirty
}

/** 새 버전 감지 상태 구독. 등록 즉시 현재 상태로 1회 호출. */
export function subscribeUpdateAvailable(cb: UpdateListener): () => void {
  listeners.add(cb)
  cb(updateAvailable)
  return () => listeners.delete(cb)
}

function notify(): void {
  for (const cb of listeners) cb(updateAvailable)
}

async function swRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration()
}

/** 스로틀 적용된 registration.update(). */
async function throttledCheck(): Promise<void> {
  const now = Date.now()
  if (!shouldCheckForUpdate(now, lastCheckAt)) return
  lastCheckAt = now
  const reg = await swRegistration()
  await reg?.update().catch(() => {})
}

/**
 * 앱 시작 시 1회 호출. SW 등록 + 감지 콜백 + 복귀 시 확인 리스너.
 * dev(SW 미등록)나 미지원 브라우저에서는 조용히 no-op.
 */
export async function initPwaUpdate(): Promise<void> {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  try {
    const { registerSW } = await import('virtual:pwa-register')
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateAvailable = true
        notify()
      },
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void throttledCheck()
    })
    window.addEventListener('focus', () => void throttledCheck())
  } catch {
    // virtual 모듈 미존재(테스트 등) — 업데이트 기능 없이 동작
  }
}

export type UpdateCheckResult = 'update-available' | 'up-to-date' | 'unsupported'

/** Settings "업데이트 확인" 버튼용 — 스로틀 없이 즉시 확인. */
export async function checkForUpdateNow(): Promise<UpdateCheckResult> {
  if (updateAvailable) return 'update-available'
  const reg = await swRegistration()
  if (!reg) return 'unsupported'
  try {
    await reg.update()
    // onNeedRefresh 콜백이 반영될 시간을 잠깐 준다
    await new Promise((r) => setTimeout(r, 1500))
    return updateAvailable ? 'update-available' : 'up-to-date'
  } catch {
    return 'unsupported'
  }
}

export type ApplyUpdateResult = 'applied' | 'saving' | 'unsaved' | 'noop'

/**
 * "지금 업데이트": 저장 중이거나 저장하지 않은 입력이 있으면 보류, 아니면 새 SW 활성화 + reload.
 * 기록(IndexedDB)은 그대로 유지된다 — 앱 셸만 교체.
 * - saving: 저장이 진행 중이라 보류 (저장 끝난 뒤 다시 시도)
 * - unsaved: 저장하지 않은 입력이 있어 보류 (먼저 저장한 뒤 업데이트)
 * - noop: SW 미등록(테스트/미지원) — 아무것도 하지 않음
 */
export async function applyUpdate(): Promise<ApplyUpdateResult> {
  if (isFormBusy()) return 'saving'
  if (isFormDirty()) return 'unsaved'
  if (!updateSWFn) return 'noop'
  await updateSWFn(true)
  return 'applied'
}
