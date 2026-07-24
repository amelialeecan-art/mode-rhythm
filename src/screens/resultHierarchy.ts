/* =====================================================================
   MODE · 화면 간 결과 중복 억제 (순수 presentation helper · step4)
   같은 데이터/같은 결론이 여러 카드·화면에 반복되지 않도록 "무엇을 보여줄지"만
   고른다. 분석 판정 기준·점수·엔진 결과값은 건드리지 않는다(선택/필터만).
   ===================================================================== */
import type { RecoveryActionInsight } from '../engine'
import type { FlowDriverCard, CumulativeExposureCard } from '../data/services/patternAnalysisService'

/**
 * 누적 노출(cumulativeExposures) 중 이미 '흐름을 바꾼 누적 요인(flowDrivers)'이
 * 같은 사건(factorGroup)으로 더 직접적으로 설명하는 항목은 감춘다.
 * flowDrivers를 우선하고, cumulative는 "추가로 다른 사건"일 때만 보조로 남긴다.
 */
export function suppressRedundantCumulative(
  drivers: FlowDriverCard[],
  cumulatives: CumulativeExposureCard[],
): CumulativeExposureCard[] {
  const driverGroups = new Set(drivers.map((d) => d.factorGroup))
  return cumulatives.filter((c) => !driverGroups.has(c.factorGroup))
}

/**
 * 회복 행동 결과가 여러 카드에 반복되지 않도록, '실제 도움 된 회복 행동' 카드가
 * 대표로 다룬 actionCode는 다른 회복 관련 목록에서 제외한다.
 */
export function suppressRepeatedRecovery<T extends { actionCode: string }>(
  primary: RecoveryActionInsight[],
  others: T[],
): T[] {
  const shown = new Set(primary.map((r) => r.actionCode))
  return others.filter((o) => !shown.has(o.actionCode))
}

/** 방어적 문구(표본/더 필요/아직/추정/가능성 등)를 담은 결과 메시지인지. */
const DEFENSIVE_MARK = /표본|더 필요|아직|추정|가능성|참고용|신뢰도|데이터가? 부족/

/** 약한 회복 후보(효과 확인 중 tier)·방어적 메시지는 대표 카드에서 감춘다. */
export function strongRecoveryInsights(recs: RecoveryActionInsight[]): RecoveryActionInsight[] {
  return recs.filter((r) => r.confidenceTier !== 'checking' && !DEFENSIVE_MARK.test(r.message))
}
