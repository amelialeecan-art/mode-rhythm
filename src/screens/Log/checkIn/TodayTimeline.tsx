import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../../design'
import { stateMeasurementRepository } from '../../../data/repositories'
import type { CheckInType, StateMeasurement } from '../../../data/modelsV2'

interface TodayTimelineProps {
  localDate: string
  reloadToken: number
}

const CHECKIN_LABEL: Record<CheckInType, string> = {
  morning: '아침 상태',
  evening: '저녁 상태',
  adhoc: '수시 기록',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 선택한 날짜의 상태 기록 타임라인 + 아침/저녁 완료 여부.
 * 지금은 StateMeasurement만 나열하지만, 다음 단계의 meal/event까지
 * 같은 타임라인에 확장할 수 있도록 시각 정렬 구조로 만든다.
 */
export function TodayTimeline({ localDate, reloadToken }: TodayTimelineProps) {
  const [rows, setRows] = useState<StateMeasurement[]>([])

  useEffect(() => {
    let cancelled = false
    void stateMeasurementRepository.listByDate(localDate).then((list) => {
      if (!cancelled) setRows(list)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, reloadToken])

  const hasMorning = rows.some((r) => r.checkInType === 'morning')
  const hasEvening = rows.some((r) => r.checkInType === 'evening')

  return (
    <GlassCard>
      <SectionHeader title="오늘 타임라인" subtitle="이 날짜에 남긴 상태 기록" />
      <div className="timeline-status">
        <span className={`timeline-pill${hasMorning ? ' timeline-pill--done' : ''}`}>
          아침 {hasMorning ? '완료' : '미기록'}
        </span>
        <span className={`timeline-pill${hasEvening ? ' timeline-pill--done' : ''}`}>
          저녁 {hasEvening ? '완료' : '미기록'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="state-hint" style={{ marginTop: 12 }}>
          아직 기록이 없어요. 아래에서 아침/저녁 상태를 남겨보세요.
        </p>
      ) : (
        <ul className="timeline-list">
          {rows.map((r) => (
            <li className="timeline-row" key={r.id}>
              <span className="timeline-time">{formatTime(r.recordedAt)}</span>
              <span className="timeline-label">{CHECKIN_LABEL[r.checkInType]}</span>
              <span className="timeline-count">{Object.keys(r.metrics).length}개 응답</span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
