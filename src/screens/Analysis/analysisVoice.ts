/* =====================================================================
   MODE · 분석 화면 말투 템플릿 (Phase 9A · 표시 전용, 순수 함수)
   개인용 앱 톤 — 쉽고 직설적이며 가끔 유쾌하게. 새 분석 기준/임계값을
   만들지 않는다. 엔진이 이미 준 evidence·시간창·반복 근거를 "문장 강도"에만
   연결한다. 결정론적(랜덤 없음).
   ===================================================================== */
import type { AnalysisMetric, EffectWindow, EvidenceLevel, FlowDomain } from '../../engine'
import type { FlowDriverCard } from '../../data/services/patternAnalysisService'

export type VoiceStrength = 'strong' | 'medium' | 'weak'

/* ---- 한국어 조사 helper (받침 유무로 결정) ---- */
function hasBatchim(word: string): boolean {
  if (!word) return false
  const c = word.charCodeAt(word.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
}
const wa = (w: string) => w + (hasBatchim(w) ? '과' : '와')
const iga = (w: string) => w + (hasBatchim(w) ? '이' : '가')

/* ---- metric → 사람 말 ---- */
const METRIC_STRONG_VERB: Record<AnalysisMetric, string> = {
  emotional: '멘탈이 크게 흔들리는',
  sleep: '잠이 망가지는',
  appetite: '식욕이 요동치는',
  body: '몸 상태가 무너지는',
  rhythm: '컨디션이 무너지는',
  cycle: '주기 영향이 커지는',
  event: '기록이 몰리는',
}
const METRIC_PAST_DAY: Record<AnalysisMetric, string> = {
  emotional: '멘탈이 흔들린',
  sleep: '잠을 설친',
  appetite: '식욕이 튄',
  body: '몸이 힘든',
  rhythm: '컨디션이 처진',
  cycle: '주기 영향이 큰',
  event: '기록이 많은',
}
const METRIC_COLLAPSE: Record<AnalysisMetric, string> = {
  emotional: '멘탈 붕괴',
  sleep: '수면 붕괴',
  appetite: '식욕 폭발',
  body: '몸 저하',
  rhythm: '컨디션 저하',
  cycle: '주기 영향',
  event: '기록 몰림',
}
const WINDOW_NAT: Record<EffectWindow, string> = {
  same_day: '같은 날',
  previous_day: '그 다음날',
  recent_3_days: '그 뒤 며칠간',
  recent_7_days: '그 주 동안',
}

/**
 * 문장 강도 판정 — 새 임계값 없이 엔진 evidence + 시간창만 사용.
 * - weak: evidence 'reference'(자료 참고 수준) → 기본 화면에서 숨김.
 * - strong: 반복/충분 근거 + 시간 순서 분명(같은 날 아님) → 직설 인과 허용.
 * - medium: 그 외.
 */
export function factorStrength(evidence: EvidenceLevel, window: EffectWindow): VoiceStrength {
  if (evidence === 'reference') return 'weak'
  if ((evidence === 'sufficient' || evidence === 'repeated') && window !== 'same_day') return 'strong'
  return 'medium'
}

export interface FactorVoiceInput {
  title: string
  metric: AnalysisMetric
  window: EffectWindow
  evidence: EvidenceLevel
}

/** 요인 패턴을 자연어 한 문장으로. 같은 날 관계는 절대 "X 때문에 Y"로 쓰지 않는다. */
export function factorPhrase(f: FactorVoiceInput): { strength: VoiceStrength; text: string } {
  const strength = factorStrength(f.evidence, f.window)
  const label = f.title
  if (f.window === 'same_day') {
    // 방향 모름 → 동시 발생만. 인과 단정 금지, 장황한 면책문도 없음.
    return { strength, text: `${wa(label)} ${iga(METRIC_COLLAPSE[f.metric])} 같은 날 같이 터졌어요.` }
  }
  if (strength === 'strong') {
    return { strength, text: `${label} 때문에 ${WINDOW_NAT[f.window]} ${METRIC_STRONG_VERB[f.metric]} 패턴이 반복됐어요.` }
  }
  return { strength, text: `${label} 뒤 ${METRIC_PAST_DAY[f.metric]} 날이 많았어요.` }
}

/* ---- 에피소드 트리거 한 줄 (유쾌 라벨, 카드당 1회, 강제 아님) ---- */
export interface EpisodeTriggerInput {
  /** 상위 선행 신호 라벨(먼저 보인 변화 + 전날 추가된 신호). */
  precursors: string[]
  /** 나빠진 뒤 행동 라벨. */
  afters: string[]
}

/** 에피소드 요약 위에 얹는 개인용 유머 트리거 문장. 없으면 null. */
export function episodeTrigger(inp: EpisodeTriggerInput): string | null {
  const p = inp.precursors.filter(Boolean)
  if (p.length >= 2) return `이번 정병 트리거는 ${wa(p[0])} ${p[1]} 조합이었어요.`
  if (p.length === 1) return `이번 정병 트리거는 ${p[0]} 쪽이 컸어요.`
  if (inp.afters.filter(Boolean).length > 0) return '이번엔 원인이라기보다 무너진 뒤 생긴 후폭풍에 가까워요.'
  return null
}

/* ---- 사건 전후 변화 곡선 요약 한 문장 (9B-2A) ---- */
const METRIC_NOUN: Record<AnalysisMetric, string> = {
  emotional: '멘탈',
  sleep: '잠',
  appetite: '식욕',
  body: '몸 상태',
  rhythm: '컨디션',
  cycle: '주기 영향',
  event: '기록',
}
const METRIC_AFTER_VERB: Record<AnalysisMetric, string> = {
  emotional: '흔들렸어요',
  sleep: '망가졌어요',
  appetite: '요동쳤어요',
  body: '나빠졌어요',
  rhythm: '무너졌어요',
  cycle: '커졌어요',
  event: '몰렸어요',
}
const RESPONSE_DIFF = 8 // 기존 factor 최소 효과(MIN_FACTOR_EFFECT)와 동일 기준

export interface EventCurveInput {
  title: string
  metric: AnalysisMetric
  points: { rel: number; mean?: number }[]
  baseline: number
}

/** 사건 전후 곡선을 자연어 한 문장으로. 같은 날 관계에 새 인과 방향을 만들지 않는다. */
export function eventResponseSentence(inp: EventCurveInput): string {
  const get = (rel: number) => inp.points.find((p) => p.rel === rel)?.mean
  const avg = (rels: number[]) => {
    const v = rels.map(get).filter((x): x is number => x !== undefined)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  const after = avg([1, 2, 3])
  const before = avg([-3, -2, -1])
  const day0 = get(0)
  const noun = iga(METRIC_NOUN[inp.metric])
  const verb = METRIC_AFTER_VERB[inp.metric]

  const afterUp = after !== undefined && after - inp.baseline >= RESPONSE_DIFF
  const beforeUp = before !== undefined && before - inp.baseline >= RESPONSE_DIFF
  const day0Up = day0 !== undefined && day0 - inp.baseline >= RESPONSE_DIFF

  if (beforeUp && afterUp) return `${inp.title} 전부터 ${noun} 안 좋았고, 이후에도 이어졌어요.`
  if (afterUp && day0Up && after !== undefined && (day0 as number) >= after)
    return `${inp.title} 당일과 다음 날 ${noun} 가장 크게 ${verb}`
  if (afterUp) return `${inp.title} 뒤 1~3일 동안 ${noun} 평소보다 더 ${verb}`
  if (day0Up) return `${inp.title} 당일 ${noun} 가장 크게 ${verb}`
  if (beforeUp) return `${inp.title} 전부터 ${noun} 안 좋은 편이었어요.`
  return '사건 전후로 뚜렷한 변화는 없었어요.'
}

/* ---- 흐름을 바꾼 누적 요인 문장 (9G) ---- */
const FLOW_DOMAIN_LABEL: Record<FlowDomain, string> = {
  emotional: '감정',
  appetite: '식욕',
  sleep: '수면',
  body: '몸 상태',
  function: '생활기능',
}

function joinDomains(domains: FlowDomain[]): string {
  const labels = domains.map((d) => FLOW_DOMAIN_LABEL[d])
  if (labels.length === 0) return ''
  if (labels.length === 1) return iga(labels[0])
  return `${wa(labels[0])} ${iga(labels[labels.length - 1])}`
}

/**
 * 소모 흐름 앞에 반복해 쌓인 요인을 한 문장으로. 근거 수치·신뢰도·"추정"은 넣지 않는다.
 * 겹침 > 누적(2일↑) > 단일 순으로 표현.
 */
/** 사건 라벨을 문장에 자연스럽게. "마감/압박이 있었음" → "마감이나 압박". */
function cleanDriverLabel(label: string): string {
  let s = label.trim()
  s = s.replace(/(이|가|을|를)?\s*(있었음|있었어요|했음|함|됐음|생김|받음)$/, '').trim()
  s = s.replace(/\s*\/\s*/g, '이나 ')
  return s || label.trim()
}

export function flowDriverSentence(card: FlowDriverCard): string {
  const label = cleanDriverLabel(card.label)
  const lead = joinDomains(card.affectedDomains)
  const tail = lead ? `${lead} 먼저 내려갔어요.` : '소모 흐름이 시작되는 경우가 반복됐어요.'
  if (card.overlapLabels.length > 0) {
    return `${wa(label)} ${iga(cleanDriverLabel(card.overlapLabels[0]))} 겹친 뒤 ${tail}`
  }
  if (card.cumulative) {
    return `${iga(label)} 2일 이상 이어진 뒤 ${tail}`
  }
  return `${label} 뒤 ${tail}`
}
