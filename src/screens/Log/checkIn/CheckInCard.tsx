import { useEffect, useRef, useState } from 'react'
import { GlassCard, RatingScale } from '../../../design'
import type { ChipTone } from '../../../design'
import { CORE_STATE_META, promptedMetricsFor } from '../../../data/catalog/coreState'
import { stateMeasurementRepository } from '../../../data/repositories'
import type { RatingValue, StateMeasurement } from '../../../data/modelsV2'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { reportDirty, clearDirty } from './dirtyRegistry'
import {
  buildMeasurementInput,
  currentTimezoneOffsetMinutes,
  measurementToValues,
  serializeCheckIn,
  type CheckInValues,
} from './checkInForm'

interface CheckInCardProps {
  localDate: string
  checkInType: 'morning' | 'evening'
  /** 값이 바뀌면 기존 기록을 다시 불러온다(외부 저장/날짜 변경 반영). */
  reloadToken: number
  onSaved: () => void
}

const TITLES: Record<'morning' | 'evening', { title: string; sub: string; tone: ChipTone }> = {
  morning: { title: '아침 상태', sub: '기상 후 지금 느끼는 상태를 남겨요', tone: 'sky' },
  evening: { title: '저녁 상태', sub: '하루를 마무리하며 남겨요', tone: 'lav' },
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

/** 시각 → 'HH:MM'(로컬). */
function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 아침/저녁 체크인 1개 카드.
 * - 같은 날짜에 morning/evening 각각 독립적으로 upsert.
 * - 미선택 값은 저장하지 않는다(0으로 채우지 않음).
 * - recordedAt: 신규는 저장 순간, 기존 편집은 원래 측정 시각 유지.
 */
export function CheckInCard({ localDate, checkInType, reloadToken, onSaved }: CheckInCardProps) {
  const meta = TITLES[checkInType]
  const prompted = promptedMetricsFor(checkInType)
  const dirtyKey = `checkin-${checkInType}`

  const [expanded, setExpanded] = useState(false)
  const [values, setValues] = useState<CheckInValues>({})
  const [note, setNote] = useState('')
  const [existing, setExisting] = useState<StateMeasurement | undefined>(undefined)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const baselineRef = useRef<string>(serializeCheckIn({}, ''))

  // 기존 기록 로드(날짜/저장 반영). baseline도 갱신 → 단순 열람은 dirty 아님.
  useEffect(() => {
    let cancelled = false
    void stateMeasurementRepository.getByDateAndType(localDate, checkInType).then((m) => {
      if (cancelled) return
      const nextValues = m ? measurementToValues(m) : {}
      const nextNote = m?.note ?? ''
      setExisting(m)
      setValues(nextValues)
      setNote(nextNote)
      setStatus('idle')
      baselineRef.current = serializeCheckIn(nextValues, nextNote)
      reportDirty(dirtyKey, false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, checkInType, reloadToken, dirtyKey])

  // 미저장 입력 감지(펼쳤을 때만).
  useEffect(() => {
    if (!expanded) return
    reportDirty(dirtyKey, serializeCheckIn(values, note) !== baselineRef.current)
  }, [values, note, expanded, dirtyKey])

  // 언마운트 시 dirty 등록 해제.
  useEffect(() => () => clearDirty(dirtyKey), [dirtyKey])

  const setMetric = (metric: string, v: RatingValue) =>
    setValues((prev) => {
      const next = { ...prev }
      if (v === null) delete next[metric as keyof CheckInValues]
      else next[metric as keyof CheckInValues] = v
      return next
    })

  const onSave = async () => {
    setStatus('saving')
    setFormBusy(true)
    try {
      const recordedAt = existing?.recordedAt ?? new Date().toISOString()
      await stateMeasurementRepository.upsertCheckIn(
        buildMeasurementInput({
          localDate,
          checkInType,
          promptedMetrics: prompted,
          values,
          note,
          recordedAt,
          timezoneOffsetMinutes: currentTimezoneOffsetMinutes(),
        }),
      )
      baselineRef.current = serializeCheckIn(values, note)
      reportDirty(dirtyKey, false)
      setStatus('success')
      onSaved()
    } catch (e) {
      console.error('[MODE] 체크인 저장 실패', e)
      setStatus('error')
    } finally {
      setFormBusy(false)
    }
  }

  const answeredCount = prompted.filter((m) => {
    const v = values[m]
    return v !== undefined && v !== null
  }).length

  const statusText = existing
    ? `${formatTime(existing.recordedAt)} 기록됨`
    : '아직 기록 안 함'

  return (
    <GlassCard tint={checkInType === 'morning' ? 'sky' : 'lav'}>
      <button
        type="button"
        className="checkin-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="checkin-head__main">
          <span className="checkin-head__title">{meta.title}</span>
          <span className="checkin-head__sub">{meta.sub}</span>
        </span>
        <span className={`checkin-badge${existing ? ' checkin-badge--done' : ''}`}>{statusText}</span>
      </button>

      {expanded && (
        <div className="checkin-body">
          {prompted.map((m) => (
            <RatingScale
              key={m}
              label={CORE_STATE_META[m].label}
              lowLabel={CORE_STATE_META[m].lowLabel}
              highLabel={CORE_STATE_META[m].highLabel}
              tone={meta.tone}
              value={values[m] ?? null}
              onChange={(v) => setMetric(m, v)}
            />
          ))}

          <label className="checkin-note-label">
            메모 (선택 · 분석 대상 아님)
            <textarea
              className="memo"
              rows={2}
              placeholder="남기고 싶은 한 줄…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <p className="state-hint">
            고르지 않은 항목은 "미측정"으로 남아. 0으로 저장되지 않아. · {prompted.length}개 중 {answeredCount}개 응답
          </p>

          <button className="btn-primary" onClick={onSave} disabled={status === 'saving'}>
            {status === 'saving'
              ? '저장 중…'
              : status === 'success'
                ? '저장됐어'
                : existing
                  ? `${meta.title} 수정`
                  : `${meta.title} 저장`}
          </button>
          {status === 'error' && <p className="log-feedback log-feedback--err">저장에 실패했어. 다시 시도해 줘.</p>}
        </div>
      )}
    </GlassCard>
  )
}
