/* =====================================================================
   MODE · Rhythm "반복해서 나타난 큰 흐름" 카드 (순수 helper)
   완성된 EpisodeInsightSnapshot에서 snapshot.repeatedMotifs만 소비해, 여러 번
   되풀이된 큰 흐름을 사람말 카드로 바꾼다. 최근 에피소드·현재 진행·회복/남은 변화·
   다음 변화 예측은 이 화면에서 다루지 않는다(반복 구조만).

   ⚠️ 계산 엔진/서비스/repository를 부르지 않는다(입력 snapshot만 사용).
   ⚠️ 내부 key/점수/confidence/evidence/확률/진단/예측을 노출하지 않는다.
   ⚠️ completionConfirmedDate를 쓰지 않는다 — 시작일(sequenceStartDate)만 보여준다.
   ⚠️ 서비스가 이미 제외한 것(요일·생리주기·같은 사건)은 다시 판단하지 않는다.
   ===================================================================== */
import type { ISODate } from '../../data/models'
import type { RepeatedEpisodeMotif } from '../../engine'
import { areSemanticallyOverlappingSignals } from '../../engine'
import type { EpisodeInsightSnapshot } from '../../data/services/episodeInsightService'
import { MIND_SIGNAL_LABEL } from '../../data/catalog/mindSignals'
import { SLEEP_ISSUE_LABEL } from '../../data/catalog/lastNightSleep'

/** 반복 흐름 카드 하나(사람말 한 문장 + 실제 시작일 줄). */
export interface RepeatedFlowCard {
  /** 되풀이된 순서 한 문장. */
  sentence: string
  /** 실제로 언제 시작됐는지(최근 최대 3번). */
  dates: string
}

const MAX_CARDS = 2

/* ---------------------------------------------------------------------
   사람말 조각표(반복 흐름 전용). Analysis와 같은 말투를 쓰되, 이 화면이 필요한
   최소한만 둔다. clause=과거 연결어간(고/어요가 붙는다).
   --------------------------------------------------------------------- */
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
/** 마지막 단계 상태는 "…해졌어요"처럼 변화가 도착한 말투로 마무리(있을 때만). */
const STATE_BECAME: Record<string, string> = {
  state_mind_busy: '머리가 복잡해졌',
  state_daily_tasks_hard: '평소 하던 일이 버거워졌',
  state_people_hard: '사람을 대하기 버거워졌',
  state_focus_hard: '집중하기 어려워졌',
  state_body_uncomfortable: '몸이 불편해졌',
  state_appetite_changed: '먹고 싶은 정도가 평소와 달라졌',
}
/** 수면은 카탈로그가 과해 간결 어간으로 보완. */
const SLEEP_CLAUSE: Record<string, string> = {
  bedtime_delay: '자는 걸 미뤘',
  phone_sleep_delay: '폰을 보며 잠을 미뤘',
}
/** "… 다음 날/뒤"로 잇는 관형형(있을 때만). */
const ADNOMINAL: Record<string, string> = {
  thought_loop: '같은 생각이 계속 맴돈',
  worrying: '걱정이 이어진',
  mind_would_not_rest: '머리가 쉬지 않은',
  too_many_thoughts: '여러 생각이 몰린',
  sensory_overload: '자극이 버거웠던',
  no_desire: '의욕이 나지 않던',
  hard_to_start: '시작하기 어려웠던',
  bedtime_delay: '자는 걸 미룬',
  sleep_late: '늦게 잠든',
  phone_sleep_delay: '폰을 보며 잠을 미룬',
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
/** 마지막 단계의 마무리 어간(상태면 "…해졌", 그 외엔 연결 어간과 동일). */
function terminalClauseFor(key: string): string | null {
  return STATE_BECAME[key] ?? clauseFor(key)
}

const COUNT_WORD = ['', '한', '두', '세', '네', '다섯', '여섯']
const countWord = (n: number) => COUNT_WORD[n] ?? `${n}`
function lagWord(n: number): string {
  return n === 0 ? '같은 날' : n === 1 ? '다음 날' : n === 2 ? '이틀 뒤' : n === 3 ? '사흘 뒤' : `${n}일 뒤`
}

const ymd = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
/** 시작일 한 줄(달은 늘 표시, 다른 해면 연도 포함). */
function fmtStart(iso: ISODate, baseYear: number): string {
  const { y, m, d } = ymd(iso)
  return `${y !== baseYear ? `${y}년 ` : ''}${m}월 ${d}일`
}

/**
 * presentation 방어: 사람말로 못 바꾸거나(알 수 없는 key), 의미상 같은 신호뿐이거나,
 * 같은 날 동시발생만인 반복은 보여주지 않는다. (서비스가 이미 제외한 요일·주기·같은
 * 사건은 여기서 다시 판단하지 않는다 — snapshot에 남은 것만 소비한다.)
 */
function isPresentableMotif(m: RepeatedEpisodeMotif): boolean {
  if (m.sequenceKeys.length < 2) return false
  if (m.sequenceKeys.some((k) => clauseFor(k) === null)) return false // 알 수 없는/사람말 불가 key
  // 의미상 겹치는 신호를 접었을 때 서로 다른 변화가 2개 미만이면 뻔한 반복.
  const distinct: string[] = []
  for (const k of m.sequenceKeys) {
    if (!distinct.some((d) => areSemanticallyOverlappingSignals(d, k))) distinct.push(k)
  }
  if (distinct.length < 2) return false
  if (m.typicalLagRanges.every((r) => r.max === 0)) return false // 같은 날 동시발생만
  return true
}

/** 되풀이된 순서 한 문장. */
function buildSentence(m: RepeatedEpisodeMotif): string {
  const clauses = m.sequenceKeys.map((k) => clauseFor(k)!)
  const cw = countWord(m.occurrenceCount)

  const r0 = m.typicalLagRanges[0]
  const single0 = r0.min === r0.max
  const adn0 = single0 ? ADNOMINAL[m.sequenceKeys[0]] : undefined
  // "…맴돌았고, 다음 날" 대신 "…맴돈 다음 날"처럼 관형형으로 자연스럽게 잇는다.
  const lead = adn0
    ? `${adn0} ${lagWord(r0.min)}`
    : `${clauses[0]}고, ${single0 ? lagWord(r0.min) : `${r0.min}~${r0.max}일 뒤`}`

  let body: string
  if (m.sequenceKeys.length >= 3) {
    const r1 = m.typicalLagRanges[1]
    const step2 = r1.min === r1.max ? lagWord(r1.min) : `그 뒤 ${r1.min}~${r1.max}일 안에`
    body = `${lead} ${clauses[1]}고, ${step2} ${terminalClauseFor(m.sequenceKeys[2])}어요.`
  } else {
    body = `${lead} ${terminalClauseFor(m.sequenceKeys[1])}어요.`
  }
  return `최근 ${cw} 번의 비슷한 흐름에서는 ${body}`
}

/** 실제로 언제 시작됐는지 줄(최근 최대 3번의 sequenceStartDate). */
function buildDates(m: RepeatedEpisodeMotif): string {
  // occurrences는 episodeEndDate 오름차순 — 최근 최대 3개를 시작일 순으로 보여준다.
  const latest = m.occurrences.slice(-3)
  const starts = latest.map((o) => o.sequenceStartDate).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const baseYear = ymd(starts[starts.length - 1]).y
  const joined = starts.map((s) => fmtStart(s, baseYear)).join(' · ')
  // 4번 이상 되풀이됐으면 "최근에는"으로 최근 몇 번만 보여준다는 걸 밝힌다.
  const prefix = m.occurrenceCount >= 4 ? '최근에는 ' : ''
  return `${prefix}${joined}에 시작됐어요.`
}

/**
 * snapshot → 반복 흐름 카드(최대 2개). repeatedMotifs만 소비한다.
 * 보여줄 반복이 없으면 빈 배열(화면은 섹션 전체를 숨긴다).
 */
export function presentRhythmRepeatedFlow(snapshot: EpisodeInsightSnapshot): RepeatedFlowCard[] {
  return snapshot.repeatedMotifs
    .filter(isPresentableMotif)
    .slice(0, MAX_CARDS)
    .map((m) => ({ sentence: buildSentence(m), dates: buildDates(m) }))
}
