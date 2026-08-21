/* =====================================================================
   MODE · 수면 파생값 (순수 함수 — 원자료 수정 없음)
   SleepEpisode의 absolute ISO datetime에서 계산한다.
   자정/날짜 경계는 절대 시각(Date.parse)으로 안전하게 처리된다 —
   수동 자정 보정 없이 onset/wake의 실제 시각 차이만 쓴다.

   ⚠️ 이 값들은 저장하지 않는다(source='derived'). 필요할 때 계산한다.
   ===================================================================== */
import type { SleepEpisode } from '../data/modelsV2'

/** 두 ISO datetime 사이 분(정수). b - a. 하나라도 없거나 파싱 불가면 null. */
export function minutesBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.round((tb - ta) / 60000)
}

/**
 * 실제 수면시간(분). sleepOnsetAt → wakeAt.
 * onset이 없으면 계산 불가(null) — 잠자리에 든 시각만으로 수면시간을 추정하지 않는다.
 * 음수(순서 오류)면 null.
 */
export function sleepDuration(ep: Pick<SleepEpisode, 'sleepOnsetAt' | 'wakeAt'>): number | null {
  const d = minutesBetween(ep.sleepOnsetAt, ep.wakeAt)
  if (d === null) return null
  return d >= 0 ? d : null
}

/**
 * 수면 중간시각(ISO datetime). onset과 wake의 중점.
 * social jetlag/phase 계산의 기반. 둘 중 하나라도 없으면 null.
 */
export function sleepMidpoint(ep: Pick<SleepEpisode, 'sleepOnsetAt' | 'wakeAt'>): string | null {
  if (!ep.sleepOnsetAt || !ep.wakeAt) return null
  const t0 = Date.parse(ep.sleepOnsetAt)
  const t1 = Date.parse(ep.wakeAt)
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return null
  return new Date(t0 + (t1 - t0) / 2).toISOString()
}

/** '7시간 30분' 같은 표시 문자열. duration이 null이면 null. */
export function formatSleepDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}
