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
