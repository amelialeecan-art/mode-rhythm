/* =====================================================================
   MODE · 가벼운 리듬 참고 서비스 (9.5단계)
   현재 기록 기반 "참고값"을 즉석 ViewModel로 만든다.
   ⚠️ DB에 저장하지 않는다. patternInsights/Calendar에 반영하지 않는다.
   ===================================================================== */
import { dailyScoreRepository } from '../repositories/dailyScoreRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { userSettingsRepository } from '../repositories/userSettingsRepository'
import { addDaysISO, buildCycleContext, calcCycleLoad, forecastRhythmDay, type RhythmForecastDay } from '../../engine'
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
