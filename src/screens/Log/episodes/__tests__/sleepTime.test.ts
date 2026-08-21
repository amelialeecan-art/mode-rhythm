/* =====================================================================
   MODE · 수면 시각 헬퍼 (시간만 입력 + 자정 rollover) 테스트
   ===================================================================== */
import { describe, expect, it } from 'vitest'
import {
  clockFromIso,
  to12h,
  from12h,
  formatKoreanClock,
  initialSleepTime,
  composeSleepTimes,
  type SleepTimes,
} from '../sleepTime'
import { validateSleepChronology } from '../../../../data/v2Validation'

const T = (bed: string, onset: string, wake: string): SleepTimes => ({ bed, onset, wake })

describe('initialSleepTime — picker 시작값(§3): 현재시각 금지', () => {
  it('(1) 그 필드에 값이 있으면 그 값에서 시작', () => {
    expect(initialSleepTime('onset', T('02:00', '02:20', ''))).toBe('02:20')
  })
  it('(2) 값이 없고 앞 필드가 있으면 앞 필드 값에서 시작', () => {
    expect(initialSleepTime('onset', T('02:00', '', ''))).toBe('02:00') // §5
  })
  it('(3) 아무 값도 없으면 00:00에서 시작', () => {
    expect(initialSleepTime('bed', T('', '', ''))).toBe('00:00')
  })
  it('(4) wake는 onset(또는 bed)에서 시작하고 현재시각을 쓰지 않는다', () => {
    expect(initialSleepTime('wake', T('02:00', '02:20', ''))).toBe('02:20')
    expect(initialSleepTime('wake', T('02:00', '', ''))).toBe('02:00')
    expect(initialSleepTime('wake', T('', '', ''))).toBe('00:00')
  })
})

describe('12시간제 표시', () => {
  it('to12h/from12h 왕복', () => {
    expect(to12h('02:20')).toEqual({ h12: 2, minute: 20, meridiem: 'AM' })
    expect(to12h('00:00')).toEqual({ h12: 12, minute: 0, meridiem: 'AM' })
    expect(to12h('13:05')).toEqual({ h12: 1, minute: 5, meridiem: 'PM' })
    expect(from12h(12, 0, 'AM')).toBe('00:00')
    expect(from12h(2, 20, 'AM')).toBe('02:20')
    expect(from12h(1, 5, 'PM')).toBe('13:05')
  })
  it('formatKoreanClock', () => {
    expect(formatKoreanClock('02:00')).toBe('오전 2:00')
    expect(formatKoreanClock('21:10')).toBe('오후 9:10')
    expect(formatKoreanClock('')).toBeNull()
  })
})

describe('composeSleepTimes — 자정 rollover는 앱이 처리(§6)', () => {
  it('(7) bed 23:40 / onset 00:20 / wake 08:10 → bed는 전날', () => {
    const r = composeSleepTimes('2026-08-21', T('23:40', '00:20', '08:10'))
    const bed = new Date(r.wentToBedAt!)
    const onset = new Date(r.sleepOnsetAt!)
    const wake = new Date(r.wakeAt!)
    expect(bed.getDate()).toBe(20) // 전날 밤
    expect(onset.getDate()).toBe(21)
    expect(wake.getDate()).toBe(21)
    expect(bed.getHours()).toBe(23)
    expect(onset.getHours()).toBe(0)
    expect(wake.getHours()).toBe(8)
    // 절대 시각 chronology 정상
    expect(validateSleepChronology(r)).toEqual([])
  })

  it('(8) 전부 자정 이후(02:00/02:20/09:10)면 모두 같은 날', () => {
    const r = composeSleepTimes('2026-08-21', T('02:00', '02:20', '09:10'))
    expect(new Date(r.wentToBedAt!).getDate()).toBe(21)
    expect(new Date(r.sleepOnsetAt!).getDate()).toBe(21)
    expect(new Date(r.wakeAt!).getDate()).toBe(21)
    expect(validateSleepChronology(r)).toEqual([])
  })

  it('일부 필드만 있어도 마지막 필드를 localDate에 앵커', () => {
    const r = composeSleepTimes('2026-08-21', { onset: '23:30', wake: '06:00' })
    expect(new Date(r.sleepOnsetAt!).getDate()).toBe(20) // 전날 밤
    expect(new Date(r.wakeAt!).getDate()).toBe(21)
    expect(validateSleepChronology(r)).toEqual([])
  })
})

describe('(9) 기존 SleepEpisode 편집 round-trip — timestamp 날짜 보존(§8)', () => {
  it('ISO → 시각 → compose가 원래 날짜/시각을 재현한다', () => {
    // 저장돼 있던 overnight 수면(로컬)
    const bedIso = new Date(2026, 7, 20, 23, 50).toISOString()
    const onsetIso = new Date(2026, 7, 21, 0, 20).toISOString()
    const wakeIso = new Date(2026, 7, 21, 8, 10).toISOString()
    const times = T(clockFromIso(bedIso), clockFromIso(onsetIso), clockFromIso(wakeIso))
    const r = composeSleepTimes('2026-08-21', times)
    expect(r.wentToBedAt).toBe(bedIso)
    expect(r.sleepOnsetAt).toBe(onsetIso)
    expect(r.wakeAt).toBe(wakeIso)
  })
})

describe('(10/11) chronology validation — rollover 정상은 통과, 진짜 오류는 거부', () => {
  it('정상 overnight는 오류로 오판하지 않는다', () => {
    const r = composeSleepTimes('2026-08-21', T('23:00', '23:40', '07:00'))
    expect(validateSleepChronology(r)).toEqual([])
  })
  it('chronology guard는 유지된다: 같은 날 잠듦<취침 절대시각은 거부', () => {
    // compose는 rollover로 대부분 해소하지만, 가드 자체는 그대로 동작해야 한다.
    const bedIso = new Date(2026, 7, 21, 3, 0).toISOString()
    const onsetIso = new Date(2026, 7, 21, 2, 0).toISOString() // 같은 날 취침보다 이름
    const wakeIso = new Date(2026, 7, 21, 9, 0).toISOString()
    expect(validateSleepChronology({ wentToBedAt: bedIso, sleepOnsetAt: onsetIso, wakeAt: wakeIso })).toContain('sleep-chronology')
  })
})
