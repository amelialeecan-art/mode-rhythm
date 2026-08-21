/* =====================================================================
   MODE · V2 분석 · 기초 통계 (순수 함수 — React/Dexie import 금지)
   관찰 데이터 표현: 인과가 아니라 association/temporal association/pattern.
   입력 배열은 결측(null/unknown) 제외된 numeric[]을 전제한다(호출부 책임).
   ===================================================================== */

export function count(xs: number[]): number {
  return xs.length
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

/** 표본분산(n-1). n<2면 NaN. */
export function variance(xs: number[]): number {
  const n = xs.length
  if (n < 2) return NaN
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)
}

/** 표본 표준편차(n-1). */
export function sd(xs: number[]): number {
  const v = variance(xs)
  return Number.isNaN(v) ? NaN : Math.sqrt(v)
}

export function median(xs: number[]): number {
  return quantile(xs, 0.5)
}

/** 선형보간 분위수(numpy type 7). q∈[0,1]. */
export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN
  if (xs.length === 1) return xs[0]
  const sorted = [...xs].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  const frac = pos - lo
  return sorted[lo] * (1 - frac) + sorted[hi] * frac
}

export function minOf(xs: number[]): number {
  return xs.length ? Math.min(...xs) : NaN
}
export function maxOf(xs: number[]): number {
  return xs.length ? Math.max(...xs) : NaN
}

/** 사분위 범위 (Q3-Q1). */
export function iqr(xs: number[]): number {
  return quantile(xs, 0.75) - quantile(xs, 0.25)
}

/**
 * within-person 표준화(z-score). 개인 내부 분포 기준.
 * sd=0(상수)면 모두 0을 반환(0으로 나누지 않는다).
 */
export function standardizeWithinPerson(xs: number[]): number[] {
  const m = mean(xs)
  const s = sd(xs)
  if (!Number.isFinite(s) || s === 0) return xs.map(() => 0)
  return xs.map((x) => (x - m) / s)
}

/** 평균 순위(동점은 평균 rank). 1-based. */
export function averageRanks(xs: number[]): number[] {
  const n = xs.length
  const idx = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const ranks = new Array<number>(n)
  let k = 0
  while (k < n) {
    let j = k
    while (j + 1 < n && idx[j + 1].x === idx[k].x) j++
    const avg = (k + j + 2) / 2 // 평균 rank (1-based): ((k+1)+(j+1))/2
    for (let t = k; t <= j; t++) ranks[idx[t].i] = avg
    k = j + 1
  }
  return ranks
}

/** Pearson 상관. n<3 또는 분산 0이면 null. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  if (dx2 === 0 || dy2 === 0) return null
  return num / Math.sqrt(dx2 * dy2)
}

/**
 * Spearman 순위상관 (탐색 분석용).
 * ⚠️ 이 값은 탐색(exploratory)일 뿐 인과가 아니다.
 * n<3 또는 상수면 null.
 */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  return pearson(averageRanks(xs.slice(0, n)), averageRanks(ys.slice(0, n)))
}

/** 평균차(a - b). paired 전제. */
export function meanDifference(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return NaN
  let s = 0
  for (let i = 0; i < n; i++) s += a[i] - b[i]
  return s / n
}

/**
 * Cohen's d (표준화 효과크기). paired면 diff의 sd로, unpaired면 pooled sd로.
 * sd=0이면 0(방향 없음)로 본다(가짜 무한대 방지).
 */
export function cohensDPaired(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return NaN
  const diffs = a.slice(0, n).map((v, i) => v - b[i])
  const s = sd(diffs)
  if (!Number.isFinite(s) || s === 0) return 0
  return mean(diffs) / s
}
