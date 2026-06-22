import type { IntensityOption } from '../types'

/**
 * 강도 칩 → 숫자(0~10) 매핑.
 * Phase 1: UI 상수만. 실제 저장은 2단계.
 * 기본 빠른 기록은 슬라이더가 아니라 칩 중심으로 간다.
 */
export const INTENSITY_OPTIONS: IntensityOption[] = [
  { code: 'none', label: '없음', value: 0 },
  { code: 'little', label: '조금', value: 3 },
  { code: 'some', label: '보통', value: 5 },
  { code: 'much', label: '많이', value: 7 },
  { code: 'veryMuch', label: '매우 많이', value: 9 },
]

/** 코드로 숫자값 조회. */
export function intensityValue(code: IntensityOption['code']): number {
  return INTENSITY_OPTIONS.find((o) => o.code === code)?.value ?? 0
}
