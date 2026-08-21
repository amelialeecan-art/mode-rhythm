import { useEffect, useState, useSyncExternalStore } from 'react'
import { subscribeSaveBus, hasSavableDirty, isSaving, saveAllDirty } from './checkIn/dirtyRegistry'

/** 편집 중인 요소가 키보드를 띄우는 입력인지(그럴 때 저장바를 숨겨 겹침 방지, §14). */
function isEditingElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  // 키보드가 뜨는 텍스트류만. 버튼/체크박스 등은 제외.
  return ['text', 'number', 'search', 'tel', 'url', 'email', 'password'].includes(type)
}

/** 저장 실패한 영역 라벨들을 사람말 한 문장으로. */
function failMessage(failed: string[]): string {
  if (failed.length === 1) return `${failed[0]}은(는) 저장하지 못했어. 한 번만 다시 해줘.`
  return `${failed.join(' · ')}은(는) 저장하지 못했어. 한 번만 다시 해줘.`
}

/**
 * 기록 탭 하단 전역 저장바. 스크롤과 무관하게 항상 접근 가능.
 * - 기록 탭에 미저장 값(등록된 canonical save가 있는 영역)이 하나라도 있으면 나타난다.
 * - "저장하기" 한 번으로 현재 미저장 영역을 모두 저장한다(saveAllDirty).
 * - 탭바 바로 위 · safe-area 존중 · 커스텀 picker 오버레이보다 아래 z-index.
 * - 텍스트 입력(키보드) 중에는 숨겨 겹침을 피한다.
 * - 일부 실패 시 실패한 영역만 사람말로 알린다(성공분은 dirty 해제되어 유지되지 않음).
 */
export function FloatingSaveBar() {
  const dirty = useSyncExternalStore(subscribeSaveBus, hasSavableDirty)
  const saving = useSyncExternalStore(subscribeSaveBus, isSaving)
  const [editing, setEditing] = useState(false)
  const [failMsg, setFailMsg] = useState('')

  useEffect(() => {
    const update = () => setEditing(isEditingElement(document.activeElement))
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  const onSave = async () => {
    setFailMsg('')
    const failed = await saveAllDirty()
    setFailMsg(failed.length ? failMessage(failed) : '')
  }

  if ((!dirty && !saving) || editing) return null

  return (
    <div className="save-bar" role="region" aria-label="저장">
      {failMsg && <p className="save-bar__msg">{failMsg}</p>}
      <button className="save-bar__btn" disabled={saving} onClick={() => void onSave()}>
        {saving ? '저장 중…' : '저장하기'}
      </button>
    </div>
  )
}
