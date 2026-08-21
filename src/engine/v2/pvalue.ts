/* =====================================================================
   MODE · V2 분석 · p-value (Student-t 양측) — 순수, 결정적
   정규근사 대신 정규화 불완전베타로 t 분포 CDF를 계산한다.
   ⚠️ p-value는 후보 선정의 유일 근거가 아니다(신뢰도는 별도 규칙).
   ===================================================================== */

/** ln Γ(x) (Lanczos 근사). */
function lgamma(x: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  x -= 1
  let a = c[0]
  const t = x + g + 0.5
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** 정규화 불완전베타 I_x(a,b) (Lentz 연분수, Numerical Recipes). */
function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta) / a
  // 연분수 (Lentz)
  const tiny = 1e-30
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  // 대칭식으로 수렴 개선
  if (x < (a + 1) / (a + b + 2)) return front * h
  const lbetaSym = lgamma(a + b) - lgamma(a) - lgamma(b)
  const frontSym = Math.exp(Math.log(1 - x) * b + Math.log(x) * a + lbetaSym) / b
  return 1 - frontSym * betaCF(b, a, 1 - x)
}

function betaCF(a: number, b: number, x: number): number {
  const tiny = 1e-30
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return h
}

/** 양측 t-검정 p-value. df<=0 또는 비유한 t면 1(가장 보수적) 반환. */
export function tPValueTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1
  const x = df / (df + t * t)
  const p = betai(df / 2, 0.5, x) // = 2 * P(T > |t|)
  return Math.min(1, Math.max(0, p))
}
