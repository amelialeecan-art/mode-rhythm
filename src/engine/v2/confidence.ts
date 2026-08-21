/* =====================================================================
   MODE · V2 분석 · 신뢰도 규칙 (순수, 문서화)
   ⚠️ confidence는 단순 p-value 변환이 아니다.
   sample size · coverage · effect magnitude · repetition · uncertainty ·
   FDR · adjusted 결과 가용성을 함께 본다.

   내부 규칙(고정 임계):
   - MIN_N: 이보다 관측이 적으면 무조건 'insufficient'.
   - 'exploratory': 기본(탐색). 방향/크기 언급은 가능하나 결론 아님.
   - 'tentative': 효과 크기 small↑ + (CI가 0 제외 or 방향 일치 0.6↑).
   - 'moderate': tentative + 불확실성 가용 + CI 0 제외 + adjusted 결과 존재 + 반복 0.6↑.
   - 'strong': moderate + FDR 통과 + 반복 0.75↑ + 효과 크기 medium↑.
   어느 단계도 p-value만으로 올라갈 수 없다.
   ===================================================================== */

export type V2Confidence = 'insufficient' | 'exploratory' | 'tentative' | 'moderate' | 'strong'

export const V2_CONFIDENCE_RULES = {
  MIN_N: 12,
  MIN_COVERAGE: 0.3,
  SMALL_EFFECT: 0.2,
  MEDIUM_EFFECT: 0.5,
  REPEAT_MODERATE: 0.6,
  REPEAT_STRONG: 0.75,
} as const

export interface V2ConfidenceInput {
  n: number
  coverageRate?: number
  /** 표준화 효과 크기(절댓값). */
  effectMagnitude: number
  /** 방향 일치 비율 0..1 (여러 블록/주기/에피소드에서 같은 방향). */
  directionConsistency?: number
  uncertaintyAvailable: boolean
  ciExcludesZero?: boolean
  fdrPassed?: boolean
  adjustedAvailable: boolean
}

export interface V2ConfidenceResult {
  level: V2Confidence
  reasons: string[]
}

export function scoreV2Confidence(input: V2ConfidenceInput): V2ConfidenceResult {
  const R = V2_CONFIDENCE_RULES
  const reasons: string[] = []
  const mag = Math.abs(input.effectMagnitude)
  const rep = input.directionConsistency ?? 0
  const coverage = input.coverageRate ?? 1

  if (input.n < R.MIN_N || coverage < R.MIN_COVERAGE) {
    reasons.push(`표본/커버리지 부족(n=${input.n}, coverage=${Math.round(coverage * 100)}%)`)
    return { level: 'insufficient', reasons }
  }

  let level: V2Confidence = 'exploratory'
  reasons.push('탐색 수준(association)')

  const tentativeOk = mag >= R.SMALL_EFFECT && (input.ciExcludesZero === true || rep >= R.REPEAT_MODERATE)
  if (tentativeOk) {
    level = 'tentative'
    reasons.push('효과 크기 small↑ + (CI 0 제외 또는 방향 일치)')
  }

  const moderateOk =
    tentativeOk &&
    input.uncertaintyAvailable &&
    input.ciExcludesZero === true &&
    input.adjustedAvailable &&
    rep >= R.REPEAT_MODERATE
  if (moderateOk) {
    level = 'moderate'
    reasons.push('불확실성 가용 + CI 0 제외 + 보정 결과 존재 + 반복 0.6↑')
  }

  const strongOk = moderateOk && input.fdrPassed === true && rep >= R.REPEAT_STRONG && mag >= R.MEDIUM_EFFECT
  if (strongOk) {
    level = 'strong'
    reasons.push('FDR 통과 + 반복 0.75↑ + 효과 크기 medium↑')
  }

  return { level, reasons }
}
