/* =====================================================================
   MODE · Episode Insight presentation (순수 helper)
   EpisodeInsightSnapshot(구조 데이터)를 화면이 그대로 쓸 수 있는 사람말 카드로
   바꾼다. 화면이 엔진 내부 구조를 다시 해석하지 않도록 여기서 문장을 완성한다.

   ⚠️ 내부 key/카테고리명·점수·confidence·evidence·확률·진단·예측을 노출하지 않는다.
   ⚠️ 계산 엔진/서비스/repository를 부르지 않는다(입력 snapshot만 사용).
   ⚠️ 수면 날짜는 엔진이 정렬한 값을 그대로 쓴다(여기서 하루 가감 금지).
   ===================================================================== */
import type { ISODate } from '../../data/models'
import type { EpisodeTimeline, RepeatedEpisodeMotif, MotifMatch, TimelineRun } from '../../engine'
import { areSemanticallyOverlappingSignals } from '../../engine'
import type { EpisodeInsightSnapshot } from '../../data/services/episodeInsightService'
import { MIND_SIGNAL_LABEL } from '../../data/catalog/mindSignals'
import { SLEEP_ISSUE_LABEL } from '../../data/catalog/lastNightSleep'

/** 카드 하나(제목 + 사람말 본문). */
export interface FlowCard {
  title: string
  lines: string[]
  /** 카드가 다루는 대략의 기간(사람말). 없으면 생략. */
  dateRangeText?: string
  /** 진행/미기록/완료 관련 짧은 상태 문장. 없으면 생략. */
  status?: string
}

export interface EpisodePresentation {
  recentFlow: FlowCard | null
  aftereffect: FlowCard | null
  recovery: FlowCard | null
  repeatedFlow: FlowCard | null
  currentMatch: FlowCard | null
}

/* ---------------------------------------------------------------------
   사람말 조각표. clause=과거 연결어간(고/어요/지만이 붙는다),
   topic=짧은 명사(먼저 줄고/더 남은 것 주어), recovered=회복 어간(+기 시작했).
   mind/sleep clause는 카탈로그 라벨에서 파생하고, 여기서는 보완·명사형만 둔다.
   --------------------------------------------------------------------- */
interface Phrase {
  clause?: string
  topic?: string
  recovered?: string
}
const PHRASE: Record<string, Phrase> = {
  // 직접 상태(카탈로그가 명사형이라 여기서 문장 어간을 둔다)
  state_tired: { clause: '몸이 쉽게 지쳤', topic: '몸이 쉽게 지치는 것', recovered: '몸이 덜 힘들어지' },
  state_mind_busy: { clause: '머리가 복잡했', topic: '복잡한 머릿속', recovered: '머리가 덜 복잡해지' },
  state_daily_tasks_hard: { clause: '평소 하던 일이 버거웠', topic: '평소 하던 일', recovered: '평소 하던 일이 덜 버거워지' },
  state_people_hard: { clause: '사람을 대하기 버거웠', topic: '사람을 대하는 일', recovered: '사람을 대하는 게 덜 버거워지' },
  state_focus_hard: { clause: '집중하기 어려웠', topic: '집중', recovered: '집중이 덜 흐트러지' },
  state_body_uncomfortable: { clause: '몸이 불편했', topic: '몸의 불편함', recovered: '몸이 덜 불편해지' },
  state_appetite_changed: { clause: '먹고 싶은 정도가 평소와 달랐', topic: '달라진 식욕', recovered: '식욕이 평소로 돌아오' },
  state_emotion_unsteady: { clause: '마음이 쉽게 흔들렸', topic: '흔들린 마음', recovered: '마음이 덜 흔들리' },
  state_emotions_linger: { clause: '예민함이나 짜증이 오래 갔', topic: '예민함이나 짜증', recovered: '마음이 덜 예민해지' },
  // 마음 신호 명사형(clause는 카탈로그에서 파생)
  thought_loop: { topic: '같은 생각' },
  worrying: { topic: '걱정' },
  mind_would_not_rest: { topic: '쉬지 않는 머릿속' },
  too_many_thoughts: { topic: '여러 생각' },
  tasks_on_mind: { topic: '떠오르는 할 일' },
  small_things_bothered: { topic: '신경 쓰이는 일' },
  sensory_overload: { topic: '버거운 자극' },
  no_desire: { topic: '가라앉은 의욕' },
  hard_to_start: { topic: '시작하기 어려움' },
  // 수면(과한 catalog 문장은 간결 clause로 보완)
  bedtime_delay: { clause: '자는 걸 미뤘' },
  phone_sleep_delay: { clause: '폰을 보며 잠을 미뤘' },
  sleep_late: {},
  sleep_onset_difficulty: {},
  intentional_wakefulness: {},
}

/**
 * 남은 변화 문장에서 수면 항목을 "…한 날/밤"처럼 자연스러운 주어로 만든다.
 * (문장 끝 "어요"만 지워 "늦어진 밤" 같은 어색한 명사구를 만들지 않는다.)
 */
const SLEEP_SUBJECT: Record<string, string> = {
  sleep_late: '늦게 잠든 날',
  bedtime_delay: '자는 걸 미룬 날',
  phone_sleep_delay: '폰을 보며 잠을 미룬 날',
  sleep_onset_difficulty: '잠들기 어려운 밤',
  sleep_waking: '자주 깬 밤',
  sleep_nightmare: '악몽을 꾼 밤',
  sleep_allnight: '밤을 새운 날',
  sleep_much: '너무 오래 잔 날',
  woke_late: '늦게 일어난 날',
  intentional_wakefulness: '일부러 깨어 있던 밤',
}
/** 남은 변화 주어(수면은 전용 표현, 그 외는 명사 topic). 없으면 null(문장 생략). */
const subjectFor = (key: string): string | null => SLEEP_SUBJECT[key] ?? topicFor(key)
/** 종료일이 확인되지 않은 후속의 마무리. 늦은 잠 계열은 "그 뒤에도", 나머지는 "더". */
const nonObservedTail = (key: string): string => (key === 'sleep_late' || key === 'woke_late' ? '그 뒤에도 이어졌어요.' : '더 이어졌어요.')

/** 최근 흐름 첫 신호를 "…기 시작했"으로 자연스럽게 여는 어간(있을 때만). */
const STARTED: Record<string, string> = {
  thought_loop: '같은 생각이 계속 맴돌',
  worrying: '걱정이 계속 이어지',
  mind_would_not_rest: '머리가 쉬지 않',
}
/** 반복 순서에서 "… 다음 날/뒤"로 잇는 관형형(있을 때만). */
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

/** 문장 연결 어간(고/어요/지만이 붙는 과거형). 사람말로 못 바꾸면 null(해당 항목 생략). */
function clauseFor(key: string): string | null {
  if (PHRASE[key]?.clause) return PHRASE[key]!.clause!
  const m = MIND_SIGNAL_LABEL.get(key)
  if (m?.endsWith('어요')) return m.slice(0, -2)
  const s = SLEEP_ISSUE_LABEL.get(key)
  if (s?.endsWith('어요')) return s.slice(0, -2)
  return null
}
const topicFor = (key: string): string | null => PHRASE[key]?.topic ?? null
const recoveredFor = (key: string): string | null => PHRASE[key]?.recovered ?? null

/* ---- 날짜 사람말 ---- */
interface DateCtx {
  lastMonth?: number
  lastYear?: number
  baseYear: number
}
const ymd = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}
/** 한 날짜를 사람말로. 같은 달이면 월 생략, 다른 해면 연도 포함. ctx를 갱신한다. */
function fmtDate(iso: ISODate, ctx: DateCtx): string {
  const { y, m, d } = ymd(iso)
  const showYear = y !== ctx.baseYear
  const showMonth = showYear || m !== ctx.lastMonth || y !== ctx.lastYear
  ctx.lastMonth = m
  ctx.lastYear = y
  return `${showYear ? `${y}년 ` : ''}${showMonth ? `${m}월 ` : ''}${d}일`
}
const dayText = (iso: ISODate, ctx: DateCtx) => fmtDate(iso, ctx)
/** 최근 흐름의 달/해를 이미 아는 것으로 보는 컨텍스트(같은 달이면 월을 반복하지 않음). */
function flowDateCtx(ep: EpisodeTimeline): DateCtx {
  const { y, m } = ymd(ep.endDate)
  return { baseYear: y, lastMonth: m, lastYear: y }
}

const COUNT_WORD = ['', '한', '두', '세', '네', '다섯', '여섯']
const countWord = (n: number) => COUNT_WORD[n] ?? `${n}`
function lagWord(n: number): string {
  return n === 0 ? '같은 날' : n === 1 ? '다음 날' : n === 2 ? '이틀 뒤' : n === 3 ? '사흘 뒤' : `${n}일 뒤`
}
/** 은/는 조사(받침 유무). */
function topicWithParticle(topic: string): string {
  const last = topic.charCodeAt(topic.length - 1)
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
  return `${topic}${hasBatchim ? '은' : '는'}`
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const MAX_LEADING = 2
const MAX_FOLLOWUP = 3
const MAX_LINES = 3
const MAX_AFTEREFFECTS = 2
const MAJOR_SOURCES = new Set(['mind', 'sleep', 'state'])

/** 대표 run들(사람말 가능·의미중복 제거)을 시작일 순으로. */
function representativeRuns(ep: EpisodeTimeline): TimelineRun[] {
  const runByKey = new Map(ep.runs.map((r) => [r.key, r]))
  const keys = [...ep.leadingRunKeys.slice(0, MAX_LEADING), ...ep.followupRunKeys.slice(0, MAX_FOLLOWUP)]
  const chosen: string[] = []
  for (const k of keys) {
    if (!runByKey.has(k) || clauseFor(k) === null) continue // 사람말로 못 바꾸면 생략
    if (chosen.some((c) => areSemanticallyOverlappingSignals(c, k))) continue // 의미상 중복은 하나만
    chosen.push(k)
  }
  return chosen.map((k) => runByKey.get(k)!).sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.key < b.key ? -1 : 1))
}

/* ---- 3. 최근 흐름 ---- */
function buildRecentFlow(ep: EpisodeTimeline, hasAftereffect: boolean, hasRecovery: boolean): FlowCard | null {
  const reps = representativeRuns(ep)
  if (reps.length === 0) return null

  const ctx: DateCtx = { baseYear: ymd(ep.endDate).y }
  const lines: string[] = []
  let first = true
  // 시작 신호는 "…기 시작했", 나머지는 시작일 기준 "…부터"만(한 문장에 날짜 범위를 반복하지 않는다).
  const segment = (r: TimelineRun): string => {
    const started = first ? STARTED[r.key] : undefined
    first = false
    if (started) return `${fmtDate(r.startDate, ctx)}에 ${started}기 시작했`
    return `${fmtDate(r.startDate, ctx)}부터 ${clauseFor(r.key)}`
  }
  for (const group of chunk(reps, 2).slice(0, MAX_LINES)) {
    const parts = group.map(segment)
    lines.push(parts.length === 2 ? `${parts[0]}고, ${parts[1]}어요.` : `${parts[0]}어요.`)
  }

  // 정보 가치: 서로 다른 날짜 시작 / 여러 날 지속 / 남은 변화 / 회복 중 하나는 있어야 한다.
  const distinctStarts = new Set(reps.map((r) => r.startDate)).size
  const anyDuration = reps.some((r) => r.endDate > r.startDate)
  if (distinctStarts < 2 && !anyDuration && !hasAftereffect && !hasRecovery) return null

  const card: FlowCard = { title: '최근에 이어진 흐름', lines, dateRangeText: describeRange(ep.startDate, ep.endDate) }
  const status = ongoingStatus(ep, reps)
  if (status) card.status = status
  return card
}

function describeRange(start: ISODate, end: ISODate): string {
  const ctx: DateCtx = { baseYear: ymd(end).y }
  const s = fmtDate(start, ctx)
  if (end === start) return s
  const sy = ymd(start)
  const ey = ymd(end)
  const endText = ey.y === sy.y && ey.m === sy.m ? `${ey.d}일` : fmtDate(end, ctx)
  return `${s}부터 ${endText}까지`
}

/* ---- 7. 진행 중 / 미기록 구분 ---- */
function ongoingStatus(ep: EpisodeTimeline, reps: TimelineRun[]): string | undefined {
  if (ep.status !== 'ongoing') return undefined
  const majors = reps.filter((r) => MAJOR_SOURCES.has(r.source))
  if (majors.some((r) => r.endBoundary === 'range_edge')) return '최근 기록까지 이어졌어요.'
  if (majors.some((r) => r.endBoundary === 'missing_gap')) return '마지막 기록 뒤에는 흐름이 끝났는지 확인할 기록이 없어요.'
  if (ep.recovery.recoveryStartDate && !ep.completionConfirmedDate) return '돌아온 뒤 하루까지만 확인됐어요.'
  return undefined
}

/* ---- 5. 남은 변화(aftereffect) ---- */
function buildAftereffect(ep: EpisodeTimeline): FlowCard | null {
  const runByKeyEnd = new Map(ep.runs.map((r) => [`${r.key}|${r.endDate}`, r]))
  const lines: string[] = []
  for (const a of ep.aftereffects.slice(0, MAX_AFTEREFFECTS)) {
    const sSubject = subjectFor(a.sourceKey)
    const rSubject = subjectFor(a.remainingKey)
    if (!sSubject || !rSubject) continue // 사람말 주어가 없으면 생략
    const remainingRun = runByKeyEnd.get(`${a.remainingKey}|${a.remainingEndDate}`)
    const ctx = flowDateCtx(ep) // 최근 흐름과 같은 달이면 월을 반복하지 않는다
    const endedVerb = a.sourceKey.startsWith('state') ? '가라앉았' : '줄었'
    const sourcePart = `${topicWithParticle(sSubject)} ${dayText(a.sourceEndDate, ctx)}에 ${endedVerb}지만,`
    // 후속 종료가 observed일 때만 "N일까지 이어졌어요"로 확정. 아니면 확정하지 않는다.
    const tail = remainingRun && remainingRun.endBoundary === 'observed' ? `${dayText(a.remainingEndDate, ctx)}까지 이어졌어요.` : `${nonObservedTail(a.remainingKey)}`
    lines.push(`${sourcePart} ${topicWithParticle(rSubject)} ${tail}`)
  }
  if (lines.length === 0) return null
  return { title: '먼저 줄고, 더 남은 것', lines }
}

/* ---- 6. 회복 ---- */
function buildRecovery(ep: EpisodeTimeline): FlowCard | null {
  const rec = ep.recovery
  if (!rec.recoveryStartDate) return null
  const firstKey = rec.firstRecoveredKeys.find((k) => recoveredFor(k))
  if (!firstKey) return null

  const ctx = flowDateCtx(ep) // 최근 흐름과 같은 달이면 월을 반복하지 않는다
  let sentence = `${dayText(rec.recoveryStartDate, ctx)}에 ${recoveredFor(firstKey)}기 시작했`
  // 완료 확인일이 있으면(안정 2일) 종료 확인 문장을 이어붙인다 — recoveryStartDate와 섞지 않는다.
  if (ep.completionConfirmedDate) {
    sentence += `고, ${dayText(ep.completionConfirmedDate, ctx)}에 이 흐름이 끝난 것으로 확인됐어요.`
  } else {
    sentence += '어요.'
  }
  const lines = [sentence]

  // 나중에 돌아온 것이 따로 있으면 순서만 한 줄 더(예측/원인 아님).
  const laterKey = rec.laterRecoveredKeys.find((k) => topicFor(k))
  const firstTopic = topicFor(firstKey)
  if (laterKey && firstTopic) lines.push(`${firstTopic}이 먼저 돌아왔고, ${topicFor(laterKey)}은 그다음이었어요.`)

  return { title: '돌아오기 시작한 때', lines }
}

/* ---- 8. 반복된 흐름 ---- */
function buildRepeatedFlow(motifs: RepeatedEpisodeMotif[]): FlowCard | null {
  const motif = motifs.find((m) => isPresentableMotif(m))
  if (!motif) return null
  const clauses = motif.sequenceKeys.map(clauseFor)
  if (clauses.some((c) => c === null)) return null // 하나라도 사람말 불가면 카드 만들지 않음

  const cw = countWord(motif.occurrenceCount)
  const r0 = motif.typicalLagRanges[0]
  const single0 = r0.min === r0.max
  // "…맴돌았고, 다음 날" 대신 "…맴돈 다음 날"처럼 관형형으로 자연스럽게 잇는다.
  const adn0 = single0 ? ADNOMINAL[motif.sequenceKeys[0]] : undefined
  const lead = adn0 ? `${adn0} ${lagWord(r0.min)}` : `${clauses[0]}고, ${single0 ? lagWord(r0.min) : `${r0.min}~${r0.max}일 뒤`}`
  let body: string
  if (motif.sequenceKeys.length >= 3) {
    const r1 = motif.typicalLagRanges[1]
    const step2 = r1.min === r1.max ? lagWord(r1.min) : `그 뒤 ${r1.min}~${r1.max}일 안에`
    body = `${lead} ${clauses[1]}고, ${step2} ${clauses[2]}어요.`
  } else {
    body = `${lead} ${clauses[1]}어요.`
  }
  return { title: '반복해서 나타난 순서', lines: [`최근 ${cw} 번의 비슷한 흐름에서는 ${body}`] }
}

/** presentation 방어: 뻔한 2단계(의미중복·같은 날) 결과는 숨긴다. */
function isPresentableMotif(m: RepeatedEpisodeMotif): boolean {
  if (m.sequenceKeys.length < 2) return false
  if (m.sequenceKeys.length === 2) {
    if (areSemanticallyOverlappingSignals(m.sequenceKeys[0], m.sequenceKeys[1])) return false
    if (m.typicalLagRanges.every((r) => r.max === 0)) return false // 같은 날 동시발생만
  }
  return true
}

/* ---- 9. 진행 중 흐름의 현재 일치 ---- */
function buildCurrentMatch(matches: MotifMatch[]): FlowCard | null {
  // matchedKeys 2개 이상 + 미완(완전 일치는 반복 카드와 중복이라 숨김) 중 가장 긴 것.
  const usable = matches.filter((m) => m.matchedKeys.length >= 2 && !m.completeMatch)
  const best = usable.sort((a, b) => b.matchedKeys.length - a.matchedKeys.length)[0]
  if (!best) return null
  const clauses = best.matchedKeys.map(clauseFor)
  if (clauses.some((c) => c === null)) return null
  const adn0 = ADNOMINAL[best.matchedKeys[0]]
  // 2단계면 "…맴돈 뒤 …", 그 이상이면 절 연결로.
  const body =
    best.matchedKeys.length === 2 && adn0
      ? `${adn0} 뒤 ${clauses[1]}어요.`
      : clauses.map((c, i) => (i === 0 ? c : `그다음 ${c}`)).join('고, ') + '어요.'
  return { title: '이번에도 여기까지 같은 순서였어요', lines: [`이번에도 ${body}`] }
}

/**
 * snapshot → 사람말 카드 묶음. 화면은 이 결과만 렌더링하면 된다(엔진 재해석 없음).
 * 정보 가치가 없거나 사람말로 못 바꾸는 카드는 null.
 */
export function presentEpisodeInsight(snapshot: EpisodeInsightSnapshot): EpisodePresentation {
  const ep = snapshot.recentEpisode
  const aftereffect = ep ? buildAftereffect(ep) : null
  const recovery = ep ? buildRecovery(ep) : null
  const recentFlow = ep ? buildRecentFlow(ep, aftereffect !== null, recovery !== null) : null
  const repeatedFlow = buildRepeatedFlow(snapshot.repeatedMotifs)
  // 진행 중 흐름일 때만 현재 일치 카드.
  const currentMatch = ep && ep.status === 'ongoing' ? buildCurrentMatch(snapshot.currentMotifMatches) : null
  return { recentFlow, aftereffect, recovery, repeatedFlow, currentMatch }
}
