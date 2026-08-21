/* =====================================================================
   MODE · V2 temporal 결과 문구 (순수 · 단정 금지 가드 통과)
   관찰 데이터이므로 인과("원인/때문/효과 입증")를 말하지 않는다.
   허용: 함께 나타났어요 / 이후 더 높게 기록되는 경향 / 시간 순서가 반복 /
        조정 후에도 같은 방향 / baseline 변화 후보가 보여요.
   ===================================================================== */
import { assertGuard } from '../../copy/tone'
import { formatMonthDay, parseISODate } from '../../lib/date'
import type {
  MorningEveningInsight,
  EventResponseInsight,
  LaggedInsight,
  BaselineShiftInsight,
} from '../../data/services/v2TemporalAnalysisService'
import type { V2Confidence } from '../../engine/v2'

export const V2_CONF_LABEL: Record<V2Confidence, string> = {
  insufficient: '자료 부족',
  exploratory: '탐색',
  tentative: '참고 수준',
  moderate: '보통',
  strong: '강함',
}

/** 아침 → 저녁 변화 한 줄. */
export function morningEveningSentence(i: MorningEveningInsight): string {
  const amt = Math.abs(i.summary.meanDelta).toFixed(1)
  const dir = i.summary.direction === 'increase' ? '높게' : '낮게'
  return assertGuard(`아침보다 저녁에 ${i.label}이(가) 평균 ${amt}점 ${dir} 기록됐어요.`)
}

/** 사건 이후 상태 변화 한 줄 (실제 전후 timestamp 비교). */
export function eventResponseSentence(i: EventResponseInsight): string {
  const dir = i.result.meanDelta >= 0 ? '더 높게' : '더 낮게'
  return assertGuard(
    `${i.categoryLabel}이(가) 기록된 뒤 같은 날 ${i.metricLabel}이(가) ${dir} 기록되는 경향이 있었어요.`,
  )
}

/** lagged association 한 줄. lag/방향으로 표현하되 원인 단정하지 않는다. */
export function laggedSentence(i: LaggedInsight): string {
  const together = i.result.direction === 'positive' ? '함께 높아지는' : '반대 방향으로 움직이는'
  const lagPart = i.result.lag === 0 ? '같은 날' : `약 ${i.result.lag}일 뒤까지`
  return assertGuard(
    `${i.exposureLabel}과(와) ${i.outcomeLabel}이(가) ${lagPart} ${together} 패턴이 관찰됐어요.`,
  )
}

/** lagged 보정 상태 한 줄 (adjusted/unadjusted를 정직하게 표시). */
export function laggedAdjustmentNote(i: LaggedInsight): string {
  const r = i.result
  if (!r.adjusted) return '보정 없이 관찰된 association이에요.'
  const parts: string[] = []
  if (r.adjustedForPrevOutcome) parts.push('전날 상태')
  if (r.confounders.length > 0) parts.push('요일·시간추세')
  const what = parts.join(' · ')
  return assertGuard(`${what}을(를) 조정한 뒤에도 같은 방향이 남았어요.`)
}

/** baseline 수준 변화 후보 한 줄. "원인이 바뀌었다"고 하지 않는다. */
export function baselineShiftSentence(i: BaselineShiftInsight): string {
  const when = i.shiftDate ? `${formatMonthDay(parseISODate(i.shiftDate))} 전후로 ` : ''
  return assertGuard(`${when}${i.label}의 baseline 수준 변화 후보가 보여요.`)
}
