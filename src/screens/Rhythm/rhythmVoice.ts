/* =====================================================================
   MODE · 리듬 최근 일주일 비교 말투 (Phase 9B-1 · 순수 함수, 결정론적)
   최근 7일 vs 이전 28일 metric 비교를 자연어 한 문장으로. 내부 점수는 노출하지
   않는다(숫자는 화면 "근거 보기"에만). 새 임계값을 만들지 않고 표시 차이만.
   ===================================================================== */
import type { RhythmMetric, WeekCompareStat } from '../../data/services/rhythmService'

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
