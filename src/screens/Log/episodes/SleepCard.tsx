import { useEffect, useRef, useState } from 'react'
import { GlassCard, RatingScale } from '../../../design'
import { sleepEpisodeRepository } from '../../../data/repositories'
import type { RatingValue, SleepEpisode } from '../../../data/modelsV2'
import { sleepDuration, sleepMidpoint, formatSleepDuration } from '../../../engine/sleepDerived'
import { validateSleepChronology } from '../../../data/v2Validation'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { reportDirty, clearDirty, registerSaver, unregisterSaver, SAVE_ORDER } from '../checkIn/dirtyRegistry'
import { formatClock } from './time'
import {
  clockFromIso,
  composeSleepTimes,
  initialSleepTime,
  formatKoreanClock,
  type SleepField,
  type SleepTimes,
} from './sleepTime'
import { TimePickerSheet } from './TimePickerSheet'

interface SleepCardProps {
  localDate: string
  reloadToken: number
  onSaved: () => void
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'
const DIRTY_KEY = 'sleep-episode'

interface SleepForm {
  bed: string // 'HH:MM' (날짜는 저장 시 앱이 rollover로 조합)
  onset: string
  wake: string
  awakenings: string // 숫자 문자열 ('' = 미입력)
  satisfaction: RatingValue
}

const EMPTY: SleepForm = { bed: '', onset: '', wake: '', awakenings: '', satisfaction: null }

const FIELD_LABEL: Record<SleepField, string> = {
  bed: '잠자리에 든 시각',
  onset: '실제로 잠든 시각',
  wake: '마지막으로 일어난 시각',
}

function fromEpisode(ep: SleepEpisode): SleepForm {
  return {
    bed: clockFromIso(ep.wentToBedAt),
    onset: clockFromIso(ep.sleepOnsetAt),
    wake: clockFromIso(ep.wakeAt),
    awakenings: ep.awakenings === undefined || ep.awakenings === null ? '' : String(ep.awakenings),
    satisfaction: ep.satisfaction ?? null,
  }
}

function serialize(f: SleepForm): string {
  return JSON.stringify(f)
}

function nowClock(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 지난밤 수면 (V2 SleepEpisode). 깨어난 날짜(localDate)에 1행 upsert.
 * - 시각 3개는 '시간만' 입력(달력 없음) — 자정 rollover는 composeSleepTimes가 처리.
 * - picker는 기존 값 → 앞 필드 값 → 00:00 순으로 시작(현재 시각에서 시작하지 않음).
 * - 수면시간/중간시각은 파생 표시(입력 아님). 미입력은 저장 안 함(null 유지).
 */
export function SleepCard({ localDate, reloadToken, onSaved }: SleepCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState<SleepForm>(EMPTY)
  const [existing, setExisting] = useState<SleepEpisode | undefined>()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string>('')
  const [openField, setOpenField] = useState<SleepField | null>(null)
  const baselineRef = useRef<string>(serialize(EMPTY))

  useEffect(() => {
    let cancelled = false
    void sleepEpisodeRepository.getByDate(localDate).then((ep) => {
      if (cancelled) return
      const next = ep ? fromEpisode(ep) : EMPTY
      setExisting(ep)
      setForm(next)
      setStatus('idle')
      setError('')
      baselineRef.current = serialize(next)
      reportDirty(DIRTY_KEY, false)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, reloadToken])

  useEffect(() => {
    if (!expanded) return
    reportDirty(DIRTY_KEY, serialize(form) !== baselineRef.current)
  }, [form, expanded])

  useEffect(() => () => clearDirty(DIRTY_KEY), [])

  const patch = (p: Partial<SleepForm>) => setForm((f) => ({ ...f, ...p }))

  // 라이브 파생값 (저장 아님) — 시각만으로 rollover 조합 후 계산.
  const times: SleepTimes = { bed: form.bed, onset: form.onset, wake: form.wake }
  const composed = composeSleepTimes(localDate, times)
  const durationText = formatSleepDuration(sleepDuration({ sleepOnsetAt: composed.sleepOnsetAt, wakeAt: composed.wakeAt }))
  const midIso = sleepMidpoint({ sleepOnsetAt: composed.sleepOnsetAt, wakeAt: composed.wakeAt })

  const onSave = async (): Promise<boolean> => {
    const iso = composeSleepTimes(localDate, times)
    // §7 사람말 chronology 안내(rollover 반영 후 절대 시각 기준).
    const errs = validateSleepChronology(iso)
    if (errs.includes('sleep-chronology')) {
      const bedT = iso.wentToBedAt ? Date.parse(iso.wentToBedAt) : undefined
      const onsetT = iso.sleepOnsetAt ? Date.parse(iso.sleepOnsetAt) : undefined
      const wakeT = iso.wakeAt ? Date.parse(iso.wakeAt) : undefined
      if (bedT !== undefined && onsetT !== undefined && onsetT < bedT) {
        setError('잠든 시간이 잠자리에 누운 시간보다 빨라. 시간을 한 번 확인해줘.')
      } else if (onsetT !== undefined && wakeT !== undefined && wakeT < onsetT) {
        setError('일어난 시간이 잠든 시간보다 빨라. 시간을 한 번 확인해줘.')
      } else {
        setError('시간 순서가 맞는지 한 번 확인해줘.')
      }
      setStatus('error')
      return false
    }
    setStatus('saving')
    setError('')
    setFormBusy(true)
    try {
      const awakeningsNum = form.awakenings.trim() === '' ? null : Number(form.awakenings)
      await sleepEpisodeRepository.upsertByDate({
        localDate,
        wentToBedAt: iso.wentToBedAt,
        sleepOnsetAt: iso.sleepOnsetAt,
        wakeAt: iso.wakeAt,
        awakenings: awakeningsNum,
        satisfaction: form.satisfaction,
        source: 'manual',
        schemaVersion: 1,
      })
      baselineRef.current = serialize(form)
      reportDirty(DIRTY_KEY, false)
      setStatus('success')
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 수면 저장 실패', e)
      setError('저장하지 못했어. 시간을 한 번 확인해줘.')
      setStatus('error')
      return false
    } finally {
      setFormBusy(false)
    }
  }

  // 전역 저장바가 이 카드의 canonical save를 그대로 호출하도록 등록(중복 저장 로직 없음).
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  useEffect(() => {
    registerSaver(DIRTY_KEY, () => saveRef.current(), '수면 기록', SAVE_ORDER.sleep)
    return () => unregisterSaver(DIRTY_KEY)
  }, [])

  const statusText = existing?.wakeAt
    ? `${formatClock(existing.wakeAt)} 기상`
    : existing
      ? '기록됨'
      : '아직 기록 안 함'

  const renderTimeRow = (field: SleepField, withNow = false) => (
    <div className="dt-field" key={field}>
      <span className="dt-field__label">{FIELD_LABEL[field]}</span>
      <span className="dt-with-now">
        <button type="button" className={`time-value${form[field] ? '' : ' time-value--empty'}`} onClick={() => setOpenField(field)}>
          {formatKoreanClock(form[field]) ?? '시간 선택'}
        </button>
        {withNow && (
          <button type="button" className="dt-now" onClick={() => patch({ wake: nowClock() })}>
            지금
          </button>
        )}
      </span>
    </div>
  )

  return (
    <GlassCard tint="sky">
      <button type="button" className="checkin-head" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <span className="checkin-head__main">
          <span className="checkin-head__title">지난밤 수면</span>
          <span className="checkin-head__sub">시각만 남기면 날짜·수면시간은 앱이 계산해</span>
        </span>
        <span className={`checkin-badge${existing ? ' checkin-badge--done' : ''}`}>{statusText}</span>
      </button>

      {expanded && (
        <div className="checkin-body">
          {renderTimeRow('bed')}
          {renderTimeRow('onset')}
          {renderTimeRow('wake', true)}

          <label className="dt-field">
            밤중 깬 횟수
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className="dt-input dt-input--num"
              placeholder="미입력"
              value={form.awakenings}
              onChange={(e) => patch({ awakenings: e.target.value })}
            />
          </label>

          <RatingScale
            label="수면 만족도"
            lowLabel="나쁨"
            highLabel="좋음"
            tone="sky"
            value={form.satisfaction}
            onChange={(v) => patch({ satisfaction: v })}
          />

          <div className="derived-row">
            <span className="derived-chip">수면시간 {durationText ?? '—'}</span>
            <span className="derived-chip">중간시각 {midIso ? formatClock(midIso) : '—'}</span>
          </div>
          <p className="state-hint">고르지 않은 항목은 미측정으로 남아. 0으로 저장되지 않아.</p>

          <button className="btn-primary" onClick={onSave} disabled={status === 'saving'}>
            {status === 'saving' ? '저장 중…' : status === 'success' ? '저장됐어' : existing ? '수면 수정' : '수면 저장'}
          </button>
          {status === 'error' && <p className="log-feedback log-feedback--err">{error}</p>}
        </div>
      )}

      <TimePickerSheet
        open={openField !== null}
        title={openField ? FIELD_LABEL[openField] : ''}
        value={openField ? initialSleepTime(openField, times) : '00:00'}
        onConfirm={(hhmm) => {
          if (openField) patch({ [openField]: hhmm } as Partial<SleepForm>)
          setOpenField(null)
        }}
        onCancel={() => setOpenField(null)}
      />
    </GlassCard>
  )
}
