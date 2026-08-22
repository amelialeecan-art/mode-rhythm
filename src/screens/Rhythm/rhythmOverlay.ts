/* =====================================================================
   MODE · 리듬 겹쳐보기 어댑터 (순수 · 표시 전용)
   기분·식욕·수면·몸 네 가지를 같은 날짜축 위에 겹쳐, 설명을 읽지 않아도
   선만 보고 이해되게 만든다.

   ⚠️ 원본 점수/공식/저장값은 절대 바꾸지 않는다. 여기서 만드는 값은 오직 화면에
      선을 그릴 위치(display)일 뿐이고, 날짜 상세에는 항상 원본 값을 쓴다.

   표시 방향(설명 없이 선만 봐도 되도록):
   - 기분 ↑ = 기분 좋음      (emotionalLoad는 높을수록 힘듦 → 100-load로 뒤집음)
   - 수면 ↑ = 잘 잠          (sleepLoad는 높을수록 못 잠 → 100-load로 뒤집음)
   - 몸  ↑ = 몸 컨디션 좋음   (bodyLoad는 높을수록 힘듦 → 100-load로 뒤집음)
   - 식욕 ↑ = 먹고 싶은 정도 강함 (appetiteLoad는 높을수록 강함 → 그대로 둠)
   회복은 "무엇을 했나"에 가까운 다른 축이라 이 겹쳐보기에서 제외한다(다른 화면은 그대로).
   ===================================================================== */
import type { RhythmMetric } from '../../data/services/rhythmService'
import { parseISODate } from '../../lib/date'

/** 메인 겹쳐보기에 쓰는 네 가지(순서 = 화면 버튼 순서). 회복 제외. */
export const OVERLAY_METRICS: RhythmMetric[] = ['emotional', 'appetite', 'sleep', 'body']

export const DEFAULT_RANGE_KEY = '30d'

/** 저장값이 커질 때: flip=뒤집어 표시(높을수록 좋게), keep=그대로. */
type DisplayMode = 'flip' | 'keep'
const DISPLAY_MODE: Record<RhythmMetric, DisplayMode> = {
  emotional: 'flip', // 기분: 부하↑ → 표시↓
  sleep: 'flip', // 수면: 문제↑ → 표시↓
  body: 'flip', // 몸: 불편↑ → 표시↓
  appetite: 'keep', // 식욕: 강함↑ → 표시↑ (좋고 나쁨 아님)
  recovery: 'keep',
}

/** 화면 버튼·선 이름(짧게). */
export const METRIC_LABEL: Record<RhythmMetric, string> = {
  emotional: '기분',
  appetite: '식욕',
  sleep: '수면',
  body: '몸',
  recovery: '회복',
}

/** 네 선이 iPhone에서 확실히 구분되도록 서로 충분히 다른 색. */
export const METRIC_COLOR: Record<RhythmMetric, string> = {
  emotional: '#A985E8', // 보라
  appetite: '#FF9576', // 코랄
  sleep: '#74A8EC', // 파랑
  body: '#5BC79E', // 초록
  recovery: '#46BBB0',
}

/**
 * 저장값(0~100) → 표시값(0~100). 방향만 통일하고 크기는 보존한다.
 * flip은 100-raw, keep은 그대로. 결측은 undefined 그대로(0으로 채우지 않음).
 */
export function toDisplayValue(metric: RhythmMetric, raw: number | undefined): number | undefined {
  if (raw === undefined) return undefined
  const clamped = Math.max(0, Math.min(100, raw))
  return DISPLAY_MODE[metric] === 'flip' ? 100 - clamped : clamped
}

/**
 * 그래프가 오른쪽으로 쪼그라들지 않도록, 실제로 그릴 시작 날짜.
 * = max(선택 기간 시작, 첫 데이터 날짜). 데이터가 기간보다 오래되면 기간 시작에서 자른다.
 * 두 값 모두 'YYYY-MM-DD' 문자열이라 사전식 비교가 곧 날짜 비교다.
 */
export function effectiveDomainStart(rangeStart: string, firstDataDate: string | undefined): string {
  if (!firstDataDate) return rangeStart
  return firstDataDate > rangeStart ? firstDataDate : rangeStart
}

/* ---- x축 날짜 눈금 ---- */

/**
 * count개의 슬롯에서 눈금으로 쓸 인덱스를 고른다(양끝 포함, 최대 max개).
 */
export function pickTickIndices(count: number, max = 6): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const ticks = Math.min(max, count)
  if (ticks <= 1) return [0]
  const out: number[] = []
  for (let i = 0; i < ticks; i++) out.push(Math.round((i * (count - 1)) / (ticks - 1)))
  return [...new Set(out)]
}

/** 눈금용 짧은 날짜 'M/D'. */
export function formatTickDate(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** 상세용 날짜 'M월 D일'. */
export function formatDetailDate(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
