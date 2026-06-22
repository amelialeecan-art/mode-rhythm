import type { ReactNode } from 'react'
import './components.css'

export interface SectionHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** 제목 앞 작은 별 포인트 표시 */
  star?: boolean
  right?: ReactNode
}

/** 카드 안/화면 상단의 섹션 제목 + 보조설명. */
export function SectionHeader({ title, subtitle, star, right }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <div className="section-header__main">
        <h3 className="section-header__title">
          {star && (
            <svg className="section-header__star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2 C12.5 7 17 11.5 22 12 C17 12.5 12.5 17 12 22 C11.5 17 7 12.5 2 12 C7 11.5 11.5 7 12 2 Z" />
            </svg>
          )}
          {title}
        </h3>
        {subtitle && <p className="section-header__sub">{subtitle}</p>}
      </div>
      {right && <div className="section-header__right">{right}</div>}
    </header>
  )
}
