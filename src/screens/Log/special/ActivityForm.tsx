import { useState } from 'react'
import { Chip, ChipGroup, RatingScale } from '../../../design'
import { ACTIVITY_TYPES } from '../../../data/catalog/activityTypes'
import { activityEpisodeRepository } from '../../../data/repositories'
import type { ActivityEpisode, ActivityType, RatingValue } from '../../../data/modelsV2'
import { toISODate } from '../../../lib/date'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue } from '../episodes/time'

interface Props {
  editRecord?: ActivityEpisode | null
  onSaved: () => void
  onCancelEdit?: () => void
}

/**
 * 운동 1건(ActivityEpisode). "운동함 Y/N"이 아니라 type + duration + RPE.
 * steps/activeCalories는 선택 — 없으면 duration+RPE+type만으로 저장 가능.
 */
export function ActivityForm({ editRecord, onSaved, onCancelEdit }: Props) {
  const editing = editRecord != null
  const [type, setType] = useState<ActivityType>(editRecord?.activityType ?? 'strength')
  const [startedAt, setStartedAt] = useState<string>(
    editRecord ? toDatetimeLocalValue(editRecord.startedAt) : nowDatetimeLocalValue(),
  )
  const [duration, setDuration] = useState<string>(editRecord ? String(editRecord.durationMinutes) : '')
  const [rpe, setRpe] = useState<RatingValue>(editRecord?.rpe ?? null)
  const [steps, setSteps] = useState<string>(editRecord?.steps == null ? '' : String(editRecord.steps))
  const [saving, setSaving] = useState(false)

  const durNum = Number(duration)
  const canSave = duration.trim() !== '' && Number.isFinite(durNum) && durNum >= 0

  const onSave = async () => {
    if (!canSave) return
    const startIso = fromDatetimeLocalValue(startedAt) ?? new Date().toISOString()
    setSaving(true)
    setFormBusy(true)
    try {
      const patch = {
        localDate: toISODate(new Date(startIso)),
        startedAt: startIso,
        durationMinutes: durNum,
        rpe,
        activityType: type,
        steps: steps.trim() === '' ? null : Number(steps),
        source: 'manual' as const,
        schemaVersion: 1,
      }
      if (editing && editRecord?.id != null) await activityEpisodeRepository.update(editRecord.id, patch)
      else await activityEpisodeRepository.add(patch)
      if (!editing) {
        setDuration('')
        setRpe(null)
        setSteps('')
        setStartedAt(nowDatetimeLocalValue())
      }
      onSaved()
    } catch (e) {
      console.error('[MODE] 운동 저장 실패', e)
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  return (
    <div className="special-form">
      <p className="event-group__label">종류</p>
      <ChipGroup label="운동 종류">
        {ACTIVITY_TYPES.map((a) => (
          <Chip key={a.code} label={a.label} tone="mint" selected={type === a.code} onToggle={() => setType(a.code)} />
        ))}
      </ChipGroup>

      <label className="dt-field">
        시작 시각
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setStartedAt(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>
      <label className="dt-field">
        운동 시간(분)
        <input type="number" min={0} inputMode="numeric" className="dt-input dt-input--num" placeholder="예: 45" value={duration} onChange={(e) => setDuration(e.target.value)} />
      </label>

      <RatingScale label="RPE (주관적 강도)" lowLabel="아주 약함" highLabel="최대" tone="mint" value={rpe} onChange={setRpe} />

      <label className="dt-field">
        걸음 수 (선택)
        <input type="number" min={0} inputMode="numeric" className="dt-input dt-input--num" placeholder="미입력" value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>

      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave} disabled={!canSave || saving}>
          {saving ? '저장 중…' : editing ? '운동 수정' : '운동 저장'}
        </button>
        {editing && <button className="custom-cancel-btn" onClick={onCancelEdit}>취소</button>}
      </div>
    </div>
  )
}
