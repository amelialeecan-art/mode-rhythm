/* =====================================================================
   MODE · V2 분석 · 다변량 선형회귀 (OLS, 순수 함수)
   정규방정식 (XtX)^-1 Xt y. 표본에 비해 predictor를 너무 많이 넣지 않도록
   안전장치를 강제하고, 특이/공선성/상수/결측을 명시적으로 처리한다.

   ⚠️ 계수는 "adjusted association"이지 인과가 아니다.
   ===================================================================== */
import { sd } from './descriptive'

export type RegressionFailReason =
  | 'insufficient-data' // n이 predictor 수에 비해 부족
  | 'singular' // XtX 특이(완전 공선성 등)
  | 'constant-or-collinear' // 상수 predictor 또는 결과
  | 'empty'

export interface RegressionOk {
  ok: true
  n: number // 사용된 관측 수(결측 제외 후)
  droppedRows: number // 결측으로 제외된 행 수
  k: number // predictor 수(절편 제외)
  /** [intercept, b1..bk] 원단위 계수. */
  coefficients: number[]
  /** predictor별 표준화 계수(비교용). 절편 없음. */
  standardizedCoefficients: number[]
  /** [intercept, b1..bk] 표준오차. */
  standardErrors: number[]
  /** [intercept, b1..bk] t 통계. */
  tStats: number[]
  r2: number
  residualSd: number
}
export type RegressionResult = RegressionOk | { ok: false; reason: RegressionFailReason; n?: number }

export interface RegressionOptions {
  /** predictor 1개당 최소 관측 수(절편 포함 파라미터 기준). 기본 5. */
  minObsPerPredictor?: number
}

const EPS = 1e-9

/** 정방행렬 역행렬(Gauss-Jordan, 부분피벗). 특이면 null. */
function invert(matrix: number[][]): number[][] | null {
  const p = matrix.length
  // 증강 [A | I]
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: p }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < p; col++) {
    // 부분 피벗
    let pivotRow = col
    let maxAbs = Math.abs(a[col][col])
    for (let r = col + 1; r < p; r++) {
      if (Math.abs(a[r][col]) > maxAbs) {
        maxAbs = Math.abs(a[r][col])
        pivotRow = r
      }
    }
    if (maxAbs < EPS) return null // 특이
    if (pivotRow !== col) {
      const tmp = a[col]
      a[col] = a[pivotRow]
      a[pivotRow] = tmp
    }
    const pivot = a[col][col]
    for (let j = 0; j < 2 * p; j++) a[col][j] /= pivot
    for (let r = 0; r < p; r++) {
      if (r === col) continue
      const factor = a[r][col]
      if (factor === 0) continue
      for (let j = 0; j < 2 * p; j++) a[r][j] -= factor * a[col][j]
    }
  }
  return a.map((row) => row.slice(p))
}

function isFiniteRow(row: number[], y: number): boolean {
  return Number.isFinite(y) && row.every((v) => Number.isFinite(v))
}

/**
 * y ~ 1 + X 다중회귀.
 * @param y 결과 벡터
 * @param X predictor 행렬(행=관측, 열=predictor). 절편은 내부에서 추가.
 * 결측(비유한) 행은 제외한다(listwise deletion, droppedRows로 보고).
 */
export function linearRegression(y: number[], X: number[][], opts: RegressionOptions = {}): RegressionResult {
  const minRatio = opts.minObsPerPredictor ?? 5
  const rawN = Math.min(y.length, X.length)
  if (rawN === 0) return { ok: false, reason: 'empty' }
  const k = X[0]?.length ?? 0

  // listwise deletion
  const rows: number[][] = []
  const ys: number[] = []
  for (let i = 0; i < rawN; i++) {
    if (isFiniteRow(X[i], y[i])) {
      rows.push(X[i])
      ys.push(y[i])
    }
  }
  const n = rows.length
  const droppedRows = rawN - n
  const p = k + 1 // 파라미터 수(절편 포함)

  if (n < p + 1 || n < p * minRatio) return { ok: false, reason: 'insufficient-data', n }

  // 결과/predictor 상수 검사
  if (sd(ys) === 0) return { ok: false, reason: 'constant-or-collinear', n }
  for (let j = 0; j < k; j++) {
    if (sd(rows.map((r) => r[j])) === 0) return { ok: false, reason: 'constant-or-collinear', n }
  }

  // 설계행렬(절편 추가)
  const design = rows.map((r) => [1, ...r])

  // XtX, Xty
  const xtx: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0))
  const xty: number[] = new Array<number>(p).fill(0)
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      xty[a] += design[i][a] * ys[i]
      for (let b = 0; b < p; b++) xtx[a][b] += design[i][a] * design[i][b]
    }
  }

  const inv = invert(xtx)
  if (!inv) return { ok: false, reason: 'singular', n }

  const coefficients = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0))

  // 잔차/적합도
  const yhat = design.map((row) => row.reduce((s, v, j) => s + v * coefficients[j], 0))
  const ybar = ys.reduce((s, v) => s + v, 0) / n
  let rss = 0
  let tss = 0
  for (let i = 0; i < n; i++) {
    rss += (ys[i] - yhat[i]) ** 2
    tss += (ys[i] - ybar) ** 2
  }
  const dof = n - p
  const sigma2 = dof > 0 ? rss / dof : NaN
  const residualSd = Math.sqrt(sigma2)
  const r2 = tss > 0 ? 1 - rss / tss : NaN

  const standardErrors = inv.map((row, j) => Math.sqrt(Math.max(0, sigma2 * row[j])))
  const tStats = coefficients.map((c, j) => (standardErrors[j] > 0 ? c / standardErrors[j] : NaN))

  const sdY = sd(ys)
  const standardizedCoefficients: number[] = []
  for (let j = 0; j < k; j++) {
    const sdX = sd(rows.map((r) => r[j]))
    standardizedCoefficients.push(sdY > 0 ? (coefficients[j + 1] * sdX) / sdY : NaN)
  }

  return { ok: true, n, droppedRows, k, coefficients, standardizedCoefficients, standardErrors, tStats, r2, residualSd }
}
