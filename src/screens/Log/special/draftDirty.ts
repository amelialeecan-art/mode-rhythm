/* =====================================================================
   MODE · 특별 기록 폼의 dirty / canSave 판정 (순수 · 서로 독립)
   ⚠️ dirty  = 사용자가 초기 상태에서 무엇이든 입력/변경했는가(미저장 draft 존재?)
   ⚠️ canSave = 지금 저장하면 유효한 record가 되는가(validation 통과?)
   두 개념은 절대 같지 않다. dirty=true & canSave=false 상태가 정상적으로 존재한다.
   (예: 종류만 고르고 강도/시간은 아직 안 적음 → dirty이지만 저장 불가)
   ===================================================================== */
import type { RatingValue, TriBoolean } from '../../../data/modelsV2'

/** 사용자가 값을 골랐는가(숫자 또는 '모름'). null=미입력. */
const engaged = (v: RatingValue): boolean => v !== null
const isNum = (v: RatingValue): boolean => typeof v === 'number'
const posNum = (s: string, min: number): boolean => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n > min
}
const nonNegNum = (s: string): boolean => {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n >= 0
}

/* --- 스트레스 사건 --- */
export const stressDirty = (category: string | null, intensity: RatingValue): boolean =>
  category !== null || engaged(intensity)
export const stressCanSave = (category: string | null, intensity: RatingValue): boolean =>
  category !== null && isNum(intensity)

/* --- 운동 (type 기본값 'strength') --- */
export const activityDirty = (type: string, duration: string, rpe: RatingValue, steps: string): boolean =>
  type !== 'strength' || duration.trim() !== '' || engaged(rpe) || steps.trim() !== ''
export const activityCanSave = (duration: string): boolean => nonNegNum(duration)

/* --- 체중 --- */
export const weightDirty = (weight: string, saw: TriBoolean): boolean => weight.trim() !== '' || saw !== null
export const weightCanSave = (weight: string): boolean => posNum(weight, 0)

/* --- 건강 예외 (category 기본값 'illness'; 저장은 항상 가능) --- */
export const healthDirty = (category: string, intensity: RatingValue): boolean =>
  category !== 'illness' || engaged(intensity)

/* --- 약 투여 (약을 골라야 저장 가능) --- */
export const medicationDirty = (selectedId: number | null, dose: string): boolean =>
  selectedId !== null || dose.trim() !== ''
export const medicationCanSave = (selectedId: number | null): boolean => selectedId !== null
