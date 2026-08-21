/* =====================================================================
   MODE · V2 temporal 결과 문구 (표시 전용 · 사람말)
   "무슨 일이 있었고 그 뒤 무엇이 달랐는지"는 직설적으로 말하되,
   "왜 그런지" 원인은 확정하지 않는다(§4). 통계 용어를 메인 문구에 쓰지 않는다.
   숫자는 엔진이 준 실측만 쓰고(없는 값 창작 금지), 단정 금지 가드를 통과한다.
   ===================================================================== */
import { assertGuard } from '../../copy/tone'
import { lagWord } from './friendlyCopy'
import type {
  MorningEveningInsight,
  EventResponseInsight,
  LaggedInsight,
  BaselineShiftInsight,
} from '../../data/services/v2TemporalAnalysisService'

/** 아침 → 저녁 변화(§17). 방향에 따라 자연스럽게. */
export function morningEveningSentence(i: MorningEveningInsight): string {
  if (i.summary.direction === 'increase') {
    return assertGuard(`아침보다 저녁에 ${i.label}이(가) 더 올라가는 날이 많았어요.`)
  }
  return assertGuard(`아침엔 ${i.label}이(가) 있어도 저녁에는 좀 가라앉는 날이 많았어요.`)
}

/** 사건 이후 같은 날 변화(§18). 실제 전/후 timestamp가 확인된 것만 "뒤"를 쓴다. */
export function eventResponseSentence(i: EventResponseInsight): string {
  const dir = i.result.meanDelta >= 0 ? '더 높았어요' : '더 낮았어요'
  return assertGuard(`${i.categoryLabel} 뒤에는 ${i.metricLabel}이(가) ${dir}.`)
}

/** lagged(시간 간격) 변화(§19). 원인 단정 없이 "그 뒤 무엇이 달랐는지"만. */
export function laggedSentence(i: LaggedInsight): string {
  const when = lagWord(i.result.lag)
  const dir = i.result.direction === 'positive' ? '더 높았어요' : '더 낮았어요'
  if (i.result.lag === 0) {
    return assertGuard(`${i.exposureLabel}이(가) 크던 날에는 ${i.outcomeLabel}도 ${dir}.`)
  }
  return assertGuard(`${i.exposureLabel}이(가) 크던 ${when}에는 ${i.outcomeLabel}이(가) ${dir}.`)
}

/** lagged 보정 상태를 사람말로(자세히 보기용, §20). adjusted면 "같이 봐도 남았다". */
export function laggedAdjustmentFriendly(i: LaggedInsight): string {
  const r = i.result
  if (!r.adjusted) return '다른 조건은 아직 같이 보지 않은 결과예요.'
  const parts: string[] = []
  if (r.adjustedForPrevOutcome) parts.push('전날 상태')
  if (r.confounders.length > 0) parts.push('요일·시간 흐름')
  const what = parts.join('이나 ')
  return assertGuard(`${what} 차이를 같이 봐도 이 차이는 남아 있었어요.`)
}

/** 기준선 변화(§21). "baseline/후보/원인" 대신 "수준이 달라졌다". */
export function baselineShiftSentence(i: BaselineShiftInsight): string {
  const rose = i.candidate.afterMean >= i.candidate.beforeMean
  const dir = rose ? '전보다 올라간 것 같아요' : '전보다 내려간 것 같아요'
  if (i.shiftDate) {
    return assertGuard(`이 무렵부터 ${i.label} 수준 자체가 ${dir}.`)
  }
  return assertGuard(`요즘 들어 ${i.label} 수준 자체가 ${dir}.`)
}
