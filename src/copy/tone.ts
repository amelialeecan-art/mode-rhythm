/* =====================================================================
   MODE · 문구 톤 + 단정 금지 가드
   - 단정(원인 확정/진단/예측 확정) 표현을 막는다.
   - tone(calm/witty/direct)에 따라 일부 보조 문구만 가볍게 바꾼다.
   ===================================================================== */
import type { ToneModeValue } from '../data/models'

export type { ToneModeValue }

/* ---------------------------------------------------------------------
   단정 금지 가드
   주의: 사용자가 고르는 "사건 라벨"(예: "연락/답장 때문에 신경 쓰였음")은
   앱이 단정하는 문장이 아니라 사용자 기록용 라벨이므로 예외다.
   그래서 맨 "때문에"는 금지 목록에 넣지 않고, 앱이 만들어내는 단정 구절만 막는다.
   --------------------------------------------------------------------- */
export const ASSERTIVE_FORBIDDEN = [
  '원인입니다',
  '때문입니다',
  '확실합니다',
  '반드시',
  '무조건',
  '범인입니다',
  '예측됩니다',
  '치료',
  '수면 부족 때문', // "수면 부족 때문에 ~" 류 앱 단정
  '생리 때문',
]

/** 단정 표현을 찾으면 그 표현을, 없으면 null. (앱 생성 문구 검사용) */
export function findAssertion(text: string): string | null {
  for (const p of ASSERTIVE_FORBIDDEN) {
    if (text.includes(p)) return p
  }
  // "내일은 ~입니다" 류 확정 예보 차단 (우리 문구는 "가능성이 있어요")
  if (/내일은[^.!?\n]*입니다/.test(text)) return '내일은~입니다'
  return null
}

export function containsAssertion(text: string): boolean {
  return findAssertion(text) !== null
}

/**
 * 개발용 가드: 단정 문구가 섞였는지 콘솔 경고하고 원문을 그대로 반환.
 * (테스트에서는 containsAssertion으로 검증한다)
 */
export function assertGuard(text: string): string {
  if (import.meta.env.DEV) {
    const hit = findAssertion(text)
    if (hit) {
      // eslint-disable-next-line no-console
      console.warn(`[MODE tone] 단정 표현 의심: "${hit}" → "${text}"`)
    }
  }
  return text
}

/** 요인과 결과의 관계를 단정 없이 "경향" 표현으로. */
export function toTendencyPhrase(factorLabel: string, metricLabel: string): string {
  return `${factorLabel}과(와) ${metricLabel}이(가) 함께 나타나는 경향이 있어요`
}

/* ---------------------------------------------------------------------
   톤별 보조 문구 (일부 화면에만 가볍게 적용)
   어떤 톤에서도 단정하지 않는다.
   --------------------------------------------------------------------- */
export type ToneKey = 'reference' | 'analysisIntro' | 'rhythmIntro' | 'emptyData'

const TONE_COPY: Record<ToneKey, Record<ToneModeValue, string>> = {
  reference: {
    calm: '최근 기록을 바탕으로 조심스럽게 참고해볼 수 있어요. 확정은 아니에요.',
    witty: '기록상 힌트가 조금 보이고 있어요. 확정은 아니에요.',
    direct: '최근 기록 기준 참고예요. 확정은 아니에요.',
  },
  analysisIntro: {
    calm: '저장된 기록에서 반복적으로 함께 나타난 흐름을 차분히 보여드려요. 원인을 확정하거나 진단하지 않아요.',
    witty: '기록에서 자주 같이 등장한 패턴을 모아봤어요. 원인 확정도 진단도 아니에요.',
    direct: '저장된 기록의 반복 패턴이에요. 원인 확정이나 진단이 아니에요.',
  },
  rhythmIntro: {
    calm: '최근 30일 기록을 따라 리듬이 어떻게 움직였는지 차분히 살펴봐요.',
    witty: '최근 30일 흐름을 한눈에. 실제 기록 기준이에요.',
    direct: '최근 30일 실제 기록 기준 흐름이에요.',
  },
  emptyData: {
    calm: '아직 기록이 적어요. 며칠 더 모이면 더 또렷하게 보여드릴게요.',
    witty: '아직 기록이 조금 부족해요. 며칠만 더 쌓이면 보여줄게요.',
    direct: '기록이 부족해요. 며칠 더 기록하면 표시돼요.',
  },
}

/** tone에 맞는 보조 문구. tone이 없으면 calm. */
export function getToneCopy(tone: ToneModeValue | undefined, key: ToneKey): string {
  return TONE_COPY[key][tone ?? 'calm']
}
