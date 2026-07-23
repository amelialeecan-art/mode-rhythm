/* =====================================================================
   MODE · 감정/집중/사회 여유 직접 입력 카탈로그 (step1)
   기존 '오늘 상태 칩'으로 전체 감정을 표현하지 않고 축을 분리한다:
   - 감정 안정감(단일) + 두드러진 감정(복수) + 영향 정도(감정 있을 때만)
   - 집중 가능 정도(단일), 사람을 대할 여유(단일)
   점수 공식(scoring.ts)은 건드리지 않고, 입력→숫자 필드 매핑만 여기서 한다.
   ===================================================================== */
import type {
  EmotionalStabilityLevel,
  EmotionCode,
  EmotionImpactLevel,
  FocusLevel,
  SocialCapacityLevel,
} from '../models'

export const EMOTION_STABILITY_OPTIONS: { code: EmotionalStabilityLevel; label: string }[] = [
  { code: 'very_stable', label: '매우 안정적이었음' },
  { code: 'mostly_stable', label: '대체로 안정적이었음' },
  { code: 'slightly_shaken', label: '약간 흔들렸음' },
  { code: 'quite_shaken', label: '많이 흔들렸음' },
  { code: 'mostly_shaken', label: '하루 대부분 흔들렸음' },
]

export const EMOTION_OPTIONS: { code: EmotionCode; label: string }[] = [
  { code: 'sensitive', label: '예민함' },
  { code: 'irritated', label: '짜증' },
  { code: 'angry', label: '화남' },
  { code: 'anxious', label: '불안' },
  { code: 'down', label: '가라앉음' },
  { code: 'tearful', label: '울컥함' },
  { code: 'lethargic', label: '무기력' },
  { code: 'other', label: '그 밖의 감정' },
]

export const EMOTION_IMPACT_OPTIONS: { code: EmotionImpactLevel; label: string }[] = [
  { code: 'passing', label: '스쳐 지나감' },
  { code: 'brief', label: '잠깐 영향을 줌' },
  { code: 'repeated', label: '여러 번 영향을 줌' },
  { code: 'most_day', label: '하루 대부분 영향을 줌' },
]

export const FOCUS_OPTIONS: { code: FocusLevel; label: string }[] = [
  { code: 'well', label: '잘 됨' },
  { code: 'mostly', label: '대체로 됨' },
  { code: 'often_scattered', label: '자주 흐트러짐' },
  { code: 'rarely', label: '거의 안 됨' },
]

export const SOCIAL_CAPACITY_OPTIONS: { code: SocialCapacityLevel; label: string }[] = [
  { code: 'enough', label: '충분함' },
  { code: 'okay', label: '대체로 괜찮음' },
  { code: 'low', label: '적음' },
  { code: 'rarely', label: '거의 없음' },
]

/** 집중력 → focus 숫자(0~10). 없으면 undefined(다른 입력으로 대체). */
const FOCUS_VALUE: Record<FocusLevel, number> = { well: 8, mostly: 6, often_scattered: 3, rarely: 1 }
export function focusLevelValue(level: FocusLevel | undefined): number | undefined {
  return level ? FOCUS_VALUE[level] : undefined
}

/* ---- 감정 입력 → 감정 숫자 필드 (기존 필드 재사용, 공식 불변) ---- */
type EmoFields = Partial<
  Record<'moodLow' | 'anxiety' | 'irritability' | 'sadness' | 'heaviness' | 'impulsivity' | 'calm' | 'energy', number>
>

const STABILITY_BASE: Record<EmotionalStabilityLevel, EmoFields> = {
  very_stable: { calm: 8 },
  mostly_stable: { calm: 6 },
  slightly_shaken: { calm: 3, moodLow: 3 },
  quite_shaken: { calm: 1, moodLow: 6, heaviness: 3 },
  mostly_shaken: { calm: 0, moodLow: 8, heaviness: 5 },
}

const EMOTION_PATCH: Record<EmotionCode, EmoFields> = {
  sensitive: { irritability: 6, anxiety: 3 },
  irritated: { irritability: 7, moodLow: 3 },
  angry: { irritability: 9, impulsivity: 5, moodLow: 4 },
  anxious: { anxiety: 8 },
  down: { sadness: 7, heaviness: 6, moodLow: 6 },
  tearful: { sadness: 6, moodLow: 5 },
  lethargic: { heaviness: 6, moodLow: 4, energy: 1 },
  other: { moodLow: 4 },
}

const IMPACT_MULTIPLIER: Record<EmotionImpactLevel, number> = { passing: 0.6, brief: 0.85, repeated: 1.1, most_day: 1.3 }
// 강도 배수를 받는 부하 필드(capacity인 calm/energy는 제외).
const EMO_LOAD_FIELDS: (keyof EmoFields)[] = ['moodLow', 'anxiety', 'irritability', 'sadness', 'heaviness', 'impulsivity']
const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)))

/**
 * 감정 안정감 + 두드러진 감정 + 영향 정도 → 감정 숫자 필드.
 * 입력이 전혀 없으면 undefined(기존 stateCodes preset을 그대로 쓰게).
 */
export function emotionNumericFields(
  stability: EmotionalStabilityLevel | undefined,
  codes: EmotionCode[] | undefined,
  impact: EmotionImpactLevel | undefined,
): EmoFields | undefined {
  const emotionList = codes ?? []
  if (!stability && emotionList.length === 0) return undefined

  const merged: EmoFields = {}
  const put = (patch: EmoFields) => {
    for (const [k, v] of Object.entries(patch) as [keyof EmoFields, number][]) {
      merged[k] = Math.max(merged[k] ?? 0, v)
    }
  }
  if (stability) put(STABILITY_BASE[stability])
  for (const c of emotionList) put(EMOTION_PATCH[c])

  // 감정을 골랐을 때만 영향 배수 적용(선택 안 하면 1.0).
  const mult = emotionList.length > 0 && impact ? IMPACT_MULTIPLIER[impact] : 1.0
  for (const f of EMO_LOAD_FIELDS) if (merged[f] != null) merged[f] = clamp10(merged[f]! * mult)
  for (const k of Object.keys(merged) as (keyof EmoFields)[]) merged[k] = clamp10(merged[k]!)
  return merged
}

/* ---- 옛 stateCodes → 새 감정/집중/사회 입력 (읽기 호환, 가능한 값만) ---- */
const LEGACY_EMOTION: Record<string, EmotionCode> = {
  irritable: 'sensitive',
  annoyed: 'irritated',
  angry: 'angry',
  anxious: 'anxious',
  sad: 'down',
  tearful: 'tearful',
  lethargic: 'lethargic',
}

export interface LegacyEmotionDraft {
  emotionalStabilityLevel?: EmotionalStabilityLevel
  emotionCodes: EmotionCode[]
  focusLevel?: FocusLevel
  socialCapacityLevel?: SocialCapacityLevel
}

/**
 * 옛 상태 칩 코드를 새 입력으로 안전 복원. 매핑되는 값만 옮기고,
 * 알 수 없는 값을 임의로 정상 상태로 채우지 않는다(원본 stateCodes는 그대로 보존).
 */
export function legacyStateCodesToEmotion(stateCodes: string[] | undefined): LegacyEmotionDraft {
  const codes = stateCodes ?? []
  const emotionCodes: EmotionCode[] = []
  for (const c of codes) {
    const mapped = LEGACY_EMOTION[c]
    if (mapped && !emotionCodes.includes(mapped)) emotionCodes.push(mapped)
  }
  return {
    // 'calm'이 있을 때만 안정감으로 복원. 없으면 undefined(임의 정상 채움 금지).
    emotionalStabilityLevel: codes.includes('calm') ? 'mostly_stable' : undefined,
    emotionCodes,
    focusLevel: codes.includes('unfocused') ? 'often_scattered' : undefined,
    socialCapacityLevel: codes.includes('social_fatigue') ? 'low' : undefined,
  }
}
