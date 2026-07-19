/* =====================================================================
   MODE · 가벼운 리듬 참고 서비스 (9.5단계)
   현재 기록 기반 "참고값"을 즉석 ViewModel로 만든다.
   ⚠️ DB에 저장하지 않는다. patternInsights/Calendar에 반영하지 않는다.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { patternInsightRepository } from '../repositories/patternInsightRepository'
import { addDaysISO, buildCycleContext, calcCycleLoad, forecastRhythmDay, type RhythmForecastDay } from '../../engine'
import { getRhythmViewModel, type RhythmMetric } from './rhythmService'
import { getTodayISODate } from '../../lib/date'
import type { ISODate } from '../models'

const HISTORY_DAYS = 30
const CYCLE_HISTORY_FLOOR = '1900-01-01'
const MIN_DAYS = 3

export interface RhythmForecastViewModel {
  hasData: boolean
  dayCount: number
  /** 내일 참고 (= next3Days[0]). 데이터 부족 시 null. */
  tomorrow: RhythmForecastDay | null
  /** D+1, D+2, D+3 참고. 데이터 부족 시 빈 배열. */
  next3Days: RhythmForecastDay[]
  note: string
}

export interface RhythmForecastOptions {
  endDate?: ISODate
}

/** 현재 기록 기반 가까운 리듬 참고. 저장하지 않고 ViewModel만 반환. */
export async function getRhythmForecastViewModel(opts: RhythmForecastOptions = {}): Promise<RhythmForecastViewModel> {
  const endDate = opts.endDate ?? getTodayISODate()
  const start = addDaysISO(endDate, -(HISTORY_DAYS - 1))

  const [scores, cycleLogs, settings] = await Promise.all([
    dailyScoreRepository.listByDateRange(start, endDate),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
    userSettingsRepository.get(),
  ])
  // endDate 이하의 실제 점수만 (미래 미사용), 오름차순
  const recent = scores.filter((s) => s.date <= endDate)
  const dayCount = recent.length

  if (dayCount < MIN_DAYS) {
    return {
      hasData: false,
      dayCount,
      tomorrow: null,
      next3Days: [],
      note: '아직 기록이 적어요. 며칠 더 기록하면 가까운 리듬 참고를 보여드릴게요.',
    }
  }

  const next3Days: RhythmForecastDay[] = []
  for (let offset = 1; offset <= 3; offset++) {
    const targetDate = addDaysISO(endDate, offset)
    const cycle = buildCycleContext(targetDate, cycleLogs, settings)
    const cycleLoad = calcCycleLoad(cycle)
    next3Days.push(forecastRhythmDay({ targetDate, dayOffset: offset, recent, cycle, cycleLoad }))
  }

  return {
    hasData: true,
    dayCount,
    tomorrow: next3Days[0],
    next3Days,
    note: '실제 기록이 아니라, 최근 흐름과 주기 위치를 바탕으로 한 참고예요.',
  }
}

/* =====================================================================
   다가오는 체크포인트 신호 (9C)
   새 예측 모델/점수 없이 이미 계산된 신호만 모은다: 주기 근접(월경 전),
   최근 일주일 악화(weekCompare), 예정 일정(anticipatory_stress),
   과거 조합 존재(persisted combo). 문장 생성은 화면 helper(buildCheckpoint).
   ===================================================================== */
const CHECKPOINT_DIFF = 8 // weekCompare 악화 판정(기존 리듬 임계와 동일)
const SCHEDULE_LOOKBACK = 6 // 최근 며칠간의 예정/압박 사건

export type CheckpointMetric = 'sleep' | 'emotional' | 'appetite' | 'body'
export interface CheckpointSignals {
  cycleNear: boolean
  worsened: Record<CheckpointMetric, boolean>
  scheduleAhead: boolean
  priorCombo: boolean
}

/** 체크포인트 신호를 모은다. 화면은 buildCheckpoint로 카드/문장을 만든다. */
export async function getCheckpointSignals(opts: RhythmForecastOptions = {}): Promise<CheckpointSignals> {
  const endDate = opts.endDate ?? getTodayISODate()

  const [rvm, cycleLogs, settings, events, combos] = await Promise.all([
    getRhythmViewModel({ endDate, days: 35, bucket: 'day' }),
    cycleLogRepository.listByDateRange(CYCLE_HISTORY_FLOOR, endDate),
    userSettingsRepository.get(),
    eventLogRepository.listByDateRange(addDaysISO(endDate, -(SCHEDULE_LOOKBACK - 1)), endDate),
    patternInsightRepository.listByType('combo'),
  ])

  const worse = (m: RhythmMetric): boolean => rvm.weekCompare[m].enough && rvm.weekCompare[m].diff >= CHECKPOINT_DIFF
  const ctx = buildCycleContext(endDate, cycleLogs, settings)

  return {
    cycleNear: ctx.isPremenstrualWindow,
    worsened: { sleep: worse('sleep'), emotional: worse('emotional'), appetite: worse('appetite'), body: worse('body') },
    scheduleAhead: events.some((e) => e.mappedFactorGroup === 'anticipatory_stress'),
    priorCombo: combos.some((c) => c.factorCodes.includes('anticipatory_stress')),
  }
}
