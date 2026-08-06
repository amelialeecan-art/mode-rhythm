/* =====================================================================
   MODE · snapshot 안전 로더 (화면 공용 · 순수 유틸)
   화면 진입 시 비동기 snapshot을 1회 불러와 소비만 한다. 전역 캐시·상태관리 없음.
   - 최신 요청만 반영(오래된 응답이 최신 결과를 덮지 않는다).
   - dispose 후에는 apply/onError를 부르지 않는다(unmount 후 state update 방지).
   - 실패 시 apply를 부르지 않는다(빈 결과로 덮어쓰지 않음, 기존 화면 유지).
   Today·Rhythm 등 여러 화면이 동일 패턴으로 재사용한다.
   ===================================================================== */
export interface SnapshotFlowLoader {
  /** snapshot을 한 번 불러와 apply한다(진입·새로고침 때 호출). */
  load: () => Promise<void>
  /** unmount 시 호출 — 이후 응답은 apply하지 않는다. */
  dispose: () => void
}

export function createSnapshotFlowLoader<T>(
  fetchSnapshot: () => Promise<T>,
  apply: (snapshot: T) => void,
  onError?: (err: unknown) => void,
): SnapshotFlowLoader {
  let latest = 0
  let disposed = false
  return {
    async load() {
      const reqId = ++latest
      try {
        const snapshot = await fetchSnapshot()
        if (disposed || reqId !== latest) return // 오래됐거나 unmount됨
        apply(snapshot)
      } catch (err) {
        if (disposed || reqId !== latest) return
        onError?.(err) // 상태 그대로 유지(빈 결과로 덮지 않음)
      }
    },
    dispose() {
      disposed = true
    },
  }
}
