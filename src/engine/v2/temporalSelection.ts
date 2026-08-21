/* =====================================================================
   MODE · V2 분석 · temporal 결과 노출 gate + selection (순수 함수)
   "엔진 결과가 존재한다" ≠ "사용자에게 보여줘도 된다".
   각 카테고리(아침→저녁 / 사건 이후 / lagged / baseline shift)의 결과를
   품질 gate로 거르고, family 안에서 대표를 고르며(= cherry-picking 금지),
   과밀을 막기 위해 상위 소수만 선택하는 규칙을 한 곳에 고정한다.

   selection 규칙(문서화):
   - lag family: analyzeLagFamily가 이미 lag 전체에 FDR을 적용한다. 여기서는
     "가장 큰 효과"가 아니라 confidence 우선(동률 시 |effect|)으로 대표 1개를 고르고,
     대표가 어떤 lag인지 명시한다. 나머지 lag는 버리지 않고 detail로 남길 수 있다.
   - 카테고리 간: confidence 등급 → |effect| 순으로 정렬 후 상한(cap)만 노출.
   - gate 미통과는 "패턴 없음"이 아니라 노출하지 않음(자료 부족).
   ===================================================================== */
import type { AssociationResult } from './associations'
import { rankAssociations } from './associations'
import type { MorningEveningSummary } from './associations'
import type { EventResponseResult } from './associations'
import type { ShiftCandidate } from './changePoint'
import type { V2Confidence } from './confidence'

/** 노출 gate 임계값(한 곳에 고정 — 날짜 수가 아니라 실제 관찰/반복 기준). */
export const TEMPORAL_GATES = {
  /** morning/evening 쌍 최소 수. */
  minMorningEveningPairs: 12,
  /** 사건 이후 비교에 필요한 최소 반복 노출(hasEnoughRepeatedExposure와 동일 기준). */
  minEventRepeats: 4,
  /** 사건 전/후 상태를 모두 찾은 최소 support 수. */
  minEventSupport: 4,
  /** lagged exposure의 최소 반복 노출(0 초과 노출 일수). */
  minExposureRepeats: 4,
  /** lagged/pair 정렬 후 최소 관측 수. */
  minAlignedN: 12,
  /** baseline shift 판정에 필요한 최소 관측 수. */
  minShiftN: 21,
  /** 카테고리별 기본 노출 상한. */
  maxPerCategory: 3,
} as const

const CONF_ORDER: Record<V2Confidence, number> = {
  insufficient: 0,
  exploratory: 1,
  tentative: 2,
  moderate: 3,
  strong: 4,
}

/* ---------------------------------------------------------------------
   Lag family 대표 선택 (cherry-picking 금지)
   --------------------------------------------------------------------- */
export interface LagFamilyPick {
  /** 대표 결과(노출 가능 등급). 없으면 null. */
  representative: AssociationResult | null
  /** family 전체(대표 선택 근거 · detail 표시용). */
  family: AssociationResult[]
  /** family에서 실제로 분석 가능(ok)했던 lag 수. */
  okCount: number
}

/**
 * analyzeLagFamily 결과에서 대표 하나를 고른다.
 * ⚠️ "가장 큰 효과"만 남기지 않는다. rankAssociations(confidence 우선)로 고르고,
 *    선택은 family 전체 FDR 결과 위에서 이뤄진다. 대표가 없으면(전부 자료부족) null.
 */
export function pickLagFamilyRepresentative(family: AssociationResult[]): LagFamilyPick {
  const okCount = family.filter((r) => r.status === 'ok').length
  const ranked = rankAssociations(family) // ok + confidence!=insufficient, 정렬됨
  return { representative: ranked[0] ?? null, family, okCount }
}

/* ---------------------------------------------------------------------
   카테고리별 gate
   --------------------------------------------------------------------- */
/** lagged association 노출 gate. exposureRepeats = 0 초과 노출(또는 pair) 관측 수. */
export function gateLaggedAssociation(
  rep: AssociationResult | null,
  exposureRepeats: number,
  gates: typeof TEMPORAL_GATES = TEMPORAL_GATES,
): boolean {
  if (!rep) return false
  if (rep.status !== 'ok') return false
  if (rep.confidence === 'insufficient') return false
  if (rep.n < gates.minAlignedN) return false
  if (exposureRepeats < gates.minExposureRepeats) return false
  return true
}

/** morning→evening 요약 노출 gate. */
export function gateMorningEvening(
  s: MorningEveningSummary,
  gates: typeof TEMPORAL_GATES = TEMPORAL_GATES,
): boolean {
  if (s.n < gates.minMorningEveningPairs) return false
  if (s.direction === 'none') return false
  return true
}

/** 사건 이후 상태 변화 노출 gate. eventRepeats = window 안에서 쓸 수 있었던 사건 반복 수. */
export function gateEventResponse(
  r: EventResponseResult,
  eventRepeats: number,
  gates: typeof TEMPORAL_GATES = TEMPORAL_GATES,
): boolean {
  if (eventRepeats < gates.minEventRepeats) return false
  if (r.supportCount < gates.minEventSupport) return false
  if (!Number.isFinite(r.meanDelta) || Math.abs(r.meanDelta) < 0.1) return false
  return true
}

/** baseline shift 후보 노출 gate. */
export function gateBaselineShift(
  c: ShiftCandidate,
  n: number,
  gates: typeof TEMPORAL_GATES = TEMPORAL_GATES,
): boolean {
  if (!c.isCandidate) return false
  if (n < gates.minShiftN) return false
  return true
}

/* ---------------------------------------------------------------------
   카테고리 간 정렬 + 상한
   --------------------------------------------------------------------- */
/** confidence 등급 → |effect| 순 정렬 후 상위 cap개만. (강한 상관만 고르는 게 아니라 품질순 노출) */
export function selectTopAssociations(
  reps: AssociationResult[],
  cap: number = TEMPORAL_GATES.maxPerCategory,
): AssociationResult[] {
  return [...reps]
    .sort(
      (a, b) =>
        CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence] ||
        Math.abs(b.standardizedEffect) - Math.abs(a.standardizedEffect),
    )
    .slice(0, cap)
}
