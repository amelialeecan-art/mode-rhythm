import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { seedDemoData } from '../seed'
import { getTodaySummary } from '../services/dailyScoreService'
import { getAnalysisViewModel } from '../services/patternAnalysisService'
import { getRhythmViewModel } from '../services/rhythmService'
import { getRhythmForecastViewModel } from '../services/rhythmForecastService'
import { findAssertion } from '../../copy/tone'
import { getTodayISODate } from '../../lib/date'

/** 객체 트리에서 모든 문자열을 모은다(앱 생성 문구 검사용). */
function collectStrings(obj: unknown, acc: string[]): void {
  if (typeof obj === 'string') acc.push(obj)
  else if (Array.isArray(obj)) obj.forEach((o) => collectStrings(o, acc))
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((o) => collectStrings(o, acc))
}

beforeEach(async () => {
  await resetDatabase()
})

describe('단정 금지 가드 (앱이 생성하는 모든 문구)', () => {
  it('Today/Analysis/Rhythm/Forecast 생성 문구에 단정 표현이 없다', async () => {
    await seedDemoData()
    const today = getTodayISODate()

    const [summary, analysis, rhythm, forecast] = await Promise.all([
      getTodaySummary(today),
      getAnalysisViewModel({ endDate: today }),
      getRhythmViewModel({}),
      getRhythmForecastViewModel({}),
    ])

    const strings: string[] = []
    collectStrings(summary, strings)
    collectStrings(analysis, strings)
    collectStrings(rhythm, strings)
    collectStrings(forecast, strings)

    // 주의: 사용자 사건 라벨의 "때문에"는 가드 예외라 통과한다(앱 단정이 아님).
    const offenders = strings.filter((s) => findAssertion(s) !== null).map((s) => `${findAssertion(s)} :: ${s}`)
    expect(offenders).toEqual([])
  })
})
