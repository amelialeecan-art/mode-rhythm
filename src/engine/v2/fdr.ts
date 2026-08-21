/* =====================================================================
   MODE · V2 분석 · 다중비교 보정 (Benjamini-Hochberg FDR, 순수)
   여러 후보를 동시에 검사할 때 raw p와 adjusted q를 구분한다.
   p-value만으로 insight를 선정하지 않는다(신뢰도 규칙과 함께 사용).
   ===================================================================== */

export interface FdrResult {
  /** 입력 순서 그대로의 raw p. */
  rawP: number[]
  /** 입력 순서 그대로의 BH adjusted q. */
  q: number[]
  /** q <= alpha 인지(입력 순서). */
  rejected: boolean[]
  alpha: number
}

/**
 * Benjamini-Hochberg step-up. m개 p-value → adjusted q(단조 보정).
 * q_(i) = min_{j>=i} ( m * p_(j) / j ), 1로 clamp.
 */
export function benjaminiHochberg(pvals: number[], alpha = 0.1): FdrResult {
  const m = pvals.length
  if (m === 0) return { rawP: [], q: [], rejected: [], alpha }

  const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p)
  const qSorted = new Array<number>(m)
  let prev = 1
  for (let rank = m; rank >= 1; rank--) {
    const { p } = order[rank - 1]
    const val = Math.min(prev, (p * m) / rank)
    qSorted[rank - 1] = val
    prev = val
  }
  const q = new Array<number>(m)
  const rejected = new Array<boolean>(m)
  for (let rank = 1; rank <= m; rank++) {
    const origIdx = order[rank - 1].i
    q[origIdx] = Math.min(1, qSorted[rank - 1])
    rejected[origIdx] = q[origIdx] <= alpha
  }
  return { rawP: [...pvals], q, rejected, alpha }
}
