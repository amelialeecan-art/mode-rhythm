import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AppShell } from '../design'
import { OnboardingScreen } from '../screens/Onboarding/OnboardingScreen'
import { TodayScreen } from '../screens/Today/TodayScreen'
import { LogScreen } from '../screens/Log/LogScreen'
import { CalendarScreen } from '../screens/Calendar/CalendarScreen'
import { AnalysisScreen } from '../screens/Analysis/AnalysisScreen'
import { RhythmScreen } from '../screens/Rhythm/RhythmScreen'
import { SettingsScreen } from '../screens/Settings/SettingsScreen'

/** 하단 탭바가 있는 화면들의 공통 레이아웃. */
function TabbedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export function App() {
  return (
    <BrowserRouter>
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
