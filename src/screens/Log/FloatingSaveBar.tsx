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

/**
 * 기록 화면 하단 고정 저장바. 스크롤과 무관하게 항상 접근 가능.
 * - dirty(등록된 canonical save가 있는 카드)일 때만 나타난다.
 * - 탭바 바로 위 · safe-area 존중 · 커스텀 picker 오버레이보다 아래 z-index.
 * - 텍스트 입력(키보드) 중에는 숨겨 겹침을 피한다.
 * - 저장 동작은 각 카드의 기존 핸들러(saveAllDirty)를 재사용한다(중복 로직 없음).
 */
export function FloatingSaveBar() {
  const dirty = useSyncExternalStore(subscribeSaveBus, hasSavableDirty)
  const saving = useSyncExternalStore(subscribeSaveBus, isSaving)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const update = () => setEditing(isEditingElement(document.activeElement))
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  if ((!dirty && !saving) || editing) return null

  return (
    <div className="save-bar" role="region" aria-label="저장">
      <button className="save-bar__btn" disabled={saving} onClick={() => void saveAllDirty()}>
        {saving ? '저장 중…' : '저장하기'}
      </button>
    </div>
  )
}
