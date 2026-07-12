import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom'
import { AppShell } from '../design'
import { UpdateBanner } from '../design/components/UpdateBanner'
import { isOnboardingCompleted } from '../lib/onboarding'
import { initPwaUpdate } from '../lib/pwaUpdate'
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen'
import { TodayScreen } from '../screens/Today/TodayScreen'
import { LogScreen } from '../screens/Log/LogScreen'
import { CalendarScreen } from '../screens/Calendar/CalendarScreen'
import { AnalysisScreen } from '../screens/Analysis/AnalysisScreen'
import { RhythmScreen } from '../screens/Rhythm/RhythmScreen'
import { SettingsScreen } from '../screens/Settings/SettingsScreen'

/** 하단 탭바가 있는 화면들의 공통 레이아웃. 첫 실행이면 온보딩으로 보낸다. */
function TabbedLayout() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!isOnboardingCompleted()) navigate('/onboarding', { replace: true })
  }, [navigate])
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

// Vite base('/mode-rhythm/' 등)를 라우터 basename으로 — GitHub Pages 프로젝트 경로 대응.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export function App() {
  useEffect(() => {
    void initPwaUpdate()
  }, [])

  return (
    <BrowserRouter basename={BASENAME}>
      <UpdateBanner />
      <Routes>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route element={<TabbedLayout />}>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/log" element={<LogScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/analysis" element={<AnalysisScreen />} />
          <Route path="/rhythm" element={<RhythmScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
