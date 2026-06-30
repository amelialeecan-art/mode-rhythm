/* =====================================================================
   MODE · 온보딩 완료 상태 (localStorage, 가볍게)
   나중에 userSettings로 확장 가능.
   ===================================================================== */
const KEY = 'mode.onboardingCompleted'

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

export function setOnboardingCompleted(): void {
  try {
    localStorage.setItem(KEY, 'true')
  } catch {
    /* localStorage 불가 환경에서는 무시 */
  }
}

export function clearOnboarding(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
