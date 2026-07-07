/* =====================================================================
   MODE · 회복 행동 효과 분석 (순수 함수)
   "무엇을 했더니 나아졌는지"를 본다. 단, 인과는 단정하지 않는다.
   engine은 React/Dexie/repository를 모른다.

   두 점수를 구분한다:
   - dailyRecoveryScore: 그날 회복 행동의 "자기보고 기반" 점수 (즉시 회복감).
     → dailyScores.recoveryScore / Calendar 회복 렌즈에 사용.
   - RecoveryActionInsight.combinedScore: 행동별 "장기 효과 후보" 점수
     (전후 비교 + 다음날 비교 조합). → Analysis / Today 추천에 사용.
   ===================================================================== */
import type { ISODate, RecoveryEffectValue, RecoveryLog, RecoveryLogCategory } from '../data/models'
import { clamp, roundScore } from './guards'
import { addDaysISO } from './correlation'

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
const round = (n: number) => Math.round(n)

/* ---------------------------------------------------------------------
   전후 비교
   --------------------------------------------------------------------- */
export interface RecoveryDelta {
  moodImprovement?: number
  anxietyReduction?: number
  appetiteStabilization?: number
  bodyLoadReduction?: number
  totalDelta: number
  hasBeforeAfter: boolean
}

function pairDelta(before: number | undefined, after: number | undefined, kind: 'improve' | 'reduce'): number | undefined {
  if (before === undefined || after === undefined) return undefined
  return kind === 'improve' ? after - before : before - after
}

export function recoveryDelta(log: RecoveryLog): RecoveryDelta {
  const moodImprovement = pairDelta(log.beforeMood, log.afterMood, 'improve')
  const anxietyReduction = pairDelta(log.beforeAnxiety, log.afterAnxiety, 'reduce')
  const appetiteStabilization = pairDelta(log.beforeAppetite, log.afterAppetite, 'reduce')
  const bodyLoadReduction = pairDelta(log.beforeBodyLoad, log.afterBodyLoad, 'reduce')
  const parts = [moodImprovement, anxietyReduction, appetiteStabilization, bodyLoadReduction].filter(
    (x): x is number => x !== undefined,
  )
  return {
    moodImprovement,
    anxietyReduction,
    appetiteStabilization,
    bodyLoadReduction,
    totalDelta: parts.reduce((a, b) => a + b, 0),
    hasBeforeAfter: parts.length > 0,
  }
}

/** 전후 비교 점수(0~100). irritability 필드는 현재 없으므로 0으로 처리. raw<=0이면 0. */
export function calcRecoveryScore(delta: RecoveryDelta): number {
  const raw =
    (delta.moodImprovement ?? 0) * 1.2 +
    (delta.anxietyReduction ?? 0) * 1.1 +
    0 * 0.9 + // irritabilityReduction (필드 없음 → 0)
    (delta.appetiteStabilization ?? 0) * 0.8 +
    (delta.bodyLoadReduction ?? 0) * 0.7
  if (raw <= 0) return 0
  return roundScore(clamp((raw / 30) * 100, 0, 100))
}

/* ---------------------------------------------------------------------
   effect 라벨 점수화 (자기보고)
   --------------------------------------------------------------------- */
export const EFFECT_SCORE: Record<RecoveryEffectValue, number | null> = {
  much_better: 80,
  little_better: 55,
  same: 25,
  worse: 0,
  unknown: null,
}

/** 즉시 회복 점수: 전후값이 있으면 우선, 없으면 effect 라벨. 둘 다 없으면 null. */
export function immediateRecoveryScore(log: RecoveryLog): number | null {
  const delta = recoveryDelta(log)
  if (delta.hasBeforeAfter) return calcRecoveryScore(delta)
  return EFFECT_SCORE[log.effect]
}

/** 그날 회복 행동의 자기보고 기반 점수(평균). dailyScores.recoveryScore용. */
export function dailyRecoveryScore(logs: RecoveryLog[]): number {
  const scores = logs.map(immediateRecoveryScore).filter((x): x is number => x !== null)
  if (scores.length === 0) return 0
  return roundScore(clamp(mean(scores), 0, 100))
}

/* ---------------------------------------------------------------------
   다음날 비교
   --------------------------------------------------------------------- */
export interface RecoveryDataset {
  /** dailyScore가 있는 날짜들(분석창 내). */
  dates: ISODate[]
  /** 날짜 → rhythmLoad. */
  rhythmByDate: Map<ISODate, number>
  /** 날짜 → 그날 기록된 회복 actionCode 집합. */
  actionsByDate: Map<ISODate, Set<string>>
  /** 분석창 rhythm 기준선(평균). consistency 판정용. */
  baselineRhythm: number
  endDate: ISODate
}

export interface NextDayRecoveryEffect {
  actionCode: string
  actionLabel: string
  withActionNextDayMean: number
  withoutActionNextDayMean: number
  effectSize: number
  supportCount: number
  comparisonCount: number
}

const MIN_NEXTDAY_SUPPORT = 3

/**
 * 회복 행동을 한 다음날(D+1) rhythmLoad가 낮은 편인지.
 * effectSize = 안 한 다음날 평균 - 한 다음날 평균 (양수면 한 다음날이 더 낮음).
 * D+1 데이터 없으면 제외. 미래 데이터는 쓰지 않는다.
 *
 * 해석 규칙(역인과 방지): "행동한 날 당일 점수가 높다 → 효과 없음"으로 계산하지 않는다.
 * 부하가 높은 날일수록 회복 행동을 하기 때문. 그래서 회복 효과는 당일 상관이 아니라
 * 전후 자기보고(recoveryDelta/effect)와 이 다음날 비교로만 본다.
 */
export function nextDayRecoveryEffect(
  ds: RecoveryDataset,
  actionCode: string,
  actionLabel: string,
): NextDayRecoveryEffect | null {
  const withNext: number[] = []
  const withoutNext: number[] = []
  for (const d of ds.dates) {
    const nextR = ds.rhythmByDate.get(addDaysISO(d, 1))
    if (nextR === undefined) continue // D+1 점수 없으면 제외
    const has = ds.actionsByDate.get(d)?.has(actionCode) ?? false
    if (has) withNext.push(nextR)
    else withoutNext.push(nextR)
  }
  if (withNext.length < MIN_NEXTDAY_SUPPORT || withoutNext.length < MIN_NEXTDAY_SUPPORT) return null
  const withMean = mean(withNext)
  const withoutMean = mean(withoutNext)
  return {
    actionCode,
    actionLabel,
    withActionNextDayMean: round(withMean),
    withoutActionNextDayMean: round(withoutMean),
    effectSize: round(withoutMean - withMean),
    supportCount: withNext.length,
    comparisonCount: withoutNext.length,
  }
}

/* ---------------------------------------------------------------------
   행동별 종합 효과
   --------------------------------------------------------------------- */
export type RecoveryTier = 'checking' | 'some_help' | 'personal_helper' | 'strong_helper'

export const RECOVERY_TIER_LABEL: Record<RecoveryTier, string> = {
  checking: '효과 확인 중',
  some_help: '도움이 된 편',
  personal_helper: '개인 회복템',
  strong_helper: '구조대 에이스',
}

export function recoveryTier(confidence: number): RecoveryTier {
  if (confidence <= 30) return 'checking'
  if (confidence <= 55) return 'some_help'
  if (confidence <= 75) return 'personal_helper'
  return 'strong_helper'
}

export interface RecoveryActionInsight {
  actionCode: string
  actionLabel: string
  category: RecoveryLogCategory
  immediateScore?: number
  nextDayEffectSize?: number
  combinedScore: number
  supportCount: number
  comparisonCount?: number
  confidence: number
  confidenceTier: RecoveryTier
  message: string
}

const MIN_ACTION_SUPPORT = 2

function normalizeNextDay(effectSize: number): number {
  return clamp((effectSize / 20) * 100, 0, 100)
}

function recoveryMessage(label: string, immediate: number | undefined, next: NextDayRecoveryEffect | null): string {
  if (immediate !== undefined) {
    return `최근 기록에서 ${label}은(는) 전후 기록상 도움이 된 편이에요. 비슷한 날의 회복 행동 후보로 볼 수 있어요.`
  }
  // immediate가 없고 next만 있는 경우
  void next
  return `${label}을(를) 기록한 다음날에는 전체 부하가 낮게 기록된 편이에요. 아직 표본은 더 필요해요.`
}

/** 회복 행동별 전후+다음날 종합. recoveryLogs는 분석창 내. */
export function analyzeRecoveryActions(ds: RecoveryDataset, recoveryLogs: RecoveryLog[]): RecoveryActionInsight[] {
  // actionCode별 묶기
  const byAction = new Map<string, RecoveryLog[]>()
  for (const log of recoveryLogs) {
    const arr = byAction.get(log.actionCode) ?? []
    arr.push(log)
    byAction.set(log.actionCode, arr)
  }

  const insights: RecoveryActionInsight[] = []
  for (const [actionCode, logs] of byAction) {
    const label = logs[0].actionLabel
    const category = logs[0].category
    const supportCount = new Set(logs.map((l) => l.date)).size

    const immediateScores = logs.map(immediateRecoveryScore).filter((x): x is number => x !== null)
    const immediate = immediateScores.length > 0 ? roundScore(mean(immediateScores)) : undefined

    const next = nextDayRecoveryEffect(ds, actionCode, label)

    if (immediate === undefined && !next) continue
    if (immediate !== undefined && !next && supportCount < MIN_ACTION_SUPPORT) continue

    const normalizedNext = next ? normalizeNextDay(next.effectSize) : undefined
    let combinedScore: number
    if (immediate !== undefined && normalizedNext !== undefined) combinedScore = immediate * 0.6 + normalizedNext * 0.4
    else if (immediate !== undefined) combinedScore = immediate
    else combinedScore = normalizedNext as number
    combinedScore = roundScore(combinedScore)

    // consistency: effect가 좋았거나 다음날 rhythm이 baseline보다 낮았던 비율
    let helpful = 0
    for (const log of logs) {
      const goodEffect = log.effect === 'much_better' || log.effect === 'little_better'
      const nr = ds.rhythmByDate.get(addDaysISO(log.date, 1))
      const nextHelp = nr !== undefined && nr < ds.baselineRhythm
      if (goodEffect || nextHelp) helpful++
    }
    const consistency = logs.length > 0 ? helpful / logs.length : 0

    const confidence = roundScore(
      (Math.min(supportCount / 8, 1) * 0.45 + Math.min(Math.abs(combinedScore) / 70, 1) * 0.35 + consistency * 0.2) * 100,
    )

    insights.push({
      actionCode,
      actionLabel: label,
      category,
      immediateScore: immediate,
      nextDayEffectSize: next?.effectSize,
      combinedScore,
      supportCount,
      comparisonCount: next?.comparisonCount,
      confidence,
      confidenceTier: recoveryTier(confidence),
      message: recoveryMessage(label, immediate, next),
    })
  }

  insights.sort((a, b) => b.confidence - a.confidence || b.combinedScore - a.combinedScore)
  return insights
}
