/* =====================================================================
   MODE · engine 공개 API (순수 함수만)
   ===================================================================== */
export { clamp, normalizeTo100, roundScore } from './guards'
export {
  calcEmotionalLoad,
  calcAppetiteLoad,
  calcSleepLoad,
  calcBodyLoad,
  calcEventLoad,
  calcRhythmLoad,
  EVENT_CATEGORY_WEIGHTS,
  type RhythmParts,
} from './scoring'
export {
  buildCycleContext,
  calcCycleLoad,
  type CycleContext,
  type CycleConfidence,
} from './cycle'
export {
  classifyDay,
  buildSubLabel,
  DAY_TYPE_LABEL,
  DAY_TYPE_SHORT_LABEL,
  type DayClassification,
  type DayScores,
  type ClassifyInput,
} from './classify'
export { buildTodayPlan, type TodayPlan, type TodayPlanInput } from './todayPlan'
export {
  resolveDailyStateDomains,
  type DailyStateDomains,
  type DomainReading,
  type DomainSource,
} from './stateDomains'
export {
  describeTodayState,
  selectTodayDecision,
  type TodayDecision,
  type TodayDecisionInput,
} from './todayDecision'
export {
  buildTodaySummary,
  type TodaySummary,
  type TodaySummaryInput,
  type FactorCandidate,
  type FactorTier,
  type EventSummary,
} from './todaySummary'
export {
  calcBaseline,
  factorEffect,
  calcConfidence,
  evidenceLevel,
  computeOverlapPenalty,
  addDaysISO,
  windowPhrase,
  EVIDENCE_LEVEL_LABEL,
  ANALYSIS_METRIC_LABEL,
  type AnalysisMetric,
  type AnalysisDataset,
  type EffectWindow,
  type EvidenceLevel,
  type EvidenceInput,
  type MetricBaseline,
  type FactorEffectResult,
  type ConfidenceInput,
} from './correlation'
export {
  accompliceEffect,
  detectUnexplained,
  type AccompliceEffectResult,
  type UnexplainedDayInput,
  type UnexplainedDayResult,
} from './patterns'
export {
  forecastRhythmDay,
  forecastConfidence,
  type RhythmForecastDay,
  type ForecastInput,
} from './forecast'
export {
  valueAtLag,
  lagSeries,
  cumulativeValue,
  cumulativeWindows,
  consecutiveOccurrence,
  baselineDeviation,
  worseningSlope,
  type DaySeries,
} from './episodeTime'
export {
  detectEpisodes,
  buildDayTimeline,
  estimateCollapseThreshold,
  assembleEpisodeSignals,
  EPISODE_FUNCTION_THRESHOLD,
  EPISODE_GAP_TOLERANCE_DAYS,
  RECOVERY_CONFIRM_DAYS,
  MAX_EPISODE_LAG,
  MAX_ANALYSIS_WINDOW_DAYS,
  RHYTHM_ESTIMATE_MARGIN,
  RHYTHM_ESTIMATE_FLOOR,
  type EpisodeDayInput,
  type EpisodeEvent,
  type Episode,
  type EpisodeDay,
  type DayState,
  type CollapseSource,
  type EpisodeStatus,
  type EpisodeConfidence,
  type EpisodeSignal,
  type EpisodeSignals,
  type CyclePositionSignal,
} from './episode'
export {
  buildRecentFlow,
  FLOW_DOMAINS,
  type FlowDomain,
  type FlowStatus,
  type RecentFlowDay,
  type RecentFlow,
} from './recentFlow'
export { buildFlowSegments, type FlowSegment } from './flowSegments'
export {
  buildExposureRuns,
  groupConsecutiveDates,
  exposureKey,
  normalizeEventLabel,
  overlapDays,
  cumulativeExposureEffect,
  MIN_EXPOSURE_RUNS,
  MIN_SINGLE_RUNS,
  MIN_MULTIDAY_RUNS,
  type ExposureRun,
  type ExposureInput,
  type ExposureCumulativeStat,
} from './exposureRuns'
export { buildFlowDrivers, MAX_FLOW_DRIVERS, type FlowDriver } from './flowDrivers'
export { buildPersonalRhythm, type PersonalRhythm, type PersonalRhythmInput, type FlowState } from './personalRhythm'
export {
  buildCycleCompare,
  CYCLE_BEFORE,
  CYCLE_AFTER,
  MIN_PERIOD_STARTS,
  MIN_COMPARE_CYCLES,
  type CyclePoint,
  type CycleCompareCurve,
} from './cycleCompare'
export {
  buildEventResponse,
  dedupeExposures,
  MIN_EXPOSURES,
  EVENT_RESPONSE_BEFORE,
  EVENT_RESPONSE_AFTER,
  type EventResponsePoint,
  type EventResponseCurve,
} from './eventResponse'
export {
  warningSignalsAt,
  warningFires,
  backtestEarlyWarning,
  WARNING_MIN_SIGNALS,
  MIN_REPORTED_EPISODES,
  type WarningCutoff,
  type WarningEvent,
  type ConfusionMatrix,
  type BacktestInput,
  type EarlyWarningReport,
} from './earlyWarning'
export {
  recoveryDelta,
  calcRecoveryScore,
  immediateRecoveryScore,
  dailyRecoveryScore,
  nextDayRecoveryEffect,
  analyzeRecoveryActions,
  recoveryTier,
  compareSimilarEpisodeRecovery,
  EFFECT_SCORE,
  RECOVERY_TIER_LABEL,
  MIN_SIMILAR_EPISODES,
  type RecoveryDelta,
  type RecoveryDataset,
  type NextDayRecoveryEffect,
  type RecoveryActionInsight,
  type RecoveryTier,
  type EpisodeRecoveryFeature,
  type RecoveryActionRef,
  type EpisodeRecoveryActionTally,
  type SimilarRecoveryComparison,
} from './recovery'
