/* =====================================================================
   MODE · 반복 변화 순서(motif) 탐지 (순수 함수)
   완성된 EpisodeTimeline[]에서 "서로 다른 episode에서 같은 변화 순서와 비슷한
   시간차가 최소 3번 반복됐는지"만 구조화해 반환한다.
   ⚠️ 사용자 문장·점수·예측·확률·위험도를 만들지 않는다. 인과 필드 없음.
   ⚠️ 성립 근거(3회)에는 completed episode만 쓴다. ongoing은 부분 매칭에서만 본다.
   ===================================================================== */
import type { ISODate } from '../data/models'
import type { EpisodeTimeline, EpisodeTimelineSource } from './episodeTimeline'
import { areSemanticallyOverlappingSignals } from './episodeTimeline'

/** 한 번의 실제 흐름에서 관측된 반복 후보 순서. */
export interface MotifOccurrence {
  episodeId: string
  episodeStartDate: ISODate
  episodeEndDate: ISODate
  /** 이 순서의 첫 신호(대표 run)가 시작된 실제 날짜. */
  sequenceStartDate: ISODate
  /** 각 단계 사이의 lag(일). 길이 = sequenceKeys.length - 1. */
  lagDays: number[]
  matchedRunKeys: string[]
}

/** 여러 episode에서 반복된 변화 순서. */
export interface RepeatedEpisodeMotif {
  id: string
  /** 순서대로의 신호 key(2 또는 3개). */
  sequenceKeys: string[]
  occurrenceCount: number
  occurrences: MotifOccurrence[]
  /** 각 단계 사이 lag의 최소/최대(강제로 같게 만들지 않고 범위로 유지). */
  typicalLagRanges: { min: number; max: number }[]
  /** 가장 최근(episode endDate 기준) occurrence의 실제 sequence 시작일. */
  latestOccurrenceDate: ISODate
}

/** 현재 episode가 이미 성립된 motif의 시작 순서와 어디까지 맞는지. 예측 필드는 없다. */
export interface MotifMatch {
  motifId: string
  matchedKeys: string[]
  completeMatch: boolean
}

export interface DetectMotifOptions {
  /** service가 cycle/weekday/event로 설명된 episode를 나중에 제외할 때 쓴다(이번 단계는 구조만). */
  excludedEpisodeIds?: string[]
  /** 주면 endDate가 today 이후인 episode는 쓰지 않는다(미래 제외). */
  today?: ISODate
  /** 최종 반환 상한(기본 5). */
  maxMotifs?: number
}

/** 반복 motif 성립 최소 occurrence 수(서로 다른 실제 흐름). */
export const MIN_MOTIF_OCCURRENCES = 3
/** 각 단계 lag의 최대-최소 허용 폭(이 이내면 같은 motif). */
export const MOTIF_LAG_SPREAD = 1
const DEFAULT_MAX_MOTIFS = 5

/**
 * 낮은 정보 가치라 2단계만으로는 motif로 만들지 않을 관계(방향 있음).
 * ⚠️ 더 긴 3단계 순서의 일부라면 전체 sequence는 후보가 될 수 있다(여기서 막지 않음).
 */
const LOW_INFO_DIRECTED_PAIRS: ReadonlySet<string> = new Set([
  // 수면 부족/늦은 잠 → 몸이 쉽게 지침
  'sleep_short>state_tired',
  'sleep_allnight>state_tired',
  'sleep_late>state_tired',
  'sleep_much>state_tired',
  'woke_late>state_tired',
  // 걱정/반복생각 → 잠들기 어려움(누웠는데 잠이 안 옴)
  'worrying>sleep_onset_difficulty',
  'thought_loop>sleep_onset_difficulty',
  'mind_would_not_rest>sleep_onset_difficulty',
  'too_many_thoughts>sleep_onset_difficulty',
  'small_things_bothered>sleep_onset_difficulty',
])

function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 2단계 순서가 정보 가치가 낮은가(2단계 단독일 때만 적용). */
function isLowInfoTwoStep(keys: string[], sourceByKey: Map<string, EpisodeTimelineSource>): boolean {
  if (keys.length !== 2) return false
  const [a, b] = keys
  if (areSemanticallyOverlappingSignals(a, b)) return true // 의미상 같은 신호 두 개
  if (LOW_INFO_DIRECTED_PAIRS.has(`${a}>${b}`)) return true
  if (sourceByKey.get(a) === 'event' && sourceByKey.get(b) === 'state') return true // 사건 하나 → 상태 하나
  return false
}

interface Candidate {
  keys: string[]
  lags: number[]
  sequenceStartDate: ISODate
  ep: EpisodeTimeline
}

/**
 * 한 episode의 대표 순서 후보(2·3단계). leading → followup( → followup)만,
 * 대표 transition으로 실제 연결된 순서만, 각 단계 lag>=1, 동일/의미중복 key 제외.
 */
function candidateSequences(ep: EpisodeTimeline): Candidate[] {
  const startByKey = new Map<string, ISODate>()
  const sourceByKey = new Map<string, EpisodeTimelineSource>()
  for (const r of ep.runs) {
    startByKey.set(r.key, r.startDate)
    sourceByKey.set(r.key, r.source)
  }
  const followSet = new Set(ep.followupRunKeys)
  const repSet = new Set([...ep.leadingRunKeys, ...ep.followupRunKeys])

  // 대표 transition → lag>=1 방향 간선.
  const edgeList: { from: string; to: string; lag: number }[] = []
  for (const t of ep.transitions) {
    if (!repSet.has(t.fromKey) || !repSet.has(t.toKey)) continue
    const a = startByKey.get(t.fromKey)
    const b = startByKey.get(t.toKey)
    if (a === undefined || b === undefined) continue
    const lag = diffDays(a, b)
    if (lag < 1) continue // 같은 날 동시발생/역순 제외
    edgeList.push({ from: t.fromKey, to: t.toKey, lag })
  }
  // 추이적 축약(transitive reduction): a→c는 사이 단계 b(a→b→c, a<b<c)가 있으면 건너뛴 간선이므로
  // 버린다. 실제 "다음 변화"만 남겨 skip 순서가 별도 짧은 motif로 새지 않게 한다(§3·§7).
  const hasEdge = new Set(edgeList.map((e) => `${e.from}>${e.to}`))
  const startOf = (k: string) => startByKey.get(k)!
  const edges = new Map<string, { to: string; lag: number }[]>()
  for (const e of edgeList) {
    const shortcut = edgeList.some(
      (m) => m.from === e.from && hasEdge.has(`${m.to}>${e.to}`) && startOf(e.from) < startOf(m.to) && startOf(m.to) < startOf(e.to),
    )
    if (shortcut) continue
    const arr = edges.get(e.from) ?? []
    arr.push({ to: e.to, lag: e.lag })
    edges.set(e.from, arr)
  }

  const out: Candidate[] = []
  const distinctAndUnrelated = (keys: string[]): boolean => {
    if (new Set(keys).size !== keys.length) return false // 동일 key 반복
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (areSemanticallyOverlappingSignals(keys[i], keys[j])) return false
    return true
  }
  const add = (keys: string[], lags: number[]) => {
    if (!distinctAndUnrelated(keys)) return
    if (keys.length === 2 && isLowInfoTwoStep(keys, sourceByKey)) return
    out.push({ keys, lags, sequenceStartDate: startByKey.get(keys[0])!, ep })
  }

  for (const lead of ep.leadingRunKeys) {
    for (const e1 of edges.get(lead) ?? []) {
      if (!followSet.has(e1.to)) continue
      add([lead, e1.to], [e1.lag])
      for (const e2 of edges.get(e1.to) ?? []) {
        if (!followSet.has(e2.to)) continue
        add([lead, e1.to, e2.to], [e1.lag, e2.lag]) // 길이 3까지만(4 이상 없음)
      }
    }
  }
  return out
}

/** 각 단계 lag의 최대-최소 폭이 1 이내가 되도록 occurrence를 묶는다(first-fit). */
function clusterByLag(occs: Candidate[]): Candidate[][] {
  const sorted = [...occs].sort((a, b) => {
    for (let i = 0; i < a.lags.length; i++) if (a.lags[i] !== b.lags[i]) return a.lags[i] - b.lags[i]
    return 0
  })
  const clusters: Candidate[][] = []
  for (const o of sorted) {
    let placed = false
    for (const c of clusters) {
      let ok = true
      for (let i = 0; i < o.lags.length; i++) {
        const vals = [...c.map((x) => x.lags[i]), o.lags[i]]
        if (Math.max(...vals) - Math.min(...vals) > MOTIF_LAG_SPREAD) {
          ok = false
          break
        }
      }
      if (ok) {
        c.push(o)
        placed = true
        break
      }
    }
    if (!placed) clusters.push([o])
  }
  return clusters
}

function buildMotif(cluster: Candidate[]): RepeatedEpisodeMotif {
  const sequenceKeys = cluster[0].keys
  const steps = sequenceKeys.length - 1
  const typicalLagRanges: { min: number; max: number }[] = []
  for (let i = 0; i < steps; i++) {
    const lags = cluster.map((c) => c.lags[i])
    typicalLagRanges.push({ min: Math.min(...lags), max: Math.max(...lags) })
  }
  const occurrences: MotifOccurrence[] = cluster
    .map((c) => ({
      episodeId: c.ep.id,
      episodeStartDate: c.ep.startDate,
      episodeEndDate: c.ep.endDate,
      sequenceStartDate: c.sequenceStartDate,
      lagDays: c.lags,
      matchedRunKeys: c.keys,
    }))
    .sort((a, b) => (a.episodeEndDate < b.episodeEndDate ? -1 : a.episodeEndDate > b.episodeEndDate ? 1 : 0))
  // 가장 최근(endDate) occurrence의 sequence 시작일(= 실제 발생 순서 기준).
  const latestOccurrenceDate = occurrences[occurrences.length - 1].sequenceStartDate
  const id = `motif-${sequenceKeys.join('_')}-${typicalLagRanges.map((r) => `${r.min}_${r.max}`).join('-')}`
  return { id, sequenceKeys, occurrenceCount: occurrences.length, occurrences, typicalLagRanges, latestOccurrenceDate }
}

const episodeSet = (m: RepeatedEpisodeMotif): Set<string> => new Set(m.occurrences.map((o) => o.episodeId))
const isPrefix = (long: string[], short: string[]): boolean => short.length < long.length && short.every((k, i) => long[i] === k)
const sameSet = (a: Set<string>, b: Set<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x))

/**
 * 완성된 EpisodeTimeline[]에서 반복된 변화 순서를 찾는다.
 * completed episode만 성립 근거로 쓰고, 같은 순서·비슷한 lag가 서로 다른 3개 이상
 * episode에서 반복될 때만 motif로 만든다. 짧은/긴 중복은 정리하고 최대 maxMotifs개.
 */
export function detectRepeatedEpisodeMotifs(episodes: EpisodeTimeline[], options: DetectMotifOptions = {}): RepeatedEpisodeMotif[] {
  const excluded = new Set(options.excludedEpisodeIds ?? [])
  const maxMotifs = options.maxMotifs ?? DEFAULT_MAX_MOTIFS
  const eligible = episodes.filter(
    (e) => e.status === 'completed' && !excluded.has(e.id) && (options.today === undefined || e.endDate <= options.today),
  )

  // sequence 서명별로 후보 모으기(episode당 같은 서명은 1회).
  const bySeq = new Map<string, Candidate[]>()
  for (const ep of eligible) {
    const seen = new Set<string>()
    for (const c of candidateSequences(ep)) {
      const sig = c.keys.join('>')
      if (seen.has(sig)) continue
      seen.add(sig)
      const arr = bySeq.get(sig) ?? []
      arr.push(c)
      bySeq.set(sig, arr)
    }
  }

  const motifs: RepeatedEpisodeMotif[] = []
  for (const cands of bySeq.values()) {
    // episode당 1 occurrence만.
    const byEp = new Map<string, Candidate>()
    for (const c of cands) if (!byEp.has(c.ep.id)) byEp.set(c.ep.id, c)
    const occs = [...byEp.values()]
    if (occs.length < MIN_MOTIF_OCCURRENCES) continue
    for (const cluster of clusterByLag(occs)) {
      if (new Set(cluster.map((c) => c.ep.id)).size < MIN_MOTIF_OCCURRENCES) continue
      motifs.push(buildMotif(cluster))
    }
  }

  // 짧은/긴 중복 제거: 같은 occurrence 집합 + 앞부분 동일 + 긴 것이 유효(3+)면 긴 것 우선.
  const kept = motifs.filter(
    (m) => !motifs.some((l) => isPrefix(l.sequenceKeys, m.sequenceKeys) && sameSet(episodeSet(l), episodeSet(m))),
  )

  kept.sort(
    (a, b) =>
      b.occurrenceCount - a.occurrenceCount ||
      (a.latestOccurrenceDate < b.latestOccurrenceDate ? 1 : a.latestOccurrenceDate > b.latestOccurrenceDate ? -1 : 0) ||
      b.sequenceKeys.length - a.sequenceKeys.length,
  )
  return kept.slice(0, maxMotifs)
}

/**
 * 현재 episode(완료·진행 무관)가 이미 성립된 motif의 시작 순서와 어디까지 맞는지 본다.
 * 실제 기록된 신호만 앞에서부터 비교하고, 아직 안 나타난 다음 변화는 예측/생성하지 않는다.
 */
export function matchEpisodeToRepeatedMotifs(episode: EpisodeTimeline, motifs: RepeatedEpisodeMotif[]): MotifMatch[] {
  const startByKey = new Map(episode.runs.map((r) => [r.key, r.startDate]))
  const repSet = new Set([...episode.leadingRunKeys, ...episode.followupRunKeys])
  const matches: MotifMatch[] = []
  for (const m of motifs) {
    let j = 0
    for (; j < m.sequenceKeys.length; j++) {
      const k = m.sequenceKeys[j]
      if (!repSet.has(k) || !startByKey.has(k)) break
      if (j > 0) {
        const prev = startByKey.get(m.sequenceKeys[j - 1])!
        const cur = startByKey.get(k)!
        if (diffDays(prev, cur) < 1) break // 실제 변화 순서(시간차)로 이어져야 함
      }
    }
    if (j >= 2) matches.push({ motifId: m.id, matchedKeys: m.sequenceKeys.slice(0, j), completeMatch: j === m.sequenceKeys.length })
  }
  return matches
}
