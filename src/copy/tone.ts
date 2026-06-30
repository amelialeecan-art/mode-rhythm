/* =====================================================================
   MODE · 문구 톤 헬퍼 (단정 금지 규칙의 1차 방어선)
   Phase 1: 표현 헬퍼 + 개발용 가드만. 실제 메시지 생성 로직은 후속 단계.
   ===================================================================== */

/** 톤 모드 (설정에서 변경). */
export type ToneMode = 'soft' | 'witty' | 'plain'

/**
 * 요인과 결과의 관계를 단정 없이 "경향" 표현으로.
 * 예: toTendencyPhrase('수면 부족', '감정 부하') →
 *     "수면 부족과 감정 부하가 함께 나타나는 경향이 있어요"
 */
export function toTendencyPhrase(factorLabel: string, metricLabel: string): string {
  return `${factorLabel}과(와) ${metricLabel}이(가) 함께 나타나는 경향이 있어요`
}

/** 단정적 표현 후보 (개발 중 검출용). */
const ASSERTIVE_PATTERNS = ['원인입니다', '때문입니다', '확실합니다', '진단', '입니다 확정']

/**
 * 개발용 가드: 단정 문구가 섞였는지 경고.
 * Phase 1에서는 콘솔 경고만. 후속 단계에서 테스트로 승격.
 */
export function assertGuard(text: string): string {
  if (import.meta.env.DEV) {
    for (const p of ASSERTIVE_PATTERNS) {
      if (text.includes(p)) {
        console.warn(`[MODE tone] 단정 표현 의심: "${p}" → "${text}"`)
      }
    }
  }
  return text
}
