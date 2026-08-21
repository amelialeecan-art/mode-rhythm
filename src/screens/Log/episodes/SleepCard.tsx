import { useEffect, useRef, useState } from 'react'
import { GlassCard, RatingScale } from '../../../design'
import { sleepEpisodeRepository } from '../../../data/repositories'
import type { RatingValue, SleepEpisode } from '../../../data/modelsV2'
import { sleepDuration, sleepMidpoint, formatSleepDuration } from '../../../engine/sleepDerived'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { reportDirty, clearDirty } from '../checkIn/dirtyRegistry'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue, formatClock } from './time'

interface SleepCardProps {
  localDate: string
  reloadToken: number
  onSaved: () => void
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'
const DIRTY_KEY = 'sleep-episode'

interface SleepForm {
  bed: string // datetime-local 값
  onset: string
  wake: string
  awakenings: string // 숫자 문자열 ('' = 미입력)
  satisfaction: RatingValue
}

const EMPTY: SleepForm = { bed: '', onset: '', wake: '', awakenings: '', satisfaction: null }

function fromEpisode(ep: SleepEpisode): SleepForm {
  return {
    bed: toDatetimeLocalValue(ep.wentToBedAt),
    onset: toDatetimeLocalValue(ep.sleepOnsetAt),
    wake: toDatetimeLocalValue(ep.wakeAt),
    awakenings: ep.awakenings === undefined || ep.awakenings === null ? '' : String(ep.awakenings),
    satisfaction: ep.satisfaction ?? null,
  }
}

function serialize(f: SleepForm): string {
  return JSON.stringify(f)
}

/**
 * 지난밤 수면 (V2 SleepEpisode). 깨어난 날짜(localDate)에 1행 upsert.
 * - 시각 3개는 datetime-local(자정 넘김 안전) · 수면시간/중간시각은 파생으로 표시(입력 아님).
 * - 미입력은 저장 안 함(null 유지) — 0으로 채우지 않는다.
 */
export function SleepCard({ localDate, reloadToken, onSaved }: SleepCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState<SleepForm>(EMPTY)
  const [existing, setExisting] = useState<SleepEpisode | undefined>()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string>('')
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

  // 라이브 파생값 (저장 아님)
  const onsetIso = fromDatetimeLocalValue(form.onset)
  const wakeIso = fromDatetimeLocalValue(form.wake)
  const durationText = formatSleepDuration(sleepDuration({ sleepOnsetAt: onsetIso, wakeAt: wakeIso }))
  const midIso = sleepMidpoint({ sleepOnsetAt: onsetIso, wakeAt: wakeIso })

  const onSave = async () => {
    setStatus('saving')
    setError('')
    setFormBusy(true)
    try {
      const awakeningsNum = form.awakenings.trim() === '' ? null : Number(form.awakenings)
      await sleepEpisodeRepository.upsertByDate({
        localDate,
        wentToBedAt: fromDatetimeLocalValue(form.bed),
        sleepOnsetAt: fromDatetimeLocalValue(form.onset),
        wakeAt: fromDatetimeLocalValue(form.wake),
        awakenings: awakeningsNum,
        satisfaction: form.satisfaction,
        source: 'manual',
        schemaVersion: 1,
      })
      baselineRef.current = serialize(form)
      reportDirty(DIRTY_KEY, false)
      setStatus('success')
      onSaved()
    } catch (e) {
      console.error('[MODE] 수면 저장 실패', e)
      setError('시각 순서를 확인해 줘 (취침 → 잠듦 → 기상).')
      setStatus('error')
    } finally {
      setFormBusy(false)
    }
  }

  const statusText = existing?.wakeAt
    ? `${formatClock(existing.wakeAt)} 기상`
    : existing
      ? '기록됨'
      : '아직 기록 안 함'

  return (
    <GlassCard tint="sky">
      <button type="button" className="checkin-head" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <span className="checkin-head__main">
          <span className="checkin-head__title">지난밤 수면</span>
          <span className="checkin-head__sub">시각을 남기면 수면시간은 앱이 계산해</span>
        </span>
        <span className={`checkin-badge${existing ? ' checkin-badge--done' : ''}`}>{statusText}</span>
      </button>

      {expanded && (
        <div className="checkin-body">
          <label className="dt-field">
            잠자리에 든 시각
            <input type="datetime-local" className="dt-input" value={form.bed} onChange={(e) => patch({ bed: e.target.value })} />
          </label>
          <label className="dt-field">
            실제 잠든 시각
            <input type="datetime-local" className="dt-input" value={form.onset} onChange={(e) => patch({ onset: e.target.value })} />
          </label>
          <label className="dt-field">
            최종 기상 시각
            <span className="dt-with-now">
              <input type="datetime-local" className="dt-input" value={form.wake} onChange={(e) => patch({ wake: e.target.value })} />
              <button type="button" className="dt-now" onClick={() => patch({ wake: nowDatetimeLocalValue() })}>
                지금
              </button>
            </span>
          </label>

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
    </GlassCard>
  )
}
