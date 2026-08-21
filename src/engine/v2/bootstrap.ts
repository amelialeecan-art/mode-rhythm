/* =====================================================================
   MODE · V2 분석 · 이동블록 부트스트랩 (시계열 친화 불확실성, 순수·결정적)
   시간적으로 연속된 데이터를 독립 표본처럼 다루면 CI가 지나치게 좁아진다.
   블록을 통째로 리샘플링해 자기상관을 어느 정도 보존한다.
   불안정하면 가짜 정밀도 대신 available:false('uncertainty unavailable')를 낸다.
   ===================================================================== */
import { quantile } from './descriptive'

export type BootstrapCI =
  | { available: true; estimate: number; lo: number; hi: number; iterations: number; blockLength: number }
  | { available: false; reason: 'insufficient-data' | 'unstable' }

export interface BootstrapOptions {
  iterations?: number // 기본 1000
  blockLength?: number // 기본 round(n^(1/3)), 최소 2
  seed?: number // 결정적 재현 (기본 12345)
  ci?: number // 신뢰수준 (기본 0.95)
  minN?: number // 최소 관측 (기본 8)
}

/** 결정적 난수(mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * n개 관측에 대한 statistic(indices)의 이동블록 부트스트랩 CI.
 * statistic은 리샘플된 행 인덱스 배열을 받아 스칼라를 돌려준다(호출부가 배열을 클로저로 캡처).
 */
export function movingBlockBootstrapCI(
  n: number,
  statistic: (indices: number[]) => number,
  opts: BootstrapOptions = {},
): BootstrapCI {
  const minN = opts.minN ?? 8
  if (n < minN) return { available: false, reason: 'insufficient-data' }

  const iterations = opts.iterations ?? 1000
  const L = Math.max(2, Math.min(n, opts.blockLength ?? Math.max(2, Math.round(Math.cbrt(n)))))
  const ci = opts.ci ?? 0.95
  const rand = rng(opts.seed ?? 12345)

  const estimate = statistic(Array.from({ length: n }, (_, i) => i))
  if (!Number.isFinite(estimate)) return { available: false, reason: 'unstable' }

  const numBlocks = Math.ceil(n / L)
  const maxStart = n - L // [0, maxStart]
  const stats: number[] = []
  for (let b = 0; b < iterations; b++) {
    const idx: number[] = []
    for (let k = 0; k < numBlocks; k++) {
      const start = Math.floor(rand() * (maxStart + 1))
      for (let j = 0; j < L && idx.length < n; j++) idx.push(start + j)
    }
    const s = statistic(idx)
    if (Number.isFinite(s)) stats.push(s)
  }
  // 유효 표본이 너무 적으면 불안정으로 처리(가짜 정밀도 회피).
  if (stats.length < iterations * 0.5) return { available: false, reason: 'unstable' }

  const loQ = (1 - ci) / 2
  const hiQ = 1 - loQ
  return {
    available: true,
    estimate,
    lo: quantile(stats, loQ),
    hi: quantile(stats, hiQ),
    iterations: stats.length,
    blockLength: L,
  }
}
