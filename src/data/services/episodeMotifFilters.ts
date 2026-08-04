/* =====================================================================
   MODE · 반복 순서(motif) 외부 설명 필터 (순수)
   반복 motif가 "매우 명백하게" 요일·생리 구간·동일 연결 사건으로만 반복된 경우에만
   보수적으로 숨긴다. 새 통계·임계값·confidence를 만들지 않고, 기존 cycle helper와
   motif가 이미 준 occurrence/transition만 사용한다.
   ⚠️ motif 엔진의 최소 3회·lag·순서 판정은 바꾸지 않는다(여기서 결과만 제거).
   ===================================================================== */
import type { CycleLog, ISODate } from '../models'
import type { EpisodeTimeline, RepeatedEpisodeMotif } from '../../engine'
import { buildCycleContext } from '../../engine'

const weekdayOf = (iso: ISODate): number => new Date(`${iso}T00:00:00Z`).getUTCDay()
const daysBetween = (a: ISODate, b: ISODate): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/** A. 모든 occurrence의 sequence 시작 요일이 전부 같으면(월·월·월) 요일 설명으로 본다. */
function allSameWeekday(motif: RepeatedEpisodeMotif): boolean {
  const days = motif.occurrences.map((o) => weekdayOf(o.sequenceStartDate))
  return days.length > 0 && days.every((d) => d === days[0])
}

type CyclePhase = 'period' | 'premenstrual' | 'ovulation' | 'other'
function cyclePhaseOf(date: ISODate, cycleLogs: CycleLog[]): { phase: CyclePhase; hasInfo: boolean } {
  const ctx = buildCycleContext(date, cycleLogs)
  const phase: CyclePhase = ctx.isPeriod ? 'period' : ctx.isPremenstrualWindow ? 'premenstrual' : ctx.isOvulationWindow ? 'ovulation' : 'other'
  return { phase, hasInfo: ctx.confidence !== 'none' }
}

/**
 * B. 모든 occurrence가 동일한 (의미 있는) 생리 구간에 속하고, 셋 다 실제 생리 정보가 있을 때만
 *    생리 설명으로 본다. 생리 정보가 하나라도 없으면(=confidence none) 추정하지 않는다.
 *    어느 창에도 없는 'other'는 공유 원인이 아니므로 숨기지 않는다.
 */
function allSameCyclePhase(motif: RepeatedEpisodeMotif, cycleLogs: CycleLog[]): boolean {
  if (cycleLogs.length === 0) return false
  const phases = motif.occurrences.map((o) => cyclePhaseOf(o.sequenceStartDate, cycleLogs))
  if (phases.some((p) => !p.hasInfo)) return false // 생리 정보 없는 occurrence가 있으면 제외 안 함
  const first = phases[0].phase
  if (first === 'other') return false
  return phases.every((p) => p.phase === first)
}

/**
 * C. 각 occurrence에서 동일한 eventKey가 motif 첫 신호와 같은 날/하루 전 시작하고 대표 transition으로
 *    연결돼 있으며, 모든 occurrence에 공통으로 존재하면 그 사건 설명으로 본다.
 *    한 occurrence라도 해당 사건이 없으면 숨기지 않는다.
 */
function allSameConnectedEvent(motif: RepeatedEpisodeMotif, episodeById: Map<string, EpisodeTimeline>): boolean {
  const firstKey = motif.sequenceKeys[0]
  const perOccurrence: (Set<string> | null)[] = motif.occurrences.map((o) => {
    const ep = episodeById.get(o.episodeId)
    if (!ep) return null
    const keys = new Set<string>()
    for (const r of ep.runs) {
      if (r.source !== 'event') continue
      const gap = daysBetween(r.startDate, o.sequenceStartDate) // 첫 신호 시작 - 사건 시작
      if (gap !== 0 && gap !== 1) continue // 같은 날 또는 하루 전
      if (ep.transitions.some((t) => t.fromKey === r.key && t.toKey === firstKey)) keys.add(r.key)
    }
    return keys
  })
  if (perOccurrence.some((s) => !s || s.size === 0)) return false // 하나라도 연결 사건 없음 → 유지
  let intersection = perOccurrence[0]!
  for (const s of perOccurrence.slice(1)) intersection = new Set([...intersection].filter((k) => s!.has(k)))
  return intersection.size > 0
}

/**
 * 반복 motif 중 요일·생리·동일 사건으로만 명백히 설명되는 것을 제거한다.
 * 그 외에는 그대로 유지한다(개인 고유 반복 순서).
 */
export function filterExternallyExplainedMotifs(
  motifs: RepeatedEpisodeMotif[],
  episodes: EpisodeTimeline[],
  cycleLogs: CycleLog[],
): RepeatedEpisodeMotif[] {
  const episodeById = new Map(episodes.map((e) => [e.id, e]))
  return motifs.filter((m) => !(allSameWeekday(m) || allSameCyclePhase(m, cycleLogs) || allSameConnectedEvent(m, episodeById)))
}
