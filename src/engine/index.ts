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
} from './todaySummary'
export {
  calcBaseline,
  factorEffect,
  calcConfidence,
  confidenceTier,
  computeOverlapPenalty,
  addDaysISO,
  CONFIDENCE_TIER_LABEL,
  ANALYSIS_METRIC_LABEL,
  type AnalysisMetric,
  type AnalysisDataset,
  type EffectWindow,
  type ConfidenceTier,
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
