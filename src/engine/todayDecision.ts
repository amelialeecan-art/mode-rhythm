/* =====================================================================
   MODE · Today 상태 설명 + 오늘의 결정 1개 (순수 함수 · step3 · 표시 전용)
   stateDomains(영역별 분리 해석)만으로 오늘 상태를 "대비"로 설명하고,
   기존 결과(recentFlow·회복 분석)를 조합해 대표 행동 하나만 고른다.

   ⚠️ 새 분석 기준/임계값을 만들지 않는다. stateDomains 공식, recentFlow/회복 판정은
   건드리지 않는다. 여기서는 이미 계산된 값을 "문장/선택"에만 연결한다.

   방향 주의(절대 뒤섞지 말 것):
   - kind:'capacity' → 값이 낮을수록 어려움(감정 안정감·몸 에너지·머릿속 여유·집중·사회 여유)
   - kind:'strain'   → 값이 높을수록 어려움(감정 부담·수면·식욕·몸 불편·생활기능)
   숫자는 사용자 화면에 노출하지 않는다.
   ===================================================================== */
import type { DailyLog, EmotionCode, EmotionImpactLevel } from '../data/models'
import type { DailyStateDomains, DomainReading } from './stateDomains'
import type { RecentFlow, FlowDomain } from './recentFlow'
import type { RecoveryActionInsight } from './recovery'

/* 어려움 정도(0~100, 높을수록 어려움). capacity/strain 방향을 여기서 한 번만 뒤집는다. */
function difficulty(r: DomainReading | undefined): number | undefined {
  if (!r) return undefined
  return r.kind === 'capacity' ? 100 - r.value : r.value
}

// held(유지) / dropped(떨어짐) 경계. 그 사이는 mid(조금).
const HELD_MAX = 42
const HARD_MIN = 58

/* ---- 영역별 문장 조각(과거형 어간 — 고/지만/어요에 붙는다) ---- */
interface ClausePack {
  held: string
  dropped: string
  mid: string
}
const CLAUSE: Partial<Record<keyof DailyStateDomains, ClausePack>> = {
  emotionalStability: { held: '감정은 대체로 안정적이었', dropped: '감정이 많이 흔들렸', mid: '감정이 조금 흔들렸' },
  bodyEnergy: { held: '몸 에너지는 괜찮았', dropped: '몸 에너지가 낮았', mid: '몸 에너지가 조금 낮았' },
  mentalSpace: { held: '머릿속은 여유가 있었', dropped: '머릿속이 복잡했', mid: '머릿속이 조금 복잡했' },
  focus: { held: '집중력은 유지됐', dropped: '집중이 흐트러졌', mid: '집중이 조금 흐트러졌' },
  socialCapacity: { held: '사람을 대할 여유는 있었', dropped: '사람을 대할 여유가 떨어졌', mid: '사람을 대할 여유가 조금 적었' },
  sleep: { held: '수면은 괜찮았', dropped: '수면이 부족했', mid: '수면이 조금 부족했' },
  appetite: { held: '식욕은 안정적이었', dropped: '식욕이 흔들렸', mid: '식욕이 조금 흔들렸' },
  bodyDiscomfort: { held: '몸은 편안했', dropped: '몸에 불편한 신호가 있었', mid: '몸이 조금 불편했' },
  functionLevel: { held: '생활기능은 유지됐', dropped: '일상 기능이 버거웠', mid: '일상 기능이 조금 버거웠' },
}

const EMOTION_NOUN: Record<EmotionCode, string> = {
  sensitive: '예민함',
  irritated: '짜증',
  angry: '화',
  anxious: '불안',
  down: '가라앉은 기분',
  tearful: '울컥한 마음',
  lethargic: '무기력함',
  other: '힘든 감정',
}
const IMPACT_ADVERB: Record<EmotionImpactLevel, string> = {
  passing: '잠깐',
  brief: '잠깐',
  repeated: '여러 번',
  most_day: '하루 대부분',
}

/** 두드러진 감정 → 부담 조각. 감정을 골랐으면 크기와 무관하게 표현한다(부담은 안정감과 별개 축). */
function burdenClause(codes: EmotionCode[] | undefined, impact: EmotionImpactLevel | undefined): string | undefined {
  const list = codes ?? []
  if (list.length === 0) return undefined
  const nouns = list.slice(0, 2).map((c) => EMOTION_NOUN[c]).join('·')
  const adverb = impact ? `${IMPACT_ADVERB[impact]} ` : ''
  return `${nouns} 같은 감정이 ${adverb}영향을 줬`
}

interface Signal {
  clause: string
  polarity: 'held' | 'dropped'
  extremeness: number // |diff-50|, 클수록 우선
  emotion?: boolean
}

/**
 * 오늘 상태를 영역 대비로 설명한다(1~2문장). 유지되는 영역과 떨어진 영역을 함께 보여준다.
 * 감정 안정감과 감정 부담은 서로 상쇄/병합하지 않고 각각 조각으로 남긴다.
 * 입력이 거의 없으면 빈 배열(억지 문장 금지). 숫자는 노출하지 않는다.
 */
export function describeTodayState(domains: DailyStateDomains, log?: Pick<DailyLog, 'emotionCodes' | 'emotionImpactLevel'>): string[] {
  const signals: Signal[] = []

  // 감정은 두 축을 따로. 안정감(수용력) + 부담(두드러진 감정) — 절대 하나로 합치지 않는다.
  const stab = domains.emotionalStability
  if (stab) {
    const diff = 100 - stab.value
    const c = CLAUSE.emotionalStability!
    const clause = diff >= HARD_MIN ? c.dropped : diff <= HELD_MAX ? c.held : c.mid
    signals.push({ clause, polarity: diff >= 50 ? 'dropped' : 'held', extremeness: Math.abs(diff - 50) + 10, emotion: true })
  }
  const burden = burdenClause(log?.emotionCodes, log?.emotionImpactLevel)
  if (burden) signals.push({ clause: burden, polarity: 'dropped', extremeness: 60, emotion: true })

  // 그 외 영역 — 확실히 유지/떨어진 것만(근처 중립은 생략, 미입력은 언급 안 함).
  const others: (keyof DailyStateDomains)[] = ['bodyEnergy', 'mentalSpace', 'focus', 'sleep', 'appetite', 'bodyDiscomfort', 'functionLevel', 'socialCapacity']
  for (const key of others) {
    const diff = difficulty(domains[key])
    if (diff === undefined) continue
    const ex = Math.abs(diff - 50)
    if (ex < 12) continue // 뚜렷하지 않으면 억지로 넣지 않는다
    const c = CLAUSE[key]!
    const clause = diff >= HARD_MIN ? c.dropped : diff <= HELD_MAX ? c.held : c.mid
    signals.push({ clause, polarity: diff >= 50 ? 'dropped' : 'held', extremeness: ex })
  }

  if (signals.length === 0) return []

  // 감정 신호는 유지하고, 나머지는 뚜렷한 순으로 채워 총 3개까지.
  const emotion = signals.filter((s) => s.emotion)
  const rest = signals.filter((s) => !s.emotion).sort((a, b) => b.extremeness - a.extremeness)
  const chosen = [...emotion, ...rest].slice(0, 3)

  const held = chosen.filter((s) => s.polarity === 'held').map((s) => s.clause)
  const dropped = chosen.filter((s) => s.polarity === 'dropped').map((s) => s.clause)

  if (held.length && dropped.length) return [`${held.join('고 ')}지만 ${dropped.join('고 ')}어요.`]
  if (dropped.length) return [`${dropped.join('고 ')}어요.`]
  return [`${held.join('고 ')}어요.`]
}

/* =====================================================================
   오늘의 결정 1개
   ===================================================================== */
export interface TodayDecision {
  /** 사용자에게 보여줄 단 하나의 문장. */
  text: string
  /** personal=개인 회복 근거 기반, default=기본 제안. */
  source: 'personal' | 'default'
  kind: 'exception' | 'basic_function' | 'depletion' | 'personal' | 'gentle'
}

export interface TodayDecisionInput {
  domains: DailyStateDomains
  isExceptionDay: boolean
  exceptionLabels?: string[]
  recentFlow?: RecentFlow | null
  /** 기존 회복 분석 결과(이미 엔진 기준을 통과한 후보만 들어온다). */
  recoveryRecs?: RecoveryActionInsight[]
}

/** 개인 회복 근거가 "기존 기준"을 통과했다고 볼 최소선(엔진 tier: personal_helper 이상). */
const PERSONAL_MIN_CONFIDENCE = 56

function qualifyingRec(recs: RecoveryActionInsight[] | undefined): RecoveryActionInsight | undefined {
  return (recs ?? []).find((r) => r.confidence >= PERSONAL_MIN_CONFIDENCE && r.combinedScore > 0)
}

const FLOW_DEPLETION_ACTION: Record<FlowDomain, string> = {
  emotional: '오늘은 큰 결정을 미루고 마음을 회복할 시간을 먼저 두세요.',
  sleep: '오늘은 수면 시간을 먼저 확보하세요.',
  appetite: '오늘은 다른 계획보다 규칙적인 한 끼를 먼저 챙기세요.',
  body: '오늘은 무리하지 말고 몸을 회복할 여유를 먼저 두세요.',
  function: '오늘은 해야 할 일을 줄이고 중요한 것 하나에 집중하세요.',
}

const isHard = (r: DomainReading | undefined): boolean => {
  const d = difficulty(r)
  return d !== undefined && d >= HARD_MIN
}

/**
 * 오늘의 대표 행동 하나. 우선순위:
 *  1) 예외일 안전 처리  2) 가장 크게 떨어진 기본 기능  3) 최근에도 소모 중인 영역
 *  4) 비슷한 상태에서 도움이 됐던 개인 회복 행동  5) 근거 없으면 부담 낮은 기본 행동
 * 후보가 여럿이어도 하나만 반환한다. 입력이 거의 없으면 null.
 */
export function selectTodayDecision(input: TodayDecisionInput): TodayDecision | null {
  const { domains: d, isExceptionDay, exceptionLabels, recentFlow, recoveryRecs } = input

  // 1) 예외일 — 평소 소모/주기로 해석하지 않고 회복·기본생활 중심(진단·치료 문장 금지).
  if (isExceptionDay) {
    const prefix = exceptionLabels && exceptionLabels.length > 0 ? `오늘은 ${exceptionLabels.join('·')} 기록이 있어` : '오늘은 예외 기록이 있어'
    return { text: `${prefix} 무리한 운동이나 할 일을 늘리기보다 회복과 기본 생활을 먼저 챙기세요.`, source: 'default', kind: 'exception' }
  }

  // 2) 오늘 가장 크게 떨어진 기본 기능 (조합 우선 → 단일 최악)
  const fnDiff = difficulty(d.functionLevel) ?? 0
  if (fnDiff >= 78) return { text: '오늘은 해야 할 일을 하나만 남기고 나머지는 미뤄두세요.', source: 'default', kind: 'basic_function' }
  if (isHard(d.sleep) && isHard(d.bodyEnergy)) return { text: '오늘은 운동 강도를 높이기보다 수면 시간을 먼저 확보하세요.', source: 'default', kind: 'basic_function' }
  if (isHard(d.appetite) && fnDiff >= HARD_MIN) return { text: '오늘은 다른 계획보다 규칙적인 한 끼를 먼저 챙기세요.', source: 'default', kind: 'basic_function' }
  if (isHard(d.socialCapacity) && isHard(d.mentalSpace))
    return { text: '오늘은 퇴근 후 일정을 더 늘리지 말고 혼자 쉬는 시간을 먼저 확보하세요.', source: 'default', kind: 'basic_function' }

  // 단일 최악 영역(어려움 최댓값) → 해당 기본 행동
  const singles: { key: keyof DailyStateDomains; text: string }[] = [
    { key: 'functionLevel', text: '오늘은 해야 할 일을 줄이고 중요한 것 하나에 집중하세요.' },
    { key: 'sleep', text: '오늘은 수면 시간을 먼저 확보하세요.' },
    { key: 'bodyEnergy', text: '오늘은 무리하지 말고 몸을 회복할 여유를 두세요.' },
    { key: 'socialCapacity', text: '오늘은 사람을 많이 만나는 일정을 줄이고 혼자 쉬는 시간을 확보하세요.' },
    { key: 'mentalSpace', text: '오늘은 새로운 일을 벌이기보다 지금 있는 일부터 하나씩 정리하세요.' },
    { key: 'appetite', text: '오늘은 규칙적인 한 끼를 먼저 챙기세요.' },
    { key: 'bodyDiscomfort', text: '오늘은 몸 신호에 맞춰 무리한 일정을 줄이세요.' },
    { key: 'focus', text: '오늘은 집중이 필요한 큰 일보다 가벼운 일부터 시작하세요.' },
  ]
  let worst: { text: string; diff: number } | null = null
  for (const s of singles) {
    const diff = difficulty(d[s.key])
    if (diff !== undefined && diff >= HARD_MIN && (!worst || diff > worst.diff)) worst = { text: s.text, diff }
  }
  // 감정도 크게 흔들렸으면 기본 기능 후보에 포함
  if (isHard(d.emotionalStability) && (!worst || (difficulty(d.emotionalStability) ?? 0) > worst.diff)) {
    worst = { text: '오늘은 큰 결정을 잠시 미루고 마음이 가라앉을 시간을 두세요.', diff: difficulty(d.emotionalStability) ?? 0 }
  }
  if (worst) return { text: worst.text, source: 'default', kind: 'basic_function' }

  // 3) 최근에도 계속 소모 중인 영역 (오늘 급성 저하는 없지만 흐름이 소모 중)
  if (recentFlow && recentFlow.status === 'depleting' && recentFlow.leading.length > 0) {
    return { text: FLOW_DEPLETION_ACTION[recentFlow.leading[0]], source: 'default', kind: 'depletion' }
  }

  // 4) 비슷한 상태에서 도움이 됐던 개인 회복 행동 (기존 기준 통과분만)
  const rec = qualifyingRec(recoveryRecs)
  if (rec) {
    return {
      text: `비슷한 상태에서는 ${rec.actionLabel} 기록이 있을 때 도움이 된 편이었어요. 오늘도 ${rec.actionLabel}을 먼저 챙겨보세요.`,
      source: 'personal',
      kind: 'personal',
    }
  }

  // 5) 근거가 없을 때 — 부담 낮은 기본 행동. 단, 상태 입력이 거의 없으면 null(억지 금지).
  const anyInput = Object.values(d).some((v) => v !== undefined)
  if (!anyInput) return null
  return { text: '오늘은 새로운 일을 늘리기보다 지금 상태를 유지하는 데 집중하세요.', source: 'default', kind: 'gentle' }
}
