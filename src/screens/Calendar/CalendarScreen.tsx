import { useState } from 'react'
import { LensTabs, HeatmapCalendar, type LensOption } from '../../design'
import { MOCK_CALENDAR_DAYS } from '../../data/mock'
import './calendar.css'

const LENSES: LensOption[] = [
  { key: 'all', label: '전체' },
  { key: '감정', label: '감정' },
  { key: '식욕', label: '식욕' },
  { key: '수면', label: '수면' },
  { key: '몸', label: '몸' },
  { key: '주기', label: '주기' },
  { key: '회복', label: '회복' },
]

export function CalendarScreen() {
  const [lens, setLens] = useState('all')
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const detail = selectedDay != null ? MOCK_CALENDAR_DAYS.find((d) => d.day === selectedDay) : null

  return (
    <>
      <header className="calhead">
        <span className="calhead__m">6월</span>
        <span className="calhead__lbl">렌즈 · {LENSES.find((l) => l.key === lens)?.label}</span>
      </header>

      <LensTabs options={LENSES} active={lens} onChange={setLens} />

      <HeatmapCalendar days={MOCK_CALENDAR_DAYS} lens={lens} onSelectDay={setSelectedDay} />

      {/* 간단 mock 바텀시트 */}
      {detail && (
        <>
          <div className="sheet-scrim" onClick={() => setSelectedDay(null)} />
          <div className="sheet" role="dialog" aria-label={`6월 ${detail.day}일 상세`}>
            <div className="sheet__handle" />
            <p className="sheet__date">6월 {detail.day}일</p>
            {detail.label ? (
              <>
                <p className="sheet__mode">{detail.label}</p>
                <p className="sheet__hint">자세한 기록과 요인 후보는 다음 단계에서 연결돼요.</p>
              </>
            ) : (
              <p className="sheet__hint">아직 기록이 없는 날이에요.</p>
            )}
            <button className="btn-primary sheet__close" onClick={() => setSelectedDay(null)}>
              닫기
            </button>
          </div>
        </>
      )}
    </>
  )
}
