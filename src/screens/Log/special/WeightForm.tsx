import { useState } from 'react'
import { TriChoice } from '../episodes/TriChoice'
import { weightMeasurementRepository } from '../../../data/repositories'
import type { TriBoolean, WeightMeasurement } from '../../../data/modelsV2'
import { toISODate } from '../../../lib/date'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue } from '../episodes/time'
import { useGlobalSaver } from '../checkIn/useGlobalSaver'
import { SAVE_ORDER } from '../checkIn/dirtyRegistry'
import { weightDirty, weightCanSave } from './draftDirty'

interface Props {
  editRecord?: WeightMeasurement | null
  onSaved: () => void
  onCancelEdit?: () => void
}

/**
 * 체중 1건(선택 기능). weightKg + measuredAt + userSawWeight.
 * ⚠️ 체중 숫자 자체와 "그 숫자를 본" 심리적 exposure(userSawWeight)를 분리한다.
 *    userSawWeight: 예(true)/아니오(false)/모름(unknown)/미입력(null) 구분.
 */
export function WeightForm({ editRecord, onSaved, onCancelEdit }: Props) {
  const editing = editRecord != null
  const [weight, setWeight] = useState<string>(editRecord ? String(editRecord.weightKg) : '')
  const [measuredAt, setMeasuredAt] = useState<string>(
    editRecord ? toDatetimeLocalValue(editRecord.measuredAt) : nowDatetimeLocalValue(),
  )
  const [saw, setSaw] = useState<TriBoolean>(editRecord?.userSawWeight ?? null)
  const [saving, setSaving] = useState(false)

  const weightNum = Number(weight)
  const canSave = weightCanSave(weight)

  const onSave = async (): Promise<boolean | { ok: false; message: string }> => {
    if (!canSave) return { ok: false, message: '체중 값을 한 번 확인해줘.' }
    const at = fromDatetimeLocalValue(measuredAt) ?? new Date().toISOString()
    setSaving(true)
    setFormBusy(true)
    try {
      const patch = {
        localDate: toISODate(new Date(at)),
        measuredAt: at,
        weightKg: weightNum,
        userSawWeight: saw,
        source: 'manual' as const,
        schemaVersion: 1,
      }
      if (editing && editRecord?.id != null) await weightMeasurementRepository.update(editRecord.id, patch)
      else await weightMeasurementRepository.add(patch)
      if (!editing) {
        setWeight('')
        setSaw(null)
        setMeasuredAt(nowDatetimeLocalValue())
      }
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 체중 저장 실패', e)
      return false
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  useGlobalSaver('weight-measurement', weightDirty(weight, saw), onSave, { label: '체중 기록', order: SAVE_ORDER.health })

  return (
    <div className="special-form">
      <label className="dt-field">
        체중(kg)
        <input type="number" min={0} step="0.1" inputMode="decimal" className="dt-input dt-input--num" placeholder="예: 56.3" value={weight} onChange={(e) => setWeight(e.target.value)} />
      </label>
      <label className="dt-field">
        측정 시각
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setMeasuredAt(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>

      <TriChoice label="숫자를 봤나?" value={saw} onChange={setSaw} tone="lav" />
      <p className="state-hint">몸무게 값과 "숫자를 본 것"은 다른 기록이야. 안 봤으면 "아니오", 자동 측정만 됐으면 그대로 둬요.</p>

      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave} disabled={!canSave || saving}>
          {saving ? '저장 중…' : editing ? '체중 수정' : '체중 저장'}
        </button>
        {editing && <button className="custom-cancel-btn" onClick={onCancelEdit}>취소</button>}
      </div>
    </div>
  )
}
