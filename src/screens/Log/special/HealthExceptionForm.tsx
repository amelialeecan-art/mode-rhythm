import { useState } from 'react'
import { Chip, ChipGroup, RatingScale } from '../../../design'
import { HEALTH_EXCEPTIONS } from '../../../data/catalog/healthExceptions'
import { healthExceptionRepository } from '../../../data/repositories'
import type { HealthException, HealthExceptionCategory, RatingValue } from '../../../data/modelsV2'
import { toISODate } from '../../../lib/date'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue } from '../episodes/time'
import { useGlobalSaver } from '../checkIn/useGlobalSaver'
import { SAVE_ORDER } from '../checkIn/dirtyRegistry'

interface Props {
  editRecord?: HealthException | null
  onSaved: () => void
  onCancelEdit?: () => void
}

/**
 * Health Exception 1건. 고정 category + timestamp (+ 선택 intensity).
 * ⚠️ 기타 메모가 있어도 분석은 category를 기본으로 쓴다.
 */
export function HealthExceptionForm({ editRecord, onSaved, onCancelEdit }: Props) {
  const editing = editRecord != null
  const [category, setCategory] = useState<HealthExceptionCategory>(editRecord?.category ?? 'illness')
  const [intensity, setIntensity] = useState<RatingValue>(editRecord?.intensity ?? null)
  const [occurredAt, setOccurredAt] = useState<string>(
    editRecord?.occurredAt ? toDatetimeLocalValue(editRecord.occurredAt) : nowDatetimeLocalValue(),
  )
  const [saving, setSaving] = useState(false)

  const onSave = async (): Promise<boolean> => {
    const at = fromDatetimeLocalValue(occurredAt) ?? new Date().toISOString()
    setSaving(true)
    setFormBusy(true)
    try {
      const patch = {
        localDate: toISODate(new Date(at)),
        occurredAt: at,
        category,
        intensity,
        source: 'manual' as const,
        schemaVersion: 1,
      }
      if (editing && editRecord?.id != null) await healthExceptionRepository.update(editRecord.id, patch)
      else await healthExceptionRepository.add(patch)
      if (!editing) {
        setIntensity(null)
        setOccurredAt(nowDatetimeLocalValue())
      }
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 건강 예외 저장 실패', e)
      return false
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  // category는 기본값(illness)이 있어 "종류를 바꿨거나 강도를 골랐을 때"만 draft로 본다(§3-A).
  const dirty = editing || intensity !== null || category !== 'illness'
  useGlobalSaver('health-exception', dirty, onSave, { label: '건강 예외 기록', order: SAVE_ORDER.health })

  return (
    <div className="special-form">
      <p className="event-group__label">어떤 예외였어?</p>
      <ChipGroup label="건강 예외 종류">
        {HEALTH_EXCEPTIONS.map((h) => (
          <Chip key={h.code} label={h.label} tone="neutral" selected={category === h.code} onToggle={() => setCategory(h.code)} />
        ))}
      </ChipGroup>

      <label className="dt-field">
        발생 시각
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setOccurredAt(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>

      <RatingScale label="강도 (선택)" lowLabel="약함" highLabel="매우 심함" tone="neutral" value={intensity} onChange={setIntensity} />

      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? '저장 중…' : editing ? '예외 수정' : '예외 저장'}
        </button>
        {editing && <button className="custom-cancel-btn" onClick={onCancelEdit}>취소</button>}
      </div>
    </div>
  )
}
