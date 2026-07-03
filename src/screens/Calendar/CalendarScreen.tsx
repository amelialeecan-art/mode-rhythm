import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { LensTabs, HeatmapCalendar, type LensOption, type HeatmapCell } from '../../design'
import {
  getCalendarMonth,
  getCalendarDayDetail,
  shiftMonthISO,
  type CalendarLens,
  type CalendarMonthViewModel,
  type CalendarDayDetail,
} from '../../data/services/calendarService'
import { DAY_TYPE_LABEL } from '../../engine'
import { startOfMonthISO, parseISODate, formatMonthDay, formatWeekday } from '../../lib/date'
import type { FlowLevel } from '../../data/models'
import './calendar.css'

const LENSES: LensOption[] = [
  { key: 'overall', label: '전체' },
  { key: 'emotion', label: '감정' },
  { key: 'appetite', label: '식욕' },
  { key: 'sleep', label: '수면' },
  { key: 'body', label: '몸' },
  { key: 'cycle', label: '주기' },
  { key: 'event', label: '사건' },
  { key: 'recovery', label: '회복' },
]

const FLOW_LABEL: Record<FlowLevel, string> = { none: '없음', light: '적음', normal: '보통', heavy: '많음' }

const DETAIL_BARS: { key: CalendarLens; label: string; color: string }[] = [
  { key: 'emotion', label: '감정', color: 'var(--lav)' },
  { key: 'appetite', label: '식욕', color: 'var(--coral)' },
  { key: 'sleep', label: '수면', color: 'var(--sky)' },
  { key: 'body', label: '몸', color: 'var(--mint)' },
  { key: 'cycle', label: '주기', color: 'var(--rose)' },
  { key: 'event', label: '사건', color: 'var(--butter)' },
]

/** 점수(0~100) → 색 단계(0~4). */
function scoreToLevel(s: number): number {
  if (s <= 20) return 0
  if (s <= 40) return 1
  if (s <= 60) return 2
  if (s <= 80) return 3
  return 4
}

const TODAY_MONTH = startOfMonthISO(new Date())

export function CalendarScreen() {
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState<string>(TODAY_MONTH)
  const [lens, setLens] = useState<CalendarLens>('overall')
  const [month, setMonth] = useState<CalendarMonthViewModel | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [detail, setDetail] = useState<CalendarDayDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    void getCalendarMonth(anchor).then((vm) => {
      if (!cancelled) setMonth(vm)
    })
    return () => {
      cancelled = true
    }
  }, [anchor])

  useEffect(() => {
    if (!selectedDate) {
      setDetail(null)
      return
    }
    let cancelled = false
    void getCalendarDayDetail(selectedDate).then((d) => {
      if (!cancelled) setDetail(d)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDate])

  const cells: HeatmapCell[] = (month?.days ?? []).map((d) => {
    if (!d.isCurrentMonth) return { padding: true }
    if (!d.hasEntry || !d.scores) return { id: d.date, dayNumber: d.dayNumber, today: d.isToday }
    return {
      id: d.date,
      dayNumber: d.dayNumber,
      today: d.isToday,
      intensity: scoreToLevel(d.scores[lens]),
      label: d.shortLabel,
    }
  })

  const lensLabel = LENSES.find((l) => l.key === lens)?.label ?? '전체'
  const atCurrentMonth = anchor >= TODAY_MONTH

  return (
    <>
      <header className="calhead">
        <div className="calnav">
          <button className="calnav__btn" aria-label="이전 달" onClick={() => setAnchor(shiftMonthISO(anchor, -1))}>
            ‹
          </button>
          <span className="calhead__m">{month?.monthLabel ?? ''}</span>
          <button className="calnav__btn" aria-label="다음 달" disabled={atCurrentMonth} onClick={() => setAnchor(shiftMonthISO(anchor, 1))}>
            ›
          </button>
        </div>
        <div className="calhead__right">
          {anchor !== TODAY_MONTH && (
            <button className="caltoday" onClick={() => setAnchor(TODAY_MONTH)}>
              오늘
            </button>
          )}
          <span className="calhead__lbl">렌즈 · {lensLabel}</span>
        </div>
      </header>

      <LensTabs options={LENSES} active={lens} onChange={(k) => setLens(k as CalendarLens)} />

      <HeatmapCalendar cells={cells} lens={lens} onSelect={setSelectedDate} />

      {lens === 'recovery' ? (
        <>
          <p className="callegend">
            회복 렌즈는 회복 행동을 기록한 날과 자기보고 회복 점수를 보여줘요. 색이 진할수록 회복 기록이 강하게 남은 날이에요.
          </p>
          <p className="callegend callegend--soft">여기서 진함은 부하가 아니라 회복 기록이 높음을 뜻해요.</p>
        </>
      ) : (
        <p className="callegend">
          색이 진할수록 해당 렌즈의 부하가 높게 기록된 날이에요. 기록이 없는 날은 색을 표시하지 않아요.
        </p>
      )}

      {detail && <DayDetailSheet detail={detail} onClose={() => setSelectedDate(null)} onRecord={(date) => navigate(`/log?date=${date}`)} />}
    </>
  )
}

function DayDetailSheet({
  detail,
  onClose,
  onRecord,
}: {
  detail: CalendarDayDetail
  onClose: () => void
  onRecord: (date: string) => void
}) {
  const d = parseISODate(detail.date)
  const score = detail.dailyScore

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={`${formatMonthDay(d)} 상세`}>
        <div className="sheet__handle" />
        <p className="sheet__date">
          {formatMonthDay(d)} <small>{formatWeekday(d)}</small>
        </p>

        {!detail.hasEntry ? (
          <>
            <p className="sheet__hint">이 날은 아직 기록이 없어요.</p>
            <button className="btn-primary sheet__close" onClick={() => onRecord(detail.date)}>
              이 날짜 기록하기
            </button>
          </>
        ) : (
          <div className="sheet__body">
            {score ? (
              <>
                <div className="sheet__moderow">
                  <p className="sheet__mode">{DAY_TYPE_LABEL[score.dayType]}</p>
                  {score.dayTypeSubLabel && <span className="sheet__paren">{score.dayTypeSubLabel}</span>}
                  <span className="sheet__rhythm">{score.rhythmLoad}</span>
                </div>

                <div className="sheet-bars">
                  {DETAIL_BARS.map((b) => {
                    const v = lensScore(score, b.key)
                    return (
                      <div className="sheet-bar" key={b.key}>
                        <span className="sheet-bar__label">{b.label}</span>
                        <span className="sheet-bar__track">
                          <i style={{ width: `${v}%`, background: b.color }} />
                        </span>
                        <span className="sheet-bar__val">{v}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="sheet__hint">이 날은 점수 계산 기록이 없어요.</p>
            )}

            {/* 오늘 상태 (원인 아님 — 상태 기록) */}
            <Section title="오늘 상태">
              {detail.stateLabels.length > 0 ? (
                <div className="sheet-chips">
                  {detail.stateLabels.map((l) => (
                    <span className="sheet-chip sheet-chip--state" key={l}>
                      {l}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="sheet__hint">저장된 상태 기록이 없어요.</p>
              )}
            </Section>

            {detail.eventLogs.length > 0 && (
              <Section title="오늘 있었던 일">
                <div className="sheet-chips">
                  {detail.eventLogs.map((e) => (
                    <span className="sheet-chip" key={e.id ?? e.eventCode}>
                      {e.eventLabel}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {detail.cycleLogs.length > 0 && (
              <Section title="생리 기록">
                <div className="sheet-chips">
                  {detail.cycleLogs.map((c) => (
                    <span className="sheet-fact" key={c.id ?? c.date}>
                      {c.periodStart && '생리 시작 · '}
                      {c.periodEnd && '생리 종료 · '}
                      {c.flowLevel && `출혈 ${FLOW_LABEL[c.flowLevel]} · `}
                      {c.periodPain != null && `생리통 ${c.periodPain} · `}
                      {c.symptoms?.length ? c.symptoms.join(', ') : ''}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {detail.recoveryLogs.length > 0 && (
              <Section title="회복 행동">
                <div className="sheet-chips">
                  {detail.recoveryLogs.map((r) => (
                    <span className="sheet-chip sheet-chip--mint" key={r.id ?? r.actionCode}>
                      {r.actionLabel}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {detail.dailyLog?.memo && (
              <Section title="메모">
                <p className="sheet-memo">{detail.dailyLog.memo}</p>
              </Section>
            )}

            <p className="sheet__note">
              이 요약은 해당 날짜에 저장된 기록과 계산 점수 기준이에요. 장기 패턴 분석은 아직 포함되지 않았어요.
            </p>
          </div>
        )}

        <button className="sheet__closebtn" onClick={onClose}>
          닫기
        </button>
      </div>
    </>
  )
}

function lensScore(score: { emotionalLoad: number; appetiteLoad: number; sleepLoad: number; bodyLoad: number; cycleLoad: number; eventLoad: number }, key: CalendarLens): number {
  switch (key) {
    case 'emotion':
      return score.emotionalLoad
    case 'appetite':
      return score.appetiteLoad
    case 'sleep':
      return score.sleepLoad
    case 'body':
      return score.bodyLoad
    case 'cycle':
      return score.cycleLoad
    case 'event':
      return score.eventLoad
    default:
      return 0
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sheet-section">
      <p className="sheet-section__title">{title}</p>
      {children}
    </div>
  )
}
