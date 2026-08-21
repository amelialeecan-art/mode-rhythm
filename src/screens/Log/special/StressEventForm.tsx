import { useState } from 'react'
import { Chip, ChipGroup, RatingScale } from '../../../design'
import { STRESS_CATEGORIES, buildStressEventInput, type StressCategoryCode } from '../../../data/catalog/stressEvents'
import { eventLogRepository } from '../../../data/repositories'
import type { EventLog } from '../../../data/models'
import type { RatingValue } from '../../../data/modelsV2'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue } from '../episodes/time'
import { useGlobalSaver } from '../checkIn/useGlobalSaver'
import { SAVE_ORDER } from '../checkIn/dirtyRegistry'
import { stressDirty, stressCanSave } from './draftDirty'

interface Props {
  localDate: string
  editRecord?: EventLog | null
  onSaved: () => void
  onCancelEdit?: () => void
}

/**
 * 스트레스 사건 1건 입력(개별 레코드). category + intensity(0~10) + occurredAt.
 * 여러 사건은 각각 독립 강도를 가진다 — "eventIntensity 하나 복사" 구조를 쓰지 않는다.
 */
export function StressEventForm({ localDate, editRecord, onSaved, onCancelEdit }: Props) {
  const editing = editRecord != null
  const [category, setCategory] = useState<StressCategoryCode | null>(
    (editRecord?.eventCode as StressCategoryCode) ?? null,
  )
  const [intensity, setIntensity] = useState<RatingValue>(editRecord ? editRecord.intensity : null)
  const [occurredAt, setOccurredAt] = useState<string>(
    editRecord?.occurredAt ? toDatetimeLocalValue(editRecord.occurredAt) : nowDatetimeLocalValue(),
  )
  const [saving, setSaving] = useState(false)

  const canSave = stressCanSave(category, intensity)

  const onSave = async (): Promise<boolean | { ok: false; message: string }> => {
    if (category === null || typeof intensity !== 'number') {
      return { ok: false, message: category === null ? '스트레스 종류를 아직 안 골랐어.' : '스트레스 강도를 아직 안 골랐어.' }
    }
    const at = fromDatetimeLocalValue(occurredAt) ?? new Date().toISOString()
    setSaving(true)
    setFormBusy(true)
    try {
      const input = buildStressEventInput({ localDate, category, intensity: intensity as number, occurredAt: at })
      if (editing && editRecord?.id != null) {
        // 이 사건 레코드만 수정 — 같은 날 다른 사건에 영향 없음.
        await eventLogRepository.update(editRecord.id, {
          eventCode: input.eventCode, eventLabel: input.eventLabel, category: input.category,
          mappedFactorGroup: input.mappedFactorGroup, intensity: input.intensity, occurredAt: at, occurredOn: localDate,
        })
      } else {
        await eventLogRepository.add(input)
      }
      if (!editing) {
        setCategory(null)
        setIntensity(null)
        setOccurredAt(nowDatetimeLocalValue())
      }
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 스트레스 사건 저장 실패', e)
      return false
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  // 전역 저장바 연결: dirty(입력 변화)와 canSave(저장 가능)는 별개다. dirty면 바 노출,
  // 저장 시 invalid면 구체적 안내를 반환(조용히 무시 금지).
  useGlobalSaver('stress-event', stressDirty(category, intensity), onSave, { label: '스트레스 기록', order: SAVE_ORDER.event })

  return (
    <div className="special-form">
      <p className="event-group__label">어떤 일이었어?</p>
      <ChipGroup label="스트레스 사건 종류">
        {STRESS_CATEGORIES.map((c) => (
          <Chip key={c.code} label={c.label} tone="coral" selected={category === c.code} onToggle={() => setCategory(category === c.code ? null : c.code)} />
        ))}
      </ChipGroup>

      <RatingScale label="강도" lowLabel="약함" highLabel="매우 강함" tone="coral" value={intensity} onChange={setIntensity} />

      <label className="dt-field">
        발생 시각
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setOccurredAt(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>

      <p className="state-hint">전/후(before·after)는 묻지 않아. 발생 시각으로 앱이 상태와의 선후를 계산해.</p>
      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave} disabled={!canSave || saving}>
          {saving ? '저장 중…' : editing ? '사건 수정' : '사건 저장'}
        </button>
        {editing && <button className="custom-cancel-btn" onClick={onCancelEdit}>취소</button>}
      </div>
    </div>
  )
}
