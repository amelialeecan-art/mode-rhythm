/* =====================================================================
   MODE · Today "지금 이어지는 흐름" 한 줄 (순수 helper)
   완성된 EpisodeInsightSnapshot에서, 사용자가 놓치기 쉬운 "지금 실제로 이어지는
   흐름"이 있을 때만 짧은 보조 문장 한 줄을 만든다. Analysis처럼 전체 날짜 흐름을
   다시 길게 보여주지 않는다.

   ⚠️ 계산/서비스/repository를 부르지 않는다(입력 snapshot만). 새 공식 없음.
   ⚠️ 내부 key/진단/예측/원인을 노출하지 않는다 — 실제 기록된 순서만.
   ⚠️ 수면은 엔진이 정렬한 nightOf 날짜를 그대로 쓴다(여기서 하루 가감 금지).
   ===================================================================== */
import type { ISODate } from '../../data/models'
import type { EpisodeInsightSnapshot } from '../../data/services/episodeInsightService'
import type { EpisodeTimelineSource, TimelineRun } from '../../engine'
import { areSemanticallyOverlappingSignals, addDaysISO } from '../../engine'
import { MIND_SIGNAL_LABEL } from '../../data/catalog/mindSignals'
import { SLEEP_ISSUE_LABEL } from '../../data/catalog/lastNightSleep'

const MAJOR: ReadonlySet<EpisodeTimelineSource> = new Set<EpisodeTimelineSource>(['mind', 'sleep', 'state'])

/** 직접 상태(카탈로그가 명사형이라 문장 어간을 둔다). */
const STATE_CLAUSE: Record<string, string> = {
  state_tired: '몸이 쉽게 지쳤',
  state_mind_busy: '머리가 복잡했',
  state_daily_tasks_hard: '평소 하던 일이 버거웠',
  state_people_hard: '사람을 대하기 버거웠',
  state_focus_hard: '집중하기 어려웠',
  state_body_uncomfortable: '몸이 불편했',
  state_appetite_changed: '먹고 싶은 정도가 평소와 달랐',
  state_emotion_unsteady: '마음이 쉽게 흔들렸',
  state_emotions_linger: '예민함이나 짜증이 오래 갔',
}
/** 수면은 카탈로그가 과해 간결 어간으로 보완. */
const SLEEP_CLAUSE: Record<string, string> = {
  bedtime_delay: '자는 걸 미뤘',
  phone_sleep_delay: '폰을 보며 잠을 미뤘',
}

/** 과거 연결 어간(고/어요가 붙는다). 사람말로 못 바꾸면 null. */
function clauseFor(key: string): string | null {
  if (STATE_CLAUSE[key]) return STATE_CLAUSE[key]
  if (SLEEP_CLAUSE[key]) return SLEEP_CLAUSE[key]
  const m = MIND_SIGNAL_LABEL.get(key)
  if (m?.endsWith('어요')) return m.slice(0, -2)
  const s = SLEEP_ISSUE_LABEL.get(key)
  if (s?.endsWith('어요')) return s.slice(0, -2)
  return null
}

/**
 * "지금 이어지는 흐름" 한 줄. 표시 조건을 모두 만족할 때만 문장, 아니면 null.
 * - recentEpisode 존재 + status 'ongoing'
 * - 오늘/어젯밤과 실제로 연결(대표 신호가 range_edge로 오늘·어젯밤까지 이어짐)
 * - 미기록으로 종료가 끊긴 흐름 아님(missing_gap 제외)
 * - 의미상 서로 다른 실제 변화 2개 이상, 사람말로 표현 가능
 * 문장은 최대 1문장·대표 신호 2개. 예측/원인/확률 없음.
 */
export function presentTodayCurrentFlow(snapshot: EpisodeInsightSnapshot, today: ISODate): string | null {
  const ep = snapshot.recentEpisode
  if (!ep || ep.status !== 'ongoing') return null

  const runByKey = new Map(ep.runs.map((r) => [r.key, r]))
  // 대표 신호(리딩+후속) 중 사람말 가능·의미중복 제거, 시작일 순.
  const chosen: TimelineRun[] = []
  for (const key of [...ep.leadingRunKeys, ...ep.followupRunKeys]) {
    const r = runByKey.get(key)
    if (!r || clauseFor(key) === null) continue
    if (chosen.some((c) => areSemanticallyOverlappingSignals(c.key, key))) continue
    chosen.push(r)
  }
  chosen.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0))
  if (chosen.length < 2) return null // 신호 하나뿐 / 의미상 같은 신호 둘뿐

  const majors = chosen.filter((r) => MAJOR.has(r.source))
  if (majors.some((r) => r.endBoundary === 'missing_gap')) return null // 종료 확인 불가(미기록) 흐름

  // 오늘/어젯밤과 실제 연결: range_edge로 오늘(낮) 또는 어젯밤(수면 nightOf=today-1)까지 이어짐.
  const yesterday = addDaysISO(today, -1)
  const live = majors.filter((r) => r.endBoundary === 'range_edge' && r.endDate >= yesterday)
  if (live.length === 0) return null // 오래전에 끝난 조각이 range edge로 남은 것처럼 보이는 경우 등 제외

  const last = live.reduce((m, r) => (r.endDate > m.endDate ? r : m), live[0])
  const first = chosen.find((r) => r.key !== last.key && !areSemanticallyOverlappingSignals(r.key, last.key))
  if (!first) return null // 서로 다른 실제 변화 2개가 안 됨

  const firstClause = clauseFor(first.key)!
  const lastClause = clauseFor(last.key)!
  const firstPrefix = first.calendarDays >= 2 ? '며칠째 ' : ''
  const nowWord = last.source === 'sleep' ? '어젯밤에는' : '오늘은'
  return `${firstPrefix}${firstClause}고, ${nowWord} ${lastClause}어요.`
}

/* ---------------------------------------------------------------------
   안전 로더 (진입 1회 / 최신 응답만 / dispose 후 미적용 / 실패 시 기존 유지)
   Analysis 로더와 같은 안전 패턴을 snapshot 소비만 일반화해 둔다(전역 캐시 없음).
   --------------------------------------------------------------------- */
export interface SnapshotFlowLoader {
  load: () => Promise<void>
  dispose: () => void
}
export function createSnapshotFlowLoader<T>(
  fetchSnapshot: () => Promise<T>,
  apply: (snapshot: T) => void,
  onError?: (err: unknown) => void,
): SnapshotFlowLoader {
  let latest = 0
  let disposed = false
  return {
    async load() {
      const reqId = ++latest
      try {
        const snapshot = await fetchSnapshot()
        if (disposed || reqId !== latest) return // 오래됐거나 unmount됨
        apply(snapshot)
      } catch (err) {
        if (disposed || reqId !== latest) return
        onError?.(err) // 상태 그대로 유지(빈 결과로 덮지 않음)
      }
    },
    dispose() {
      disposed = true
    },
  }
}
