import { describe, expect, it } from 'vitest'
import { serializeForm, isFormChanged } from './dirty'
import { emptyDraft } from '../../data/services/dailyEntryService'

// LogScreen의 dirty(저장하지 않은 입력) 판정 로직을 순수 함수로 검증한다.
// 실제 화면 흐름: 불러온 값 → baseline, 입력 변화 → dirty, 저장/재로드 → baseline 갱신.
describe('Log dirty 판정', () => {
  const date = '2026-07-12'

  it('갓 불러온(=baseline) 기록은 dirty가 아니다', () => {
    const draft = emptyDraft(date)
    const symptomsText = ''
    const baseline = serializeForm(draft, symptomsText)
    // 단순히 탭에 들어오거나 기존 기록을 여는 것만으로는 변경 없음
    expect(isFormChanged(baseline, draft, symptomsText)).toBe(false)
  })

  it('실제 입력 변화가 있으면 dirty가 된다', () => {
    const loaded = emptyDraft(date)
    const baseline = serializeForm(loaded, '')

    // 상태 칩 하나 선택 (draft 변경)
    const changedDraft = { ...loaded, stateCodes: ['tired'] }
    expect(isFormChanged(baseline, changedDraft, '')).toBe(true)

    // 특이증상 텍스트만 바뀌어도 dirty
    expect(isFormChanged(baseline, loaded, '두통')).toBe(true)
  })

  it('원래 값으로 되돌리면 다시 dirty가 아니다', () => {
    const loaded = emptyDraft(date)
    const baseline = serializeForm(loaded, '')

    const changed = { ...loaded, memo: '임시 메모' }
    expect(isFormChanged(baseline, changed, '')).toBe(true)

    // 되돌림 (baseline과 동일한 값 재구성)
    const reverted = { ...changed, memo: '' }
    expect(isFormChanged(baseline, reverted, '')).toBe(false)
  })

  it('저장(=baseline 갱신) 후에는 저장한 값이 새 기준이 되어 dirty가 아니다', () => {
    const loaded = emptyDraft(date)
    const edited = { ...loaded, memo: '오늘 메모' }
    // 저장 성공 시 현재 폼을 baseline으로 삼음
    const newBaseline = serializeForm(edited, '두통')
    expect(isFormChanged(newBaseline, edited, '두통')).toBe(false)
    // 저장 후 다시 입력하면 dirty
    expect(isFormChanged(newBaseline, { ...edited, memo: '수정' }, '두통')).toBe(true)
  })
})
