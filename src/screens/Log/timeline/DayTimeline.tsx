import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../../design'
import { buildDayTimeline, deleteTimelineEntry, type TimelineEntry, type TimelineKind } from '../../../data/services/dayTimelineService'
import { formatClock } from '../episodes/time'
import type { EditTarget, SpecialTab } from '../special/SpecialEventSection'
import './timeline.css'

interface Props {
  localDate: string
  reloadToken: number
  onChanged: () => void
  onEdit: (target: EditTarget) => void
}

// 타임라인에서 직접 인라인 수정 가능한 종류(특별한 일). 나머지(state/sleep/meal)는 각 카드에서 수정.
const SPECIAL_KINDS: ReadonlySet<TimelineKind> = new Set(['stress', 'activity', 'medication', 'health', 'weight'])
const KIND_TO_TAB: Partial<Record<TimelineKind, SpecialTab>> = {
  stress: 'stress',
  activity: 'activity',
  medication: 'medication',
  health: 'health',
  weight: 'weight',
}

/**
 * 오늘 타임라인 — 모든 기록을 timestamp 순으로 한데 보여준다.
 * 각 항목은 개별 레코드: 삭제는 그 레코드만 지운다(통째 replace 아님).
 * 특별한 일(스트레스/운동/약/예외/체중)은 "수정"으로 위 패널에서 편집.
 */
export function DayTimeline({ localDate, reloadToken, onChanged, onEdit }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])

  useEffect(() => {
    let cancelled = false
    void buildDayTimeline(localDate).then((list) => {
      if (!cancelled) setEntries(list)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, reloadToken])

  const hasMorning = entries.some((e) => e.kind === 'state' && e.title === '아침 상태')
  const hasEvening = entries.some((e) => e.kind === 'state' && e.title === '저녁 상태')

  const onDelete = async (entry: TimelineEntry) => {
    await deleteTimelineEntry(entry)
    onChanged()
  }

  return (
    <GlassCard>
      <SectionHeader title="오늘 타임라인" subtitle="이 날짜에 남긴 모든 기록 (시간 순)" />
      <div className="timeline-status">
        <span className={`timeline-pill${hasMorning ? ' timeline-pill--done' : ''}`}>아침 {hasMorning ? '완료' : '미기록'}</span>
        <span className={`timeline-pill${hasEvening ? ' timeline-pill--done' : ''}`}>저녁 {hasEvening ? '완료' : '미기록'}</span>
      </div>

      {entries.length === 0 ? (
        <p className="state-hint" style={{ marginTop: 12 }}>아직 기록이 없어요.</p>
      ) : (
        <ul className="dtl-list">
          {entries.map((e) => (
            <li className={`dtl-row dtl-row--${e.tone}`} key={`${e.kind}-${e.sourceId}`}>
              <span className="dtl-time">{formatClock(e.at)}</span>
              <span className="dtl-main">
                <span className="dtl-title">{e.title}</span>
                {e.detail && <span className="dtl-detail">{e.detail}</span>}
              </span>
              <span className="dtl-actions">
                {SPECIAL_KINDS.has(e.kind) && (
                  <button className="dtl-btn" onClick={() => onEdit({ kind: KIND_TO_TAB[e.kind]!, id: e.sourceId })}>수정</button>
                )}
                <button className="dtl-btn dtl-btn--del" aria-label="삭제" onClick={() => onDelete(e)}>삭제</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
