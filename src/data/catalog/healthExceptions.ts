/* =====================================================================
   MODE · Health Exception 고정 category (버튼용 표시명)
   category는 modelsV2.HealthExceptionCategory와 일치한다.
   ⚠️ 기타 text 메모가 있어도 통계 분석은 category를 기본으로 사용한다.
   ===================================================================== */
import type { HealthExceptionCategory } from '../modelsV2'

export const HEALTH_EXCEPTIONS: { code: HealthExceptionCategory; label: string }[] = [
  { code: 'illness', label: '감기/몸살' },
  { code: 'fever', label: '발열' },
  { code: 'gi_illness', label: '설사/구토' },
  { code: 'travel', label: '여행' },
  { code: 'all_nighter', label: '밤샘' },
  { code: 'jet_lag', label: '시차' },
  { code: 'vaccination', label: '예방접종' },
  { code: 'procedure', label: '수술/시술' },
  { code: 'injury', label: '부상' },
  { code: 'other', label: '기타' },
]

export const HEALTH_EXCEPTION_LABEL: Record<HealthExceptionCategory, string> = Object.fromEntries(
  HEALTH_EXCEPTIONS.map((h) => [h.code, h.label]),
) as Record<HealthExceptionCategory, string>
