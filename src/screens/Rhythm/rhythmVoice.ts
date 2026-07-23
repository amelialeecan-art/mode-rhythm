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

/** 주기는 원형이라 표시용으로만 stable부터 회전(내부 sequence·currentMatch는 그대로). */
function rotateToStable(seq: FlowState[]): FlowState[] {
  const i = seq.indexOf('stable')
  return i <= 0 ? seq : [...seq.slice(i), ...seq.slice(0, i)]
}

/**
 * 개인 반복 흐름 카드 문장. 주기의 절대 시작점을 단정하지 않는다(다음 상태/날짜 예측 없음,
 * 신뢰도·근거 횟수 없음). 같은 상태가 두 번 나오면 화살표 대신 자연스럽게 설명한다.
 * 현재 위치는 내부 currentMatch의 실제 상태를 그대로 쓴다.
 * 역할: "최근 흐름"은 최근 며칠의 변화, "나의 반복 흐름"은 장기간 반복된 큰 구조.
 */
export function personalRhythmSentence(r: PersonalRhythm): string[] {
  const seq = r.sequence
  const distinct = [...new Set(seq)]
  const out: string[] = []

  if (seq.length === distinct.length) {
    // 서로 다른 상태만 → 화살표(보기 편하게 stable부터 회전)
    const disp = rotateToStable(seq).map((s) => FLOW_STATE_LABEL[s])
    out.push(`최근 기록에서는 ${disp.join(' → ')} 흐름이 반복됐어요.`)
  } else {
    // 같은 상태가 반복(구분자) → 자연스럽게 설명. 구분자=가장 자주 반복(동률이면 stable).
    const count = new Map<FlowState, number>()
    for (const s of seq) count.set(s, (count.get(s) ?? 0) + 1)
    let sep = distinct[0]
    let bestN = -1
    for (const s of distinct) {
      const c = count.get(s) ?? 0
      if (c > bestN || (c === bestN && s === 'stable')) {
        bestN = c
        sep = s
      }
    }
    const others: FlowState[] = []
    for (const s of seq) if (s !== sep && !others.includes(s)) others.push(s)
    const sepPhrase = sep === 'stable' ? '안정된 기간을 사이에 두고' : `${FLOW_STATE_LABEL[sep]} 구간을 사이에 두고`
    const othersPhrase =
      others.length <= 1
        ? FLOW_STATE_LABEL[others[0] ?? sep]
        : `${gwa(FLOW_STATE_LABEL[others[0]])} ${FLOW_STATE_LABEL[others[1]]}`
    out.push(`최근 기록에서는 ${sepPhrase} ${othersPhrase} 흐름이 반복됐어요.`)
  }

  // 기간(보조 줄). min===max면 "약 52일"(52~52일 금지), 아니면 "약 18~22일".
  const dur =
    r.typicalLengthMin === r.typicalLengthMax
      ? `약 ${r.typicalLengthMin}일`
      : `약 ${r.typicalLengthMin}~${r.typicalLengthMax}일`
  out.push(`한 흐름은 ${dur} 이어졌어요.`)

  if (r.cycleRelated) out.push('이 흐름은 생리 주기와 함께 도는 편이에요.')

  if (r.currentMatch) {
    let s = `지금은 반복 흐름 중 ${FLOW_STATE_LABEL[r.currentMatch.currentState]} 구간에 있어요.`
    if (r.commonLeadingDomains.length > 0) s += ` ${joinDomains(r.commonLeadingDomains, iga)} 먼저 내려갔어요.`
    out.push(s)
  }
  return out
}
