import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../reset'
import { saveDailyEntry, loadDailyEntry, emptyDraft, type DailyEntryDraft } from '../services/dailyEntryService'
import { getRecentFlow } from '../services/rhythmService'
import { buildExportPayload } from '../services/dataExportService'
import { importAllData } from '../services/dataImportService'
import { dailyScoreRepository, dailyLogRepository, eventLogRepository } from '../repositories'
import { buildFlowSegments, addDaysISO, type RecentFlowDay } from '../../engine'

const START = '2026-06-10'
const draft = (date: string, p: Partial<DailyEntryDraft>): DailyEntryDraft => ({ ...emptyDraft(date), ...p })

beforeEach(async () => {
  await resetDatabase()
})

/* step2 · 저장된 직접 입력이 흐름 분석까지 실제로 연결되는지(파이프라인). */

describe('직접 입력 → dailyScore 연결', () => {
  // (15a) bodyEnergyLevel(직접값)이 저장 점수(bodyLoad)에 실제로 반영된다.
  it('bodyEnergyLevel이 저장 bodyLoad를 바꾼다', async () => {
    await saveDailyEntry(draft('2026-06-10', { bodyEnergyLevel: 'charged' }))
    await saveDailyEntry(draft('2026-06-11', { bodyEnergyLevel: 'empty' }))
    const charged = await dailyScoreRepository.getByDate('2026-06-10')
    const empty = await dailyScoreRepository.getByDate('2026-06-11')
    expect(charged!.bodyLoad).toBeLessThan(empty!.bodyLoad)
  })
})

describe('recentFlow / flowSegments가 직접 입력을 실제 사용', () => {
  // 앞 5일 charged(몸 에너지 높음) → 뒤 5일 empty(몸 에너지 낮음): 몸 영역이 악화 흐름.
  async function saveWorseningBody(endException?: string) {
    for (let i = 0; i < 10; i++) {
      const date = addDaysISO(START, i)
      const bodyEnergyLevel = i < 5 ? 'charged' : 'empty'
      await saveDailyEntry(
        draft(date, {
          bodyEnergyLevel,
          mentalSpaceLevel: 'spacious', // 감정 영역은 평탄하게(판단 가능 영역 확보)
          functionLevel: 1,
          appetiteRatings: { appetite: 3 },
          ...(endException === date ? { rhythmExceptionCodes: ['illness'] } : {}),
        }),
      )
    }
  }

  // (15b) 몸 에너지가 악화되면 recentFlow의 leading에 body가 잡힌다(직접 입력 사용).
  it('bodyEnergyLevel 악화가 recentFlow에 body 흐름으로 나타난다', async () => {
    await saveWorseningBody()
    const flow = await getRecentFlow({ endDate: addDaysISO(START, 9) })
    expect(flow).not.toBeNull()
    expect(flow!.leading).toContain('body')
  })

  it('몸 에너지가 평탄하면 body가 leading에 잡히지 않는다(대조군)', async () => {
    for (let i = 0; i < 10; i++) {
      await saveDailyEntry(draft(addDaysISO(START, i), { bodyEnergyLevel: 'charged', mentalSpaceLevel: 'spacious', functionLevel: 1, appetiteRatings: { appetite: 3 } }))
    }
    const flow = await getRecentFlow({ endDate: addDaysISO(START, 9) })
    // 평탄하면 흐름이 없거나(null) 있어도 body가 앞선 변화로 잡히지 않는다.
    expect(flow?.leading ?? []).not.toContain('body')
  })

  // (15c) flowSegments는 저장 점수(직접 입력 기반 bodyLoad)를 그대로 쓴다.
  it('flowSegments가 저장된 bodyLoad(직접 입력 유래)를 사용해 구간을 만든다', async () => {
    await saveWorseningBody()
    const scores = await dailyScoreRepository.listByDateRange(START, addDaysISO(START, 9))
    const days: RecentFlowDay[] = scores.map((s) => ({ date: s.date, emotional: s.emotionalLoad, appetite: s.appetiteLoad, sleep: s.sleepLoad, body: s.bodyLoad }))
    const segments = buildFlowSegments(days)
    // 몸 영역이 변화(changing) 영역으로 잡힌 구간이 있어야 한다.
    expect(segments.some((seg) => seg.changing.includes('body'))).toBe(true)
  })
})

describe('예외일 분리 (#7)', () => {
  // (13a) 오늘이 예외일이면 이전 흐름을 오늘 상태처럼 보여주지 않는다(null).
  it('endDate가 예외일이면 recentFlow는 null', async () => {
    for (let i = 0; i < 8; i++) {
      await saveDailyEntry(draft(addDaysISO(START, i), { bodyEnergyLevel: i < 4 ? 'charged' : 'empty', mentalSpaceLevel: 'spacious', functionLevel: 1 }))
    }
    const end = addDaysISO(START, 8)
    await saveDailyEntry(draft(end, { rhythmExceptionCodes: ['illness'], mentalSpaceLevel: 'spacious' }))
    const flow = await getRecentFlow({ endDate: end })
    expect(flow).toBeNull()
  })

  // (13b) 중간 예외일 앞뒤 흐름을 하나로 이어 붙이지 않는다.
  it('중간 예외일 이전의 악화 흐름을 예외일 이후로 잇지 않는다', async () => {
    // 0~4 악화(charged→empty), 5=예외일, 6~9 평탄(empty 유지).
    for (let i = 0; i < 10; i++) {
      const date = addDaysISO(START, i)
      if (i === 5) {
        await saveDailyEntry(draft(date, { rhythmExceptionCodes: ['illness'], bodyEnergyLevel: 'empty', mentalSpaceLevel: 'spacious', functionLevel: 1 }))
      } else {
        await saveDailyEntry(draft(date, { bodyEnergyLevel: i < 3 ? 'charged' : 'empty', mentalSpaceLevel: 'spacious', functionLevel: 1, appetiteRatings: { appetite: 3 } }))
      }
    }
    const flow = await getRecentFlow({ endDate: addDaysISO(START, 9) })
    // 예외일 이후(6~9)만 흐름 표본 → 예외일 이전 날짜에서 흐름이 시작되지 않는다.
    if (flow) expect(flow.startDate > addDaysISO(START, 5)).toBe(true)
  })

  // (13c) flowSegments는 예외일에서 구간을 끊는다(엔진 단위).
  it('flowSegments는 예외일에서 흐름을 분리한다', () => {
    const days: RecentFlowDay[] = []
    for (let i = 0; i < 8; i++) {
      days.push({ date: addDaysISO(START, i), body: i < 4 ? 5 : 80, excluded: i === 4 })
    }
    const segments = buildFlowSegments(days)
    // 어떤 구간도 예외일(index4)을 가로질러 이어지지 않는다.
    const exDate = addDaysISO(START, 4)
    expect(segments.every((s) => s.endDate < exDate || s.startDate > exDate)).toBe(true)
  })
})

describe('옛 기록 저장·복원·JSON 호환 (#14)', () => {
  it('새 직접 입력 필드가 JSON 내보내기·가져오기로 보존된다', async () => {
    await saveDailyEntry(
      draft('2026-06-10', {
        emotionalStabilityLevel: 'mostly_stable',
        emotionCodes: ['irritated'],
        emotionImpactLevel: 'brief',
        focusLevel: 'well',
        socialCapacityLevel: 'low',
        bodyEnergyLevel: 'empty',
        stateCodes: ['calm'],
        catalogEventCodes: ['sleep_short'],
      }),
    )
    const payload = await buildExportPayload()
    await resetDatabase()
    await importAllData(payload)

    const log = await dailyLogRepository.getByDate('2026-06-10')
    expect(log?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(log?.emotionCodes).toEqual(['irritated'])
    expect(log?.focusLevel).toBe('well')
    expect(log?.socialCapacityLevel).toBe('low')
    expect(log?.stateCodes).toEqual(['calm'])
    const events = await eventLogRepository.listByDate('2026-06-10')
    expect(events.some((e) => e.eventCode === 'sleep_short')).toBe(true)

    // 복원 후 다시 열어도 값이 유지된다.
    const loaded = await loadDailyEntry('2026-06-10')
    expect(loaded?.emotionalStabilityLevel).toBe('mostly_stable')
    expect(loaded?.focusLevel).toBe('well')
  })
})
