/* =====================================================================
   MODE · 수면 시각 입력 헬퍼 (순수 · 시간만 입력, 날짜는 앱이 처리)
   달력 없이 '시간만' 고르게 하고, 자정 rollover는 앱이 chronology로 계산한다.
   - 저장 기준 localDate = 깨어난 날(wake day). 마지막(가장 늦은) 필드를 localDate에
     앵커로 놓고, 앞 필드는 시각(분)이 크면 전날로 역산한다.
   - datetime-local이 아니라 'HH:MM'(24h)만 다룬다. 절대 시각(ISO)은 저장 시 조합.
   ===================================================================== */

export type SleepField = 'bed' | 'onset' | 'wake'
/** 화면 시각 3필드('HH:MM' 또는 ''). */
export interface SleepTimes {
  bed: string
  onset: string
  wake: string
}
/** 시각 필드의 chronological 순서(이른 → 늦은). */
export const SLEEP_FIELD_ORDER: SleepField[] = ['bed', 'onset', 'wake']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** ISO datetime → 'HH:MM'(로컬). 없으면 ''. */
export function clockFromIso(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 'HH:MM' → 분 단위(0~1439). 잘못되면 null. */
export function clockToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/** 'HH:MM'(24h) → 12시간제 표시 조각. */
export function to12h(hhmm: string): { h12: number; minute: number; meridiem: 'AM' | 'PM' } {
  const total = clockToMinutes(hhmm) ?? 0
  const h = Math.floor(total / 60)
  const minute = total % 60
  const meridiem: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { h12, minute, meridiem }
}

/** 12시간제 조각 → 'HH:MM'(24h). */
export function from12h(h12: number, minute: number, meridiem: 'AM' | 'PM'): string {
  let h = h12 % 12
  if (meridiem === 'PM') h += 12
  return `${pad(h)}:${pad(minute)}`
}

/** 'HH:MM' → '오전 2:00' 사람 표시. 빈 값이면 null. */
export function formatKoreanClock(hhmm: string): string | null {
  if (!hhmm) return null
  const { h12, minute, meridiem } = to12h(hhmm)
  return `${meridiem === 'AM' ? '오전' : '오후'} ${h12}:${pad(minute)}`
}

/**
 * picker를 열 때 시작값(§3). 절대 현재 시각(10:37 등)에서 시작하지 않는다.
 * 1) 그 필드에 이미 값이 있으면 그 값(수정).
 * 2) 없으면 chronology상 바로 앞 필드의 값(이어받기).
 * 3) 둘 다 없으면 '00:00'.
 */
export function initialSleepTime(field: SleepField, times: SleepTimes): string {
  if (times[field]) return times[field]
  const idx = SLEEP_FIELD_ORDER.indexOf(field)
  for (let i = idx - 1; i >= 0; i--) {
    const prev = times[SLEEP_FIELD_ORDER[i]]
    if (prev) return prev
  }
  return '00:00'
}

function isoFromLocalParts(year: number, month0: number, day: number, hhmm: string): string {
  const total = clockToMinutes(hhmm) ?? 0
  return new Date(year, month0, day, Math.floor(total / 60), total % 60, 0, 0).toISOString()
}

/**
 * localDate + 시각 3필드 → 절대 시각(ISO) 조합. 자정 rollover를 앱이 처리한다.
 * 규칙: 존재하는 필드 중 가장 늦은(마지막) 필드를 localDate에 놓고,
 *       앞 필드는 그 시각(분)이 뒤 필드보다 크면 전날로 역산한다.
 * 예) localDate=8/21, bed 23:40 / onset 00:20 / wake 08:10
 *     → wake=8/21 08:10, onset=8/21 00:20, bed=8/20 23:40
 * 예) bed 02:00 / onset 02:20 / wake 09:10 → 모두 8/21(같은 새벽/아침)
 */
export function composeSleepTimes(
  localDate: string,
  times: Partial<SleepTimes>,
): { wentToBedAt?: string; sleepOnsetAt?: string; wakeAt?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!m) return {}
  const year = Number(m[1])
  const month0 = Number(m[2]) - 1
  const day = Number(m[3])

  // 존재하는 필드를 chronological 순서로.
  const present = SLEEP_FIELD_ORDER.filter((f) => !!times[f] && clockToMinutes(times[f] as string) !== null)
  const dayOffset: Partial<Record<SleepField, number>> = {}
  // 마지막(가장 늦은) 필드 = localDate(offset 0). 뒤에서 앞으로.
  for (let i = present.length - 1; i >= 0; i--) {
    const f = present[i]
    if (i === present.length - 1) {
      dayOffset[f] = 0
      continue
    }
    const next = present[i + 1]
    const curMin = clockToMinutes(times[f] as string) as number
    const nextMin = clockToMinutes(times[next] as string) as number
    // 이 필드가 뒤 필드보다 시각이 크면(예: 23:40 > 00:20) 전날.
    dayOffset[f] = (dayOffset[next] as number) - (curMin > nextMin ? 1 : 0)
  }

  const out: { wentToBedAt?: string; sleepOnsetAt?: string; wakeAt?: string } = {}
  const key: Record<SleepField, keyof typeof out> = { bed: 'wentToBedAt', onset: 'sleepOnsetAt', wake: 'wakeAt' }
  for (const f of present) {
    out[key[f]] = isoFromLocalParts(year, month0, day + (dayOffset[f] as number), times[f] as string)
  }
  return out
}
