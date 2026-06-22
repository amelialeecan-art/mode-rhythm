import { NavLink } from 'react-router-dom'
import './components.css'

interface TabDef {
  to: string
  key: string
  label: string
  icon: string // svg path(s)
}

// 시안의 탭 아이콘 path 포팅
const TABS: TabDef[] = [
  {
    to: '/',
    key: 'today',
    label: '오늘',
    icon: 'M12 4.2 C 12.6 8.4 15.6 11 19.8 12 C 15.6 13 12.6 15.6 12 19.8 C 11.4 15.6 8.4 13 4.2 12 C 8.4 11 11.4 8.4 12 4.2 Z',
  },
  {
    to: '/log',
    key: 'log',
    label: '기록',
    icon: 'M12 8.3 V15.7 M8.3 12 H15.7',
  },
  {
    to: '/calendar',
    key: 'calendar',
    label: '캘린더',
    icon: 'M4 9.6 H20 M8.6 3.6 V7 M15.4 3.6 V7',
  },
  {
    to: '/analysis',
    key: 'analysis',
    label: '분석',
    icon: 'M4 15.5 C 7 8.5 10 17 13 11 S 18 7 20.2 9.5',
  },
  {
    to: '/rhythm',
    key: 'rhythm',
    label: '리듬',
    icon: 'M3 12 q2.5 -7 5 0 t5 0 t5 0 t3 0',
  },
]

/** 하단 5탭 내비게이션. 라우트 활성 상태를 NavLink로 반영. */
export function BottomTabBar() {
  return (
    <nav className="tabbar" aria-label="주요 화면">
      {TABS.map((t) => (
        <NavLink key={t.key} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab${isActive ? ' tab--on' : ''}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {t.key === 'log' && <circle cx={12} cy={12} r={8.4} />}
            {t.key === 'calendar' && <rect x={4} y={5.4} width={16} height={14} rx={3.4} />}
            {t.key === 'analysis' && <circle cx={20.2} cy={9.5} r={1.3} fill="currentColor" stroke="none" />}
            <path d={t.icon} />
          </svg>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
