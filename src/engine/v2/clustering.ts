/* =====================================================================
   MODE · V2 분석 · 상태 군집 (순수 k-means + 안정성 gate)
   ⚠️ 90일 됐다는 이유만으로 "당신은 N가지 타입"을 만들지 않는다.
   - gate: usable days / per-metric coverage / variance / missingness / stability.
   - cluster 수를 미리 고정하지 않고 silhouette로 고른다.
   - 안정성이 낮으면 사용자에게 노출하지 않는다(available:false).
   - 표시명은 centroid에서 유도한 descriptive label이며 진단명이 아니다.
   무거운 ML 라이브러리 없이 작은 pure TS로 구현한다(bundle 증가 없음).
   ===================================================================== */
import { mean, sd } from './descriptive'

export interface ClusterDay {
  date: string
  values: Record<string, number | 'unknown' | null | undefined>
}

export interface ClusterGateConfig {
  minDays?: number // 최소 usable days (기본 60)
  minCoverage?: number // metric별 최소 coverage (기본 0.5)
  minVariance?: number // metric별 최소 표준편차 (기본 0.5)
  minMetrics?: number // 최소 사용 metric 수 (기본 3)
  kRange?: number[] // 시도할 k (기본 [2,3,4])
  minSilhouette?: number // 기본 0.25
  minStability?: number // 기본 0.8
  seeds?: number[] // 안정성용 초기화 seed (기본 6개)
}

export interface ClusterProfile {
  label: string // descriptive (진단명 아님)
  size: number
  share: number // 0..1
  /** metric → centroid z값(표준화 기준). */
  centroidZ: Record<string, number>
}

export interface ClusterResult {
  available: boolean
  reason?: 'insufficient-days' | 'too-few-metrics' | 'low-variance' | 'unstable' | 'low-silhouette'
  usableDays: number
  usedMetrics: string[]
  k?: number
  silhouette?: number
  stability?: number
  clusters?: ClusterProfile[]
}

/* ---------------------------------------------------------------------
   descriptive labeling (진단명 아님) — centroid의 높은 도메인으로 명명
   --------------------------------------------------------------------- */
const DEFAULT_DOMAINS: { key: string; label: string; metrics: string[]; lowIsHigh?: boolean }[] = [
  { key: 'emotion', label: '감정 부하가 높은 날', metrics: ['moodLow', 'anxiety', 'irritability'] },
  { key: 'appetite', label: '식욕 관련 신호가 높은 날', metrics: ['physicalHunger', 'craving', 'bingeUrge'] },
  { key: 'body', label: '몸 불편이 큰 날', metrics: ['fatigueHeaviness', 'bloating', 'painDiscomfort'] },
  { key: 'lowEnergy', label: '에너지가 낮은 날', metrics: ['energy'], lowIsHigh: true },
]

function describeCentroid(centroidZ: Record<string, number>): string {
  let bestLabel = '대체로 평이한 날'
  let bestScore = 0.4 // 이보다 두드러져야 이름을 붙인다
  for (const d of DEFAULT_DOMAINS) {
    const zs = d.metrics.map((m) => centroidZ[m]).filter((v): v is number => typeof v === 'number')
    if (zs.length === 0) continue
    const score = (d.lowIsHigh ? -1 : 1) * mean(zs)
    if (score > bestScore) {
      bestScore = score
      bestLabel = d.label
    }
  }
  return bestLabel
}

/* ---------------------------------------------------------------------
   pure k-means (결정적) + silhouette + init 안정성
   --------------------------------------------------------------------- */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}

function dist2(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return s
}

interface KMeans {
  assignments: number[]
  centroids: number[][]
  inertia: number
}

function kmeansOnce(data: number[][], k: number, seed: number): KMeans {
  const n = data.length
  const rand = rng(seed)
  // k-means++ 초기화
  const centroids: number[][] = []
  centroids.push([...data[Math.floor(rand() * n)]])
  while (centroids.length < k) {
    const d2 = data.map((p) => Math.min(...centroids.map((c) => dist2(p, c))))
    const sum = d2.reduce((s, v) => s + v, 0)
    let target = rand() * (sum || 1)
    let idx = 0
    for (; idx < n; idx++) {
      target -= d2[idx]
      if (target <= 0) break
    }
    centroids.push([...data[Math.min(idx, n - 1)]])
  }
  const assignments = new Array<number>(n).fill(0)
  for (let iter = 0; iter < 50; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < k; c++) {
        const dd = dist2(data[i], centroids[c])
        if (dd < bestD) {
          bestD = dd
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }
    // update
    const dim = data[0].length
    const sums = Array.from({ length: k }, () => new Array<number>(dim).fill(0))
    const counts = new Array<number>(k).fill(0)
    for (let i = 0; i < n; i++) {
      counts[assignments[i]]++
      for (let j = 0; j < dim; j++) sums[assignments[i]][j] += data[i][j]
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue // 빈 클러스터는 그대로 둠
      for (let j = 0; j < dim; j++) centroids[c][j] = sums[c][j] / counts[c]
    }
    if (!changed) break
  }
  let inertia = 0
  for (let i = 0; i < n; i++) inertia += dist2(data[i], centroids[assignments[i]])
  return { assignments, centroids, inertia }
}

function kmeansBest(data: number[][], k: number, seeds: number[]): KMeans {
  let best: KMeans | null = null
  for (const s of seeds) {
    const r = kmeansOnce(data, k, s)
    if (!best || r.inertia < best.inertia) best = r
  }
  return best!
}

/** 평균 silhouette. cluster 크기 1 이하가 있으면 -1(부적합). */
export function silhouetteScore(data: number[][], assignments: number[], k: number): number {
  const n = data.length
  const members: number[][] = Array.from({ length: k }, () => [])
  for (let i = 0; i < n; i++) members[assignments[i]].push(i)
  if (members.some((m) => m.length === 0)) return -1
  let total = 0
  for (let i = 0; i < n; i++) {
    const own = assignments[i]
    const a = members[own].length > 1 ? avgDist(data, i, members[own]) : 0
    let b = Infinity
    for (let c = 0; c < k; c++) {
      if (c === own) continue
      b = Math.min(b, avgDist(data, i, members[c]))
    }
    const s = members[own].length > 1 ? (b - a) / Math.max(a, b) : 0
    total += s
  }
  return total / n
}
function avgDist(data: number[][], i: number, group: number[]): number {
  let s = 0
  let c = 0
  for (const j of group) {
    if (j === i) continue
    s += Math.sqrt(dist2(data[i], data[j]))
    c++
  }
  return c === 0 ? 0 : s / c
}

/** 두 assignment의 pair co-membership 일치율(0..1). */
function coMembershipAgreement(a: number[], b: number[]): number {
  const n = a.length
  if (n < 2) return 1
  let agree = 0
  let total = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      total++
      if ((a[i] === a[j]) === (b[i] === b[j])) agree++
    }
  }
  return total === 0 ? 1 : agree / total
}

/** 여러 seed 해의 평균 pairwise co-membership 일치(초기화 안정성). */
function initStability(data: number[][], k: number, seeds: number[]): number {
  const solutions = seeds.map((s) => kmeansOnce(data, k, s).assignments)
  let sum = 0
  let pairs = 0
  for (let i = 0; i < solutions.length; i++) {
    for (let j = i + 1; j < solutions.length; j++) {
      sum += coMembershipAgreement(solutions[i], solutions[j])
      pairs++
    }
  }
  return pairs === 0 ? 1 : sum / pairs
}

/* ---------------------------------------------------------------------
   메인: gate → 표준화 → k 선택 → 안정성 → labeling
   --------------------------------------------------------------------- */
export function clusterDays(days: ClusterDay[], candidateMetrics: string[], cfg: ClusterGateConfig = {}): ClusterResult {
  const minDays = cfg.minDays ?? 60
  const minCoverage = cfg.minCoverage ?? 0.5
  const minVar = cfg.minVariance ?? 0.5
  const minMetrics = cfg.minMetrics ?? 3
  const kRange = cfg.kRange ?? [2, 3, 4]
  const minSil = cfg.minSilhouette ?? 0.25
  const minStab = cfg.minStability ?? 0.8
  const seeds = cfg.seeds ?? [1, 7, 13, 29, 101, 257]

  const totalDays = days.length

  // metric별 coverage/variance로 사용할 metric 선택(고차원 전량 투입 금지)
  const usedMetrics: string[] = []
  for (const m of candidateMetrics) {
    const vals = days.map((d) => d.values[m]).filter((v): v is number => typeof v === 'number')
    const coverage = totalDays > 0 ? vals.length / totalDays : 0
    if (coverage >= minCoverage && sd(vals) >= minVar) usedMetrics.push(m)
  }
  if (usedMetrics.length < minMetrics) {
    return { available: false, reason: usedMetrics.length === 0 ? 'low-variance' : 'too-few-metrics', usableDays: 0, usedMetrics }
  }

  // 선택 metric이 모두 있는 완전한 날만(listwise). 표준화.
  const completeRows: number[][] = []
  for (const d of days) {
    const row: number[] = []
    let ok = true
    for (const m of usedMetrics) {
      const v = d.values[m]
      if (typeof v !== 'number') {
        ok = false
        break
      }
      row.push(v)
    }
    if (ok) completeRows.push(row)
  }
  const usableDays = completeRows.length
  if (usableDays < minDays) {
    return { available: false, reason: 'insufficient-days', usableDays, usedMetrics }
  }

  // 열 표준화(z)
  const dim = usedMetrics.length
  const colMean: number[] = []
  const colSd: number[] = []
  for (let j = 0; j < dim; j++) {
    const col = completeRows.map((r) => r[j])
    colMean.push(mean(col))
    colSd.push(sd(col) || 1)
  }
  const data = completeRows.map((r) => r.map((v, j) => (v - colMean[j]) / colSd[j]))

  // k 선택: silhouette 최대
  let bestK = kRange[0]
  let bestSil = -Infinity
  let bestSol: KMeans | null = null
  for (const k of kRange) {
    if (k >= usableDays) continue
    const sol = kmeansBest(data, k, seeds)
    const sil = silhouetteScore(data, sol.assignments, k)
    if (sil > bestSil) {
      bestSil = sil
      bestK = k
      bestSol = sol
    }
  }
  if (!bestSol) return { available: false, reason: 'insufficient-days', usableDays, usedMetrics }

  if (bestSil < minSil) {
    return { available: false, reason: 'low-silhouette', usableDays, usedMetrics, k: bestK, silhouette: bestSil }
  }

  const stability = initStability(data, bestK, seeds)
  if (stability < minStab) {
    return { available: false, reason: 'unstable', usableDays, usedMetrics, k: bestK, silhouette: bestSil, stability }
  }

  // centroid를 원단위→z로(이미 data가 z이므로 centroid가 곧 z). metric명 매핑.
  const sizes = new Array<number>(bestK).fill(0)
  for (const a of bestSol.assignments) sizes[a]++
  const clusters: ClusterProfile[] = bestSol.centroids.map((c, ci) => {
    const centroidZ: Record<string, number> = {}
    usedMetrics.forEach((m, j) => (centroidZ[m] = c[j]))
    return { label: describeCentroid(centroidZ), size: sizes[ci], share: sizes[ci] / usableDays, centroidZ }
  })

  return { available: true, usableDays, usedMetrics, k: bestK, silhouette: bestSil, stability, clusters }
}
