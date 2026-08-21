import { useEffect, useState } from 'react'
import { to12h, from12h, formatKoreanClock } from './sleepTime'

interface TimePickerSheetProps {
  open: boolean
  title: string
  /** 시작값 'HH:MM'(비었으면 호출부에서 initialSleepTime으로 채워 전달). */
  value: string
  onConfirm: (hhmm: string) => void
  onCancel: () => void
}

const HOURS12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const QUICK_MIN = [0, 10, 20, 30, 40, 50]

/**
 * 수면 시각 전용 커스텀 time picker(바텀시트). 달력 없음 · 시간만.
 * - 오전/오후 + 시(12개 칩) + 분(10분 빠른 칩 + ±1분 정밀) → 완료.
 * - 열릴 때 전달받은 value에서 시작한다(현재 시각에서 시작하지 않는다).
 */
export function TimePickerSheet({ open, title, value, onConfirm, onCancel }: TimePickerSheetProps) {
  const [h12, setH12] = useState(12)
  const [minute, setMinute] = useState(0)
  const [mer, setMer] = useState<'AM' | 'PM'>('AM')

  // 열릴 때마다 시작값으로 초기화.
  useEffect(() => {
    if (!open) return
    const p = to12h(value || '00:00')
    setH12(p.h12)
    setMinute(p.minute)
    setMer(p.meridiem)
  }, [open, value])

  if (!open) return null

  const current = from12h(h12, minute, mer)
  const bump = (delta: number) => setMinute((m) => (m + delta + 60) % 60)

  return (
    <div className="tp-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="tp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tp-head">
          <span className="tp-title">{title}</span>
          <span className="tp-display">{formatKoreanClock(current)}</span>
        </div>

        <div className="tp-mer" role="tablist" aria-label="오전/오후">
          {(['AM', 'PM'] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mer === m}
              className={`tp-mer__btn${mer === m ? ' tp-mer__btn--on' : ''}`} onClick={() => setMer(m)}>
              {m === 'AM' ? '오전' : '오후'}
            </button>
          ))}
        </div>

        <p className="tp-label">시</p>
        <div className="tp-hours">
          {HOURS12.map((h) => (
            <button key={h} type="button" className={`tp-chip${h12 === h ? ' tp-chip--on' : ''}`} onClick={() => setH12(h)}>
              {h}
            </button>
          ))}
        </div>

        <p className="tp-label">분</p>
        <div className="tp-mins">
          {QUICK_MIN.map((m) => (
            <button key={m} type="button" className={`tp-chip${minute === m ? ' tp-chip--on' : ''}`} onClick={() => setMinute(m)}>
              {String(m).padStart(2, '0')}
            </button>
          ))}
        </div>
        <div className="tp-fine">
          <button type="button" className="tp-fine__btn" aria-label="1분 빼기" onClick={() => bump(-1)}>−</button>
          <span className="tp-fine__val">{String(minute).padStart(2, '0')}분</span>
          <button type="button" className="tp-fine__btn" aria-label="1분 더하기" onClick={() => bump(1)}>＋</button>
        </div>

        <div className="tp-actions">
          <button type="button" className="tp-cancel" onClick={onCancel}>취소</button>
          <button type="button" className="tp-confirm" onClick={() => onConfirm(current)}>완료</button>
        </div>
      </div>
    </div>
  )
}
