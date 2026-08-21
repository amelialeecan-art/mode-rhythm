/* =====================================================================
   MODE · 자동 vs 수동 충돌 해석 (canonical 선택, 순수)
   ⚠️ 원자료를 몰래 overwrite하지 않는다 — 양쪽 원본을 모두 보존한다.
   같은 슬롯에 여러 source의 값이 있을 때 "표시/분석에 쓸" canonical만 규칙으로 고른다.

   규칙(우선순위): manual > healthkit > import > derived > legacy.
   - 사용자의 명시적 수정(manual)이 자동수집(healthkit)보다 우선한다.
   - 동일 source가 여럿이면 최신 updatedAt/기록시각을 canonical로.
   ===================================================================== */
import type { DataSource } from '../modelsV2'

export const SOURCE_PRIORITY: DataSource[] = ['manual', 'healthkit', 'import', 'derived', 'legacy']

function priorityIndex(source: DataSource): number {
  const i = SOURCE_PRIORITY.indexOf(source)
  return i === -1 ? SOURCE_PRIORITY.length : i
}

export interface SourceCandidate<T> {
  source: DataSource
  /** 정렬 tie-break용 시각(ISO). 없으면 무시. */
  at?: string
  value: T
}

export interface ResolvedValue<T> {
  chosen: SourceCandidate<T>
  chosenSource: DataSource
  /** 원본 후보 전부(보존 — 어느 것도 삭제하지 않는다). */
  all: SourceCandidate<T>[]
}

/**
 * 여러 source 후보 중 canonical 하나를 규칙으로 고른다(원본은 모두 반환).
 * 우선순위가 높은 source 우선, 동률이면 더 최신(at) 값.
 */
export function resolveBySourcePriority<T>(candidates: SourceCandidate<T>[]): ResolvedValue<T> | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const p = priorityIndex(a.source) - priorityIndex(b.source)
    if (p !== 0) return p
    const ta = a.at ? Date.parse(a.at) : 0
    const tb = b.at ? Date.parse(b.at) : 0
    return tb - ta // 최신 우선
  })
  return { chosen: sorted[0], chosenSource: sorted[0].source, all: candidates }
}
