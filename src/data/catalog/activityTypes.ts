/* =====================================================================
   MODE · ActivityEpisode 유형 (버튼용 표시명)
   "운동함 Y/N"을 canonical로 쓰지 않는다 — type + duration + RPE로 남긴다.
   ===================================================================== */
import type { ActivityType } from '../modelsV2'

export const ACTIVITY_TYPES: { code: ActivityType; label: string }[] = [
  { code: 'strength', label: '근력' },
  { code: 'cardio', label: '유산소' },
  { code: 'walk', label: '걷기' },
  { code: 'other', label: '기타' },
]

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = Object.fromEntries(
  ACTIVITY_TYPES.map((a) => [a.code, a.label]),
) as Record<ActivityType, string>
