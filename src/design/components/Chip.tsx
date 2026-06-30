import type { ReactNode } from 'react'
import './components.css'

export type ChipTone = 'lav' | 'coral' | 'mint' | 'sky' | 'rose' | 'neutral'

export interface ChipProps {
  label: ReactNode
  selected?: boolean
  tone?: ChipTone
  onToggle?: () => void
  /** 정보 표시용(비대화형)일 때 true. 기본은 토글 버튼. */
  readOnly?: boolean
}

/** 둥근 알약형 칩. 빠른 기록의 핵심 입력 단위(선택/해제). */
export function Chip({ label, selected = false, tone = 'lav', onToggle, readOnly }: ChipProps) {
  const cls = `chip chip--${tone}${selected ? ' chip--on' : ''}`
  if (readOnly) {
    return <span className={cls}>{label}</span>
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} onClick={onToggle}>
      {label}
    </button>
  )
}

export interface ChipGroupProps {
  children: ReactNode
  /** 접근성 라벨(질문 텍스트). */
  label?: string
}

/** 칩들을 감싸는 wrap 레이아웃. */
export function ChipGroup({ children, label }: ChipGroupProps) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {children}
    </div>
  )
}
