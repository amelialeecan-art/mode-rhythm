import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GlassCard, SectionHeader } from '../../design'
import { getTodayISODate } from '../../lib/date'
import { DayTimeline } from './timeline/DayTimeline'
import { CheckInCard } from './checkIn/CheckInCard'
import { SleepCard } from './episodes/SleepCard'
import { MealSection } from './episodes/MealSection'
import { SpecialEventSection, type EditTarget } from './special/SpecialEventSection'
import { LegacyLogForm } from './LegacyLogForm'
import './log.css'
import './checkIn/checkIn.css'
import './episodes/episodes.css'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 기록 화면 (V2 중심).
 * - 상단: 날짜 + 오늘 타임라인 + 아침/저녁 체크인(StateMeasurement)
 * - 하단: 이전 방식 상세 기록(레거시)을 열람/입력 호환용으로 접어서 유지
 *
 * V2 core state(아침/저녁)와 레거시 dailyLog는 역할이 다르다:
 * - 새 core numeric 상태는 아침/저녁 체크인이 canonical source.
 * - 레거시는 energy/focus 등을 중복 질문으로 동시에 강요하지 않도록 접어 둔다.
 */
export function LogScreen() {
  const [searchParams] = useSearchParams()
  const initialDate = (() => {
    const q = searchParams.get('date')
    return q && ISO_RE.test(q) ? q : getTodayISODate()
  })()

  const [date, setDate] = useState<string>(initialDate)
  // 저장/날짜 변경 시 타임라인·카드가 다시 로드하도록 하는 토큰.
  const [reloadToken, setReloadToken] = useState(0)
  const [showLegacy, setShowLegacy] = useState(false)
  // 타임라인에서 "수정"을 누른 특별한 일 레코드(스트레스/운동/약/예외/체중).
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)

  const bumpReload = () => setReloadToken((t) => t + 1)

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">기록</h1>
        <p className="screen-head__sub">아침·저녁 상태를 빠르게 남겨요</p>
      </header>

      {/* 날짜 선택 */}
      <GlassCard>
        <div className="log-daterow">
          <SectionHeader title="날짜" />
          <input
            className="log-date-input"
            type="date"
            value={date}
            max={getTodayISODate()}
            onChange={(e) => setDate(e.target.value || getTodayISODate())}
          />
        </div>
      </GlassCard>

      {/* 오늘 타임라인(모든 기록) + 완료 여부 + 항목별 수정/삭제 */}
      <DayTimeline localDate={date} reloadToken={reloadToken} onChanged={bumpReload} onEdit={setEditTarget} />

      {/* 특별한 일: 스트레스 · 운동 · 약 · 예외 · 체중 */}
      <SpecialEventSection
        localDate={date}
        reloadToken={reloadToken}
        onSaved={bumpReload}
        editTarget={editTarget}
        onEditHandled={() => setEditTarget(null)}
      />

      {/* 지난밤 수면 (SleepEpisode) */}
      <SleepCard localDate={date} reloadToken={reloadToken} onSaved={bumpReload} />

      {/* 아침 상태 */}
      <CheckInCard localDate={date} checkInType="morning" reloadToken={reloadToken} onSaved={bumpReload} />

      {/* 식사/간식: 빠른 기록 + 오늘 식사 타임라인 */}
      <MealSection localDate={date} reloadToken={reloadToken} onSaved={bumpReload} />

      {/* 저녁 상태 */}
      <CheckInCard localDate={date} checkInType="evening" reloadToken={reloadToken} onSaved={bumpReload} />

      {/* 이전 방식 상세 기록 (레거시 호환) */}
      <button
        className="log-detail-toggle"
        aria-expanded={showLegacy}
        onClick={() => setShowLegacy((v) => !v)}
      >
        {showLegacy ? '이전 방식 상세 기록 접기 ▲' : '이전 방식 상세 기록 열기 ▼'}
      </button>

      {showLegacy && <LegacyLogForm />}
    </>
  )
}
