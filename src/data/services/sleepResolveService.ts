/* =====================================================================
   MODE · 수면 canonical 소스 해석 (데이터 계층 준비)
   V2 SleepEpisode가 있으면 그것을 canonical로 우선한다.
   없으면 legacy(V1 lastNightSleep/sleep event)를 계속 읽어 쓰도록 신호만 준다.

   ⚠️ V1 → V2 변환/재해석을 하지 않는다. legacy는 기존 화면/서비스가 그대로 읽는다.
   파생값(duration/midpoint)은 저장하지 않고 계산해서 함께 준다.
   ===================================================================== */
import type { ISODate } from '../models'
import type { SleepEpisode } from '../modelsV2'
import { sleepDuration, sleepMidpoint } from '../../engine/sleepDerived'
import { sleepEpisodeRepository } from '../repositories'

export type SleepSource = 'v2' | 'legacy'

export interface ResolvedSleep {
  /** 'v2'면 episode/파생 사용, 'legacy'면 기존 V1 경로로 읽으라는 신호. */
  source: SleepSource
  episode?: SleepEpisode
  /** V2일 때 파생 수면시간(분). 계산 불가면 null. */
  durationMinutes: number | null
  /** V2일 때 수면 중간시각(ISO). 계산 불가면 null. */
  midpoint: string | null
}

/**
 * 해당 wakeDate(localDate)의 canonical 수면을 해석한다.
 * V2 SleepEpisode가 있으면 우선, 없으면 legacy로 표시한다.
 */
export async function resolveDailySleep(localDate: ISODate): Promise<ResolvedSleep> {
  const episode = await sleepEpisodeRepository.getByDate(localDate)
  if (episode) {
    return {
      source: 'v2',
      episode,
      durationMinutes: sleepDuration(episode),
      midpoint: sleepMidpoint(episode),
    }
  }
  return { source: 'legacy', durationMinutes: null, midpoint: null }
}

/** V2 수면 기록이 있는 날짜인지(분석기가 V2 우선 여부를 판단할 때). */
export async function hasV2Sleep(localDate: ISODate): Promise<boolean> {
  return (await sleepEpisodeRepository.getByDate(localDate)) != null
}
