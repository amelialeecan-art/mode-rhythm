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
  EFFECT_SCORE,
  RECOVERY_TIER_LABEL,
  type RecoveryDelta,
  type RecoveryDataset,
  type NextDayRecoveryEffect,
  type RecoveryActionInsight,
  type RecoveryTier,
} from './recovery'
