/* =====================================================================
   MODE · data 계층 공개 API
   ===================================================================== */
export { db, ModeLocalDB, ALL_TABLES, V1_TABLES, V2_TABLES } from './db'
export { DB_NAME, DB_VERSION, SCHEMA_V1, SCHEMA_V2 } from './schema'
export * from './v2Validation'
export { seedDemoData } from './seed'
export { resetDatabase } from './reset'
export * from './models'
export * from './modelsV2'
export {
  saveDailyEntry,
  loadDailyEntry,
  emptyDraft,
  emptyCycleDraft,
  type DailyEntryDraft,
  type EventDraft,
  type CycleDraft,
  type IntensityCode,
} from './services/dailyEntryService'
export { recalculateDailyScore, getTodaySummary } from './services/dailyScoreService'
export { resolveDailySleep, hasV2Sleep, type ResolvedSleep, type SleepSource } from './services/sleepResolveService'
export {
  getDataQualitySummary,
  getStateQualityReport,
  type DataQualitySummary,
} from './services/dataQualityService'
export { getV2AnalysisBundle, type V2AnalysisBundle } from './services/analysisDatasetService'
export {
  getCycleAlignedInsights,
  getStateClusters,
  CYCLE_ALIGNED_METRICS,
  type CycleAlignedInsights,
  type CycleAlignedEntry,
} from './services/longAnalysisService'
export {
  buildDayTimeline,
  deleteTimelineEntry,
  sortTimelineEntries,
  type TimelineEntry,
  type TimelineKind,
  type TimelineTone,
} from './services/dayTimelineService'
export {
  STRESS_CATEGORIES,
  STRESS_CATEGORY_CODES,
  STRESS_CATEGORY_META,
  buildStressEventInput,
  isV2StressEvent,
  type StressCategoryCode,
} from './catalog/stressEvents'
export { legacyFactorGroupToCanonicalStress, LEGACY_FACTORGROUP_TO_CANONICAL_STRESS } from './catalog/factorGroupMapping'
export {
  getCalendarMonth,
  getCalendarDayDetail,
  shiftMonthISO,
  type CalendarLens,
  type CalendarMonthDay,
  type CalendarMonthViewModel,
  type CalendarDayDetail,
  type LensScores,
} from './services/calendarService'
export {
  recalculatePatternInsights,
  getAnalysisViewModel,
  getRecoveryRecommendations,
  type AnalysisViewModel,
  type AnalysisOptions,
  type AnalysisStage,
  type FactorPatternCard,
  type ComboCard,
  type FrequencyItem,
} from './services/patternAnalysisService'
export {
  getRhythmViewModel,
  type RhythmViewModel,
  type RhythmDay,
  type RhythmBucket,
  type RhythmMetric,
  type WeekCompareStat,
  type RhythmOptions,
  type CyclePhase,
} from './services/rhythmService'
export {
  exportAllData,
  buildExportPayload,
  downloadExportJson,
  downloadExportPayload,
  EXPORT_FORMAT_VERSION,
  SUPPORTED_IMPORT_VERSIONS,
  type ModeExportPayload,
  type ModeExportV2Tables,
} from './services/dataExportService'
export {
  validateImportPayload,
  parseAndValidate,
  importAllData,
  MAX_IMPORT_BYTES,
  type ImportValidation,
  type ImportSummary,
  type ImportErrorCode,
  type ImportResultCounts,
} from './services/dataImportService'
export {
  getRhythmForecastViewModel,
  type RhythmForecastViewModel,
  type RhythmForecastOptions,
} from './services/rhythmForecastService'
export {
  dailyLogRepository,
  eventLogRepository,
  cycleLogRepository,
  recoveryLogRepository,
  dailyScoreRepository,
  patternInsightRepository,
  userSettingsRepository,
  // V2 repositories
  stateMeasurementRepository,
  sleepEpisodeRepository,
  mealEpisodeRepository,
  activityEpisodeRepository,
  medicationRepository,
  healthExceptionRepository,
  screenMetricRepository,
  weightMeasurementRepository,
} from './repositories'
