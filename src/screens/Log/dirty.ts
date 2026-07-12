/* =====================================================================
   MODE · Log 화면 "저장하지 않은 입력" 판정 (순수 함수)
   - 불러오거나 저장한 시점의 폼 스냅샷(baseline)과 현재 폼을 비교한다.
   - baseline과 같으면 dirty=false(단순 열람/진입), 다르면 dirty=true(미저장 입력).
   - React·DB를 모르는 순수 함수라 단위 테스트로 직접 검증한다.
   ===================================================================== */
import type { DailyEntryDraft } from '../../data/services/dailyEntryService'

/** 폼 상태(draft + 특이증상 입력칸)를 문자열로 직렬화. baseline 비교의 기준. */
export function serializeForm(draft: DailyEntryDraft, symptomsText: string): string {
  return JSON.stringify({ draft, symptomsText })
}

/** baseline과 현재 폼이 다르면 저장하지 않은 입력이 있다고 본다. */
export function isFormChanged(baseline: string, draft: DailyEntryDraft, symptomsText: string): boolean {
  return serializeForm(draft, symptomsText) !== baseline
}
