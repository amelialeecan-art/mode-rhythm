/* =====================================================================
   MODE · 사용자-facing 표현 helper (순수 · 표시 전용)
   "숫자는 엄격하게, 말은 사람처럼."
   - 엔진이 이미 계산한 값만 사람말 문장으로 조합한다(없는 숫자를 만들지 않는다).
   - 통계 용어(baseline/effect/coverage/same direction …)는 여기서 사람말로 바꾼다.
   - 결정론적(랜덤 없음). 인과를 확정하지 않는다.
   ===================================================================== */
import type { V2Confidence } from '../../engine/v2'

/** 0~10 rating을 "4점 정도"처럼. 소수점은 상세에서만. */
export function approxRating(n: number): string {
  if (!Number.isFinite(n)) return ''
  return `${Math.round(n)}점 정도`
}

/**
 * 평소 → 이때 비교 한 문장. 두 값이 모두 있을 때만.
 * "평소에는 4점 정도였는데 이때는 6점 정도였어."
 * before/after 라벨은 상황에 맞게 바꿀 수 있다(기본: 평소/이때).
 */
export function beforeAfterLine(
  before: number,
  after: number,
  opts: { beforeLabel?: string; afterLabel?: string } = {},
): string | null {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  const bl = opts.beforeLabel ?? '평소에는'
  const al = opts.afterLabel ?? '이때는'
  return `${bl} ${approxRating(before)}였는데 ${al} ${approxRating(after)}였어.`
}

/**
 * 반복 횟수를 사람말로. "같은 방향" 같은 통계 표현을 쓰지 않는다.
 * matched===total → "최근 N번 모두 비슷했어."
 * 아니면 → "비교한 N번 중 M번이 그랬어."
 */
export function repetitionPhrase(matched: number, total: number, unit = '번'): string {
  if (total <= 0) return ''
  if (matched >= total) return `최근 ${total}${unit} 모두 비슷했어.`
  return `비교한 ${total}${unit} 중 ${matched}${unit}이 그랬어.`
}

/** 월경 주기 상대일(fromDay, 음수=생리 전)을 사람말로. "D-7" 같은 표기를 쓰지 않는다. */
export function cycleWindowPhrase(fromDay: number): string {
  const d = Math.abs(fromDay)
  if (fromDay >= 0) return d === 0 ? '생리 시작일 즈음에는' : `생리 시작 ${d}일쯤에는`
  if (d === 7) return '생리하기 일주일 전쯤에는'
  if (d % 7 === 0) return `생리하기 ${d / 7}주 전쯤에는`
  return `생리하기 ${d}일 전쯤에는`
}

/** lag(일)을 사람말로. "lag-1" 같은 표기를 쓰지 않는다. */
export function lagWord(lag: number): string {
  if (lag <= 0) return '같은 날'
  if (lag === 1) return '다음날'
  if (lag === 2) return '이틀 뒤'
  return `${lag}일 뒤`
}

/** 신뢰도를 badge 대신(또는 함께) 사람말로 설명(§35). 실제 gate 결과에 맞춘 표현. */
export function confidenceWords(conf: V2Confidence): string {
  switch (conf) {
    case 'strong':
      return '기록도 충분하고 여러 번 반복돼서 꽤 믿을 만해.'
    case 'moderate':
      return '몇 번 반복되긴 했는데 기록이 아주 많진 않아.'
    case 'tentative':
      return '아직 참고 정도로만 봐줘.'
    case 'exploratory':
      return '아직 살펴보는 중이야.'
    default:
      return '아직 몇 번 안 보여서 조금 더 지켜봐야 해.'
  }
}

/**
 * 가벼운 생활 패턴에만 붙이는 한마디(§3). 결정론적 · 안전한 종류에만.
 * ⚠️ 심각한 정신건강/통증/질병/체중/폭식 종류에는 절대 붙이지 않는다 → null.
 *    수면 같은 일상 패턴에만 데이터 문장 "뒤에" 양념으로 얹는다.
 */
export function lightAsideForLagged(key: string): string | null {
  if (key.startsWith('sleep-')) return '늦게 잔 다음날은 역시 티가 났어. 🫠'
  return null
}

/** 상세(자세히 보기)용 짧은 신뢰도 라벨. 메인에는 confidenceWords를 쓴다. */
export const CONFIDENCE_BADGE: Record<V2Confidence, string> = {
  insufficient: '자료 부족',
  exploratory: '탐색',
  tentative: '참고 수준',
  moderate: '보통',
  strong: '강함',
}
