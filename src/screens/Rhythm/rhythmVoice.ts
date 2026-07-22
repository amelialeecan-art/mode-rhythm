/* =====================================================================
   MODE · 리듬 최근 일주일 비교 말투 (Phase 9B-1 · 순수 함수, 결정론적)
   최근 7일 vs 이전 28일 metric 비교를 자연어 한 문장으로. 내부 점수는 노출하지
   않는다(숫자는 화면 "근거 보기"에만). 새 임계값을 만들지 않고 표시 차이만.
   ===================================================================== */
import type { RhythmMetric, WeekCompareStat } from '../../data/services/rhythmService'
import type { FlowDomain, RecentFlow, PersonalRhythm, FlowState } from '../../engine'

export const RHYTHM_METRIC_LABEL: Record<RhythmMetric, string> = {
  emotional: '감정 흔들림',
  appetite: '식욕 흔들림',
  sleep: '수면 문제',
  body: '몸 불편',
  recovery: '회복 행동',
}

/** 최근/이전 차이를 유의미하게 볼 최소 폭(점). 기존 리듬 관찰과 동일. */
const DIFF_THRESHOLD = 8

function hasBatchim(word: string): boolean {
  if (!word) return false
  const c = word.charCodeAt(word.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
}
const iga = (w: string) => w + (hasBatchim(w) ? '이' : '가')
const eun = (w: string) => w + (hasBatchim(w) ? '은' : '는')
const gwa = (w: string) => w + (hasBatchim(w) ? '과' : '와')

/** 선택한 metric의 최근 일주일 비교 문장. 표본 부족이면 안내 문장. */
export function rhythmCompareSentence(metric: RhythmMetric, cmp: WeekCompareStat): string {
  if (!cmp.enough) return '아직 최근·평소를 비교하기엔 기록이 조금 적어요.'
  const label = RHYTHM_METRIC_LABEL[metric]
  const up = cmp.diff >= DIFF_THRESHOLD
  const down = cmp.diff <= -DIFF_THRESHOLD

  if (metric === 'recovery') {
    if (up) return '최근 일주일은 평소보다 회복 행동이 늘었어요.'
    if (down) return '최근 일주일은 평소보다 회복 행동이 줄었어요.'
    return '최근 일주일은 평소와 회복 행동이 비슷했어요.'
  }
  if (up) return `최근 일주일은 평소보다 ${iga(label)} 많았어요.`
  if (down) return `최근 일주일은 평소보다 ${iga(label)} 적었어요.`
  return '최근 일주일은 평소와 큰 차이가 없었어요.'
}

/* ---- 생리주기별 비교 문장 (9B-2B) ---- */
const CYCLE_TOPIC: Record<RhythmMetric, string> = {
  emotional: '감정',
  appetite: '식욕',
  sleep: '수면',
  body: '몸 상태',
  recovery: '회복',
}
const CYCLE_VERB: Record<RhythmMetric, string> = {
  emotional: '흔들렸어요',
  appetite: '요동쳤어요',
  sleep: '흔들렸어요',
  body: '나빠졌어요',
  recovery: '늘었어요',
}
const CYCLE_COLLAPSE: Record<RhythmMetric, string> = {
  emotional: '멘탈 붕괴',
  appetite: '식욕 폭발',
  sleep: '수면 붕괴',
  body: '몸 저하',
  recovery: '회복 변화',
}

export interface CycleCurvePoints {
  recent: { rel: number; mean?: number }[]
  previous: { rel: number; mean?: number }[]
  baseline: number
}

/** 최근 주기 vs 이전 3주기 평균을 자연어 한 문장으로. 실제 차이가 있을 때만 차이를 말한다. */
export function cycleCompareSentence(metric: RhythmMetric, c: CycleCurvePoints): string {
  const meanAt = (arr: { rel: number; mean?: number }[], rel: number) => arr.find((p) => p.rel === rel)?.mean
  const preMean = (arr: { rel: number; mean?: number }[]) => {
    const v = [-7, -6, -5, -4, -3, -2, -1].map((r) => meanAt(arr, r)).filter((x): x is number => x !== undefined)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  // 기준선+임계 이상으로 처음 올라간 상대날(가장 이른 날)
  const onset = (arr: { rel: number; mean?: number }[]) => {
    for (let r = -14; r <= 0; r++) {
      const m = meanAt(arr, r)
      if (m !== undefined && m - c.baseline >= DIFF_THRESHOLD) return r
    }
    return null
  }
  const topic = CYCLE_TOPIC[metric]

  if (metric === 'recovery') {
    const d = (preMean(c.recent) ?? 0) - (preMean(c.previous) ?? 0)
    if (d >= DIFF_THRESHOLD) return '이번 주기는 이전보다 회복 행동이 많았어요.'
    if (d <= -DIFF_THRESHOLD) return '이번 주기는 이전보다 회복 행동이 적었어요.'
    return '회복 행동은 이전 주기들과 거의 비슷했어요.'
  }

  const rPre = preMean(c.recent)
  const pPre = preMean(c.previous)
  if (rPre === undefined || pPre === undefined) return `${topic} 변화는 이전 주기와 비교하기엔 아직 일러요.`
  const diff = rPre - pPre

  if (diff >= DIFF_THRESHOLD) {
    if (pPre - c.baseline < DIFF_THRESHOLD) {
      return `생리 탓만 하기엔 억울해요. 이전 주기에는 같은 시기에도 ${iga(topic)} 비교적 안정적이었어요.`
    }
    const rOn = onset(c.recent)
    const pOn = onset(c.previous)
    if (rOn !== null && pOn !== null && rOn < pOn) {
      return `이번 주기는 생리 ${-rOn}일 전부터 ${iga(topic)} ${CYCLE_VERB[metric]}. 이전 주기보다 ${pOn - rOn}일쯤 빨랐어요.`
    }
    return `이번에는 생리 직전 ${iga(CYCLE_COLLAPSE[metric])} 이전 주기보다 강했어요.`
  }
  if (diff <= -DIFF_THRESHOLD) return `이번 주기는 이전보다 ${iga(topic)} 잠잠한 편이에요.`
  return `${topic} 변화는 이전 주기들과 거의 비슷했어요.`
}

/* ---- 최근 흐름 문장 (9D) ---- */
const FLOW_LABEL: Record<FlowDomain, string> = {
  emotional: '감정',
  appetite: '식욕',
  sleep: '수면',
  body: '몸 상태',
  function: '생활기능',
}

/** 영역 목록을 "A와 B가"처럼 이어 붙인다(마지막에 조사 붙임). */
function joinDomains(domains: FlowDomain[], josa: (w: string) => string): string {
  const labels = domains.map((d) => FLOW_LABEL[d])
  if (labels.length === 0) return ''
  if (labels.length === 1) return josa(labels[0])
  const head = labels.slice(0, -1).map((l) => gwa(l)).join(' ')
  return `${head} ${josa(labels[labels.length - 1])}`
}

/**
 * 최근 흐름 카드 문장. 방향(소모/회복/혼재/안정)과 먼저 변한 영역·유지 영역을
 * 결정론적으로 한 문장으로. 숫자·신뢰도·방어적 문구는 넣지 않는다.
 */
export function recentFlowSentence(flow: RecentFlow): string {
  const lead = joinDomains(flow.leading, iga)
  const hold = joinDomains(flow.holding, eun)

  if (flow.status === 'depleting') {
    const head = `최근 ${flow.lengthDays}일은 조금씩 소모되는 흐름이에요.`
    const first = lead ? ` ${lead} 먼저 내려갔고,` : ''
    const kept = hold ? ` ${hold} 평소 범위를 유지하고 있어요.` : first ? ' 나머지는 아직 버티고 있어요.' : ''
    return `${head}${first}${kept}`.trimEnd().replace(/,$/, '.')
  }
  if (flow.status === 'recovering') {
    const head = `최근 ${flow.lengthDays}일은 조금씩 회복되는 흐름이에요.`
    const first = lead ? ` ${lead} 먼저 올라왔고,` : ''
    const kept = hold ? ` ${hold} 평소 범위를 유지하고 있어요.` : first ? ' 나머지도 천천히 따라오고 있어요.' : ''
    return `${head}${first}${kept}`.trimEnd().replace(/,$/, '.')
  }
  if (flow.status === 'mixed') {
    return `최근 ${flow.lengthDays}일은 영역마다 방향이 달라요. 어떤 영역은 내려가고 어떤 영역은 올라오는 중이에요.`
  }
  return '최근에는 큰 변화 없이 안정적인 흐름이에요.'
}

/* ---- 나의 반복 흐름 문장 (9H) ---- */
const FLOW_STATE_LABEL: Record<FlowState, string> = {
  stable: '안정',
  depleting: '소모',
  recovering: '회복',
  mixed: '혼재',
}

/**
 * 개인 반복 흐름 카드 문장(1~2문장). 신뢰도 숫자·근거 횟수·"추정"·다음 주기 날짜·
 * 예측은 넣지 않는다. 기간 범위와 현재 위치(맞을 때만)만 담담하게.
 */
export function personalRhythmSentence(r: PersonalRhythm): string[] {
  const seq = r.sequence.map((s) => FLOW_STATE_LABEL[s]).join(' → ')
  const lenClause =
    r.typicalLengthMin === r.typicalLengthMax
      ? `${r.typicalLengthMin}일 안팎으로`
      : `${r.typicalLengthMin}~${r.typicalLengthMax}일 사이로`
  const out: string[] = [`최근 기록에서는 ${seq} 흐름이 ${lenClause} 반복됐어요.`]
  if (r.cycleRelated) out.push('이 흐름은 생리 주기와 함께 도는 편이에요.')
  if (r.currentMatch) {
    let s = `지금은 이 흐름의 ${FLOW_STATE_LABEL[r.currentMatch.currentState]} 구간에 있어요.`
    if (r.commonLeadingDomains.length > 0) s += ` 이전에는 ${joinDomains(r.commonLeadingDomains, iga)} 먼저 내려갔어요.`
    out.push(s)
  }
  return out
}
