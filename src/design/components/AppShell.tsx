import type { ReactNode } from 'react'
import { BottomTabBar } from './BottomTabBar'
import './components.css'

export interface AppShellProps {
  children: ReactNode
  /** 하단 탭바 표시 여부. 온보딩 등 전체화면에서는 false. */
  showTabBar?: boolean
}

/**
 * 앱 전체 셸. 모바일 우선 세로 레이아웃 + 스크롤 본문 + 고정 하단 탭바.
 */
export function AppShell({ children, showTabBar = true }: AppShellProps) {
  return (
    <div className={`app-shell${showTabBar ? '' : ' app-shell--full'}`}>
      <main className="app-shell__body">{children}</main>
      {showTabBar && <BottomTabBar />}
    </div>
  )
}
