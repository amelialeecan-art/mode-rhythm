/* =====================================================================
   MODE · 리듬 겹쳐보기 어댑터 (순수 · 표시 전용)
   여러 지표(감정·식욕·수면·회복·몸)를 같은 날짜축 위에 겹쳐 볼 수 있게,
   각 지표의 저장된 0~100 값을 "표시 방향이 통일된" 0~100 값으로 바꾼다.

   ⚠️ 원본 점수/공식/저장값은 절대 바꾸지 않는다. 여기서 만드는 값은 오직
      화면에 선을 그릴 위치(display)일 뿐이고, 툴팁·근거에는 항상 원본 값을 쓴다.

   방향 통일 규칙(§direction unification):
   - 위로 갈수록 "편안/좋음", 아래로 갈수록 "힘듦".
   - emotional/sleep/body = 부하(load) → 값이 클수록 힘듦이므로 뒤집는다(100 - raw).
   - recovery = 회복 행동(score) → 값이 클수록 좋음이므로 그대로 둔다.
   - appetite = 식욕 흔들림 → 좋고 나쁨을 강제하지 않는 '중립' 지표. 뒤집지 않고
     그대로 두되(많고 적음의 흔들림), 범례/툴팁에서 중립으로 표시한다.
   ===================================================================== */
import type { RhythmMetric } from '../../data/services/rhythmService'
import { parseISODate } from '../../lib/date'

export type MetricDirection = 'hardUp' | 'goodUp' | 'neutral'

/** 저장값이 커질 때의 의미. hardUp=힘듦↑(뒤집어 표시), goodUp=좋음↑, neutral=중립. */
export const METRIC_DIRECTION: Record<RhythmMetric, MetricDirection> = {
  emotional: 'hardUp',
  sleep: 'hardUp',
  body: 'hardUp',
  recovery: 'goodUp',
  appetite: 'neutral',
}

/** 화면에 쓰는 한글 그룹 이름. */
export const METRIC_LABEL: Record<RhythmMetric, string> = {
  emotional: '감정',
  appetite: '식욕',
  sleep: '수면',
  recovery: '회복',
  body: '몸',
}

/** 각 그룹이 무엇을 모은 값인지 한 줄 설명(합성 지표 설명). */
export const METRIC_EXPLAIN: Record<RhythmMetric, string> = {
  emotional: '기분 기복·예민함을 모은 값',
  appetite: '식욕과 단것 당김의 흔들림 (중립)',
  sleep: '수면 부족·질 저하를 모은 값',
  recovery: '쉬고 회복한 행동',
  body: '몸의 불편·통증을 모은 값',
}

export const METRIC_COLOR: Record<RhythmMetric, string> = {
  emotional: '#A985E8',
  appetite: '#FF9576',
  sleep: '#74A8EC',
  body: '#5BC79E',
  recovery: '#46BBB0',
}

/** 그리는 순서(범례·시리즈 순서 고정 — 등록 우연에 의존하지 않음). */
export const METRIC_ORDER: RhythmMetric[] = ['emotional', 'appetite', 'sleep', 'recovery', 'body']

export function isNeutral(metric: RhythmMetric): boolean {
  return METRIC_DIRECTION[metric] === 'neutral'
}

/**
 * 저장값(0~100) → 표시값(0~100, 위=편안). 방향만 통일하고 크기는 보존한다.
 * hardUp은 100-raw로 뒤집고, goodUp/neutral은 그대로.
 */
export function toDisplayValue(metric: RhythmMetric, raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined
  const clamped = Math.max(0, Math.min(100, raw))
  return METRIC_DIRECTION[metric] === 'hardUp' ? 100 - clamped : clamped
}

/* ---- 겹쳐보기 프리셋 ---- */
export interface OverlayPreset {
  key: string
  label: string
  metrics: RhythmMetric[]
}

/** 자주 같이 움직이는 조합을 미리 묶어둔다. 'custom'은 직접 고르기(빈 시작). */
export const PRESETS: OverlayPreset[] = [
  { key: 'all', label: '전체', metrics: ['emotional', 'appetite', 'sleep', 'recovery', 'body'] },
  { key: 'mood-appetite-recovery', label: '감정+식욕+회복', metrics: ['emotional', 'appetite', 'recovery'] },
  { key: 'appetite-sleep', label: '식욕+수면', metrics: ['appetite', 'sleep'] },
  { key: 'mood-body', label: '감정+몸', metrics: ['emotional', 'body'] },
  { key: 'custom', label: '직접 고르기', metrics: [] },
]

/* ---- x축 날짜 눈금 ---- */

/**
 * count개의 슬롯에서 눈금으로 쓸 인덱스를 고른다(양끝 포함, 최대 max개).
 * 30일이면 5~6개 정도가 되도록 균등 간격으로.
 */
export function pickTickIndices(count: number, max = 6): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const ticks = Math.min(max, count)
  if (ticks <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < ticks; i++) {
    out.push(Math.round((i * (count - 1)) / (ticks - 1)))
  }
  // 반올림 중복 제거(짧은 범위에서 인접 인덱스가 겹칠 수 있음).
  return [...new Set(out)]
}

/** 눈금용 짧은 날짜 'M/D'. */
export function formatTickDate(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 툴팁용 날짜 'M월 D일'. */
export function formatTooltipDate(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
