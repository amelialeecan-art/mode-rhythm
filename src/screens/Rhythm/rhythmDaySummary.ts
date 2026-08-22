/* =====================================================================
   MODE · 리듬 날짜 상세 요약 (순수 · 결정론적)
   그래프에서 날짜를 탭했을 때, 숫자를 읽어주는 대신 그날을 사람이 이해할 수
   있게 한두 문장으로 설명한다. 원인 단정·없는 패턴 창작은 하지 않는다(사실만).

   입력:
   - displays: 그날 겹쳐보기 표시값(0~100, 방향 통일됨) — 선택된 지표만.
   - detail:   그날 원본 값(0~10, 수면시간은 시간) — 하루 버킷일 때만.
   원본 값은 이 모듈이 절대 바꾸지 않는다(읽기만).
   ===================================================================== */
import type { RhythmMetric, RhythmDayDetail } from '../../data/services/rhythmService'
import { METRIC_LABEL } from './rhythmOverlay'

export interface OverlayDisplay {
  metric: RhythmMetric
  value: number
}
export interface DaySummaryInput {
  displays: OverlayDisplay[]
  detail?: RhythmDayDetail
}
export interface DaySummary {
  headline: string
  facts: string[]
}

type Level = 'bad' | 'good' | 'mid'
/** 표시값(위=좋음)을 상/중/하로. 식욕은 이 함수를 쓰지 않는다(좋고 나쁨 아님). */
function level(v: number | undefined): Level | undefined {
  if (v === undefined) return undefined
  if (v <= 40) return 'bad'
  if (v >= 60) return 'good'
  return 'mid'
}

const SINGLE_BAD: Record<'emotional' | 'sleep' | 'body', string> = {
  emotional: '기분이 좀 처진 날이야.',
  sleep: '잠을 잘 못 잔 날이야.',
  body: '몸 컨디션이 안 좋았던 날이야.',
}
const SINGLE_GOOD: Record<'emotional' | 'sleep' | 'body', string> = {
  emotional: '기분은 괜찮았던 날이야.',
  sleep: '잠은 잘 잔 날이야.',
  body: '몸은 괜찮았던 날이야.',
}

function hasBatchim(word: string): boolean {
  if (!word) return false
  const c = word.charCodeAt(word.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
}
/** 'A랑 B' — 마지막만 조사 없음. */
function joinLabels(metrics: RhythmMetric[]): string {
  const labels = metrics.map((m) => METRIC_LABEL[m])
  if (labels.length <= 1) return labels[0] ?? ''
  const head = labels.slice(0, -1).map((l) => l + (hasBatchim(l) ? '이랑' : '랑'))
  return [...head, labels[labels.length - 1]].join(' ')
}

/** 기분/수면/몸 상태로 만든 대표 문장(없으면 ''). 식욕은 별도. */
function stateHeadline(mood?: Level, sleep?: Level, body?: Level): string {
  const bad: ('emotional' | 'sleep' | 'body')[] = []
  const good: ('emotional' | 'sleep' | 'body')[] = []
  if (mood === 'bad') bad.push('emotional')
  if (sleep === 'bad') bad.push('sleep')
  if (body === 'bad') bad.push('body')
  if (mood === 'good') good.push('emotional')
  if (sleep === 'good') good.push('sleep')
  if (body === 'good') good.push('body')

  if (mood === 'bad' && body === 'bad' && sleep !== 'bad') return '기분도 몸도 같이 처진 날이야.'
  if (bad.length === 0 && good.length >= 2) {
    if (sleep === 'good' && (mood === 'good' || body === 'good')) return '잠도 잘 잤고 기분이랑 몸 상태도 괜찮았던 날이야.'
    return `${joinLabels(good)} 괜찮았던 날이야.`
  }
  if (sleep === 'bad' && mood !== 'bad' && body !== 'bad') return '잠은 좀 망했지만 다른 건 크게 흔들리지 않았어.'
  if (bad.length === 1) return SINGLE_BAD[bad[0]]
  if (bad.length >= 2) return `${joinLabels(bad)} 같이 안 좋았던 날이야.`
  if (good.length === 1) return SINGLE_GOOD[good[0]]
  return ''
}

/** 식욕/배고픔 이야기(없으면 ''). 원본이 있으면 배고픔 vs 당김 차이를 우선. */
function appetiteNote(appetiteDisplay: number | undefined, detail?: RhythmDayDetail): string {
  const craving = detail?.craving
  const hunger = detail?.hunger
  if (craving !== undefined && hunger !== undefined && craving >= 6 && hunger <= 3) {
    return '배가 고팠다기보다 음식이 많이 당겼어.'
  }
  if (hunger !== undefined && hunger >= 6) return '배가 꽤 고팠어.'
  if (craving !== undefined && craving >= 6) return '음식 생각이 많이 난 날이야.'
  if (!detail && appetiteDisplay !== undefined && appetiteDisplay >= 60) return '먹고 싶은 게 강했어.'
  return ''
}

function fmtHours(h: number): string {
  let hh = Math.floor(h)
  let mm = Math.round((h - hh) * 60)
  if (mm === 60) {
    hh += 1
    mm = 0
  }
  return mm === 0 ? `${hh}시간` : `${hh}시간 ${mm}분`
}

/** 그날 상세 요약. 메인 문장 1~2개 + 아래 작은 실제 값. */
export function buildDaySummary(input: DaySummaryInput): DaySummary {
  const { displays, detail } = input
  if (displays.length === 0) return { headline: '이 날은 그릴 기록이 부족해.', facts: [] }

  const valOf = (m: RhythmMetric) => displays.find((d) => d.metric === m)?.value
  const mood = level(valOf('emotional'))
  const sleep = level(valOf('sleep'))
  const body = level(valOf('body'))
  const appetite = valOf('appetite')

  const state = stateHeadline(mood, sleep, body)
  const appNote = appetiteNote(appetite, detail)

  let headline: string
  const cravingContrast =
    detail?.craving !== undefined && detail?.hunger !== undefined && detail.craving >= 6 && detail.hunger <= 3
  if (state === '' && cravingContrast) {
    headline = '배가 고팠던 건 아닌데 음식 생각은 많이 난 날이야.'
  } else {
    headline = [state, appNote].filter(Boolean).join(' ')
  }
  if (headline === '') headline = '특별히 튀는 건 없이 무난했던 날이야.'

  // 작은 실제 값
  const facts: string[] = []
  if (detail) {
    if (detail.sleepHours !== undefined) facts.push(`수면 ${fmtHours(detail.sleepHours)}`)
    if (detail.craving !== undefined) facts.push(`음식 당김 ${detail.craving}`)
    if (detail.hunger !== undefined) facts.push(`실제 배고픔 ${detail.hunger}`)
    if (detail.fatigue !== undefined && detail.fatigue >= 4) facts.push(`피로 ${detail.fatigue}`)
    if (detail.pain !== undefined && detail.pain >= 4) facts.push(`통증 ${detail.pain}`)
  } else {
    for (const d of displays) facts.push(`${METRIC_LABEL[d.metric]} ${d.value}`)
  }

  return { headline, facts }
}
