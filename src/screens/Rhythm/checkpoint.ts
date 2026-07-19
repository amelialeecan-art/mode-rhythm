/* =====================================================================
   MODE · 다가오는 체크포인트 (순수 함수 · 9C)
   매일 반복되는 3일 예측 카드 대신, 평소와 다른 의미 있는 신호가 있을 때만
   짧은 카드 하나를 만든다. 새 예측 모델/점수를 만들지 않는다 — 이미 계산된
   신호(주기 근접·최근 악화·예정 일정)를 문장으로만 정리한다. 결정론적.
   ===================================================================== */
import type { CheckpointMetric, CheckpointSignals } from '../../data/services/rhythmForecastService'

export interface CheckpointCard {
  sentences: string[]
}

const LABEL: Record<CheckpointMetric, string> = {
  sleep: '수면',
  emotional: '감정',
  appetite: '식욕',
  body: '몸 상태',
}

function hasBatchim(word: string): boolean {
  if (!word) return false
  const c = word.charCodeAt(word.length - 1)
  return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
}
const wa = (w: string) => w + (hasBatchim(w) ? '과' : '와')
const iga = (w: string) => w + (hasBatchim(w) ? '이' : '가')
const card = (s: string): CheckpointCard => ({ sentences: [s] })

/**
 * 신호 → 카드. 의미 있는 신호가 없으면 null(섹션 자체를 렌더링하지 않음).
 * 한 번에 최대 2개 신호만 언급한다.
 */
export function buildCheckpoint(s: CheckpointSignals): CheckpointCard | null {
  const w = s.worsened
  const worsenedList = (['sleep', 'emotional', 'appetite', 'body'] as CheckpointMetric[]).filter((m) => w[m])

  // 1) 주기 근접이 최우선 (앞으로의 조건)
  if (s.cycleNear) {
    if (w.sleep) return card('생리 예정일이 가까워지고 최근 수면도 흔들렸어요. 멘탈이 같이 터지는지 이틀 정도 봐요.')
    if (w.emotional) return card('생리 예정일이 가깝고 최근 감정도 흔들렸어요. 정병 모드 오기 쉬운 타이밍이라 조금 지켜봐요.')
    if (w.appetite) return card('이번 주기는 평소보다 일찍 식욕이 흔들리고 있어요. 조금 지켜봐요.')
    if (w.body) return card('생리 예정일이 가깝고 최근 몸 상태도 무거웠어요. 조금 지켜봐요.')
    return card('생리 예정일이 가까워요. 정병 모드가 오기 쉬운 타이밍이라 조금 지켜봐요.')
  }

  // 2) 예정 일정 + 최근 악화
  if (s.scheduleAhead) {
    const first = worsenedList[0]
    if (first) {
      const lab = LABEL[first]
      if (s.priorCombo) return card(`최근 ${wa(lab)} 다가오는 일정 압박이 겹쳤어요. 예전에 멘헤라 모드가 왔던 조합이에요.`)
      return card(`최근 ${wa(lab)} 다가오는 일정 부담이 겹쳤어요. 며칠 정도 지켜봐요.`)
    }
    return card('다가오는 일정 부담이 있지만 최근 컨디션은 평소와 비슷해요.')
  }

  // 3) 최근 악화만
  if (worsenedList.length >= 2) {
    return card(`최근 ${wa(LABEL[worsenedList[0]])} ${iga(LABEL[worsenedList[1]])} 같이 흔들렸어요. 이어지는지 며칠 지켜봐요.`)
  }
  if (worsenedList.length === 1) {
    return card(`최근 ${iga(LABEL[worsenedList[0]])} 평소보다 흔들렸어요. 조금 지켜봐요.`)
  }

  // 4) 모두 안정/평소 범위 → 카드 없음
  return null
}
