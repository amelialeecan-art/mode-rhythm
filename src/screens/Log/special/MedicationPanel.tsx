import { useEffect, useState } from 'react'
import { Chip, ChipGroup } from '../../../design'
import { medicationRepository } from '../../../data/repositories'
import type { MedicationDose, MedicationProfile } from '../../../data/modelsV2'
import { toISODate } from '../../../lib/date'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue } from '../episodes/time'

interface Props {
  editDose?: MedicationDose | null
  onSaved: () => void
  onCancelEdit?: () => void
}

/**
 * 약/주사. 이름은 최초 1회 MedicationProfile 등록 때만 text.
 * 그 뒤: 등록된 약 버튼 → 용량(기본값 프리필, 변경 가능) → 투여 시각으로 dose 기록.
 * ⚠️ 분석은 이름 문자열이 아니라 medicationId를 사용한다.
 *    용량 변경은 프로필 덮어쓰기가 아니라 dose timeline에 남는다.
 */
export function MedicationPanel({ editDose, onSaved, onCancelEdit }: Props) {
  const editing = editDose != null
  const [profiles, setProfiles] = useState<MedicationProfile[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(editDose?.medicationId ?? null)
  const [dose, setDose] = useState<string>(editDose?.dose == null ? '' : String(editDose.dose))
  const [takenAt, setTakenAt] = useState<string>(
    editDose ? toDatetimeLocalValue(editDose.takenAt) : nowDatetimeLocalValue(),
  )
  const [saving, setSaving] = useState(false)

  // 프로필 등록 폼
  const [registering, setRegistering] = useState(false)
  const [name, setName] = useState('')
  const [defaultDose, setDefaultDose] = useState('')
  const [unit, setUnit] = useState('')

  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    void medicationRepository.listProfiles(true).then((list) => {
      if (!cancelled) setProfiles(list)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const selectedProfile = profiles.find((p) => p.id === selectedId)

  const selectProfile = (p: MedicationProfile) => {
    setSelectedId(p.id!)
    // 기본 용량을 프리필하되 사용자가 실제 용량으로 바꿀 수 있게 한다.
    setDose(p.defaultDose == null ? '' : String(p.defaultDose))
    setTakenAt(nowDatetimeLocalValue())
  }

  const onRegister = async () => {
    const nm = name.trim()
    if (!nm) return
    setSaving(true)
    try {
      const id = await medicationRepository.createProfile({
        name: nm,
        defaultDose: defaultDose.trim() === '' ? null : Number(defaultDose),
        doseUnit: unit.trim() === '' ? null : unit.trim(),
        active: true,
      })
      setName('')
      setDefaultDose('')
      setUnit('')
      setRegistering(false)
      setReload((r) => r + 1)
      setSelectedId(id)
    } finally {
      setSaving(false)
    }
  }

  const onSaveDose = async () => {
    if (selectedId == null) return
    const at = fromDatetimeLocalValue(takenAt) ?? new Date().toISOString()
    setSaving(true)
    setFormBusy(true)
    try {
      const doseNum = dose.trim() === '' ? null : Number(dose)
      if (editing && editDose?.id != null) {
        await medicationRepository.updateDose(editDose.id, { dose: doseNum, takenAt: at, localDate: toISODate(new Date(at)) })
      } else {
        await medicationRepository.addDose({
          medicationId: selectedId,
          localDate: toISODate(new Date(at)),
          takenAt: at,
          dose: doseNum,
          source: 'manual',
          schemaVersion: 1,
        })
      }
      if (!editing) {
        setDose('')
        setTakenAt(nowDatetimeLocalValue())
      }
      onSaved()
    } catch (e) {
      console.error('[MODE] 약 기록 저장 실패', e)
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  return (
    <div className="special-form">
      {!editing && (
        <>
          <p className="event-group__label">약 선택</p>
          {profiles.length === 0 && !registering && (
            <p className="state-hint" style={{ marginTop: 0 }}>등록된 약이 없어. 아래에서 먼저 등록해.</p>
          )}
          <ChipGroup label="등록된 약">
            {profiles.map((p) => (
              <Chip key={p.id} label={p.name} tone="mint" selected={selectedId === p.id} onToggle={() => selectProfile(p)} />
            ))}
          </ChipGroup>

          {!registering ? (
            <button className="custom-add-btn" style={{ marginTop: 10 }} onClick={() => setRegistering(true)}>＋ 약 등록</button>
          ) : (
            <div className="custom-form" style={{ marginTop: 10 }}>
              <input className="custom-input" placeholder="약 이름 (예: 설트랄린)" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="dt-inline-two">
                <input className="custom-input" placeholder="기본 용량 (선택)" inputMode="decimal" value={defaultDose} onChange={(e) => setDefaultDose(e.target.value)} />
                <input className="custom-input" placeholder="단위 (예: mg)" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
              <div className="custom-form__actions">
                <button className="custom-add-btn" onClick={onRegister} disabled={!name.trim() || saving}>등록</button>
                <button className="custom-cancel-btn" onClick={() => setRegistering(false)}>취소</button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedId != null && (
        <>
          <label className="dt-field">
            용량{selectedProfile?.doseUnit ? ` (${selectedProfile.doseUnit})` : ''}
            <input type="number" min={0} step="0.1" inputMode="decimal" className="dt-input dt-input--num" placeholder="용량" value={dose} onChange={(e) => setDose(e.target.value)} />
          </label>
          <label className="dt-field">
            투여 시각
            <span className="dt-with-now">
              <input type="datetime-local" className="dt-input" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
              <button type="button" className="dt-now" onClick={() => setTakenAt(nowDatetimeLocalValue())}>지금</button>
            </span>
          </label>
          <p className="state-hint">용량을 바꿔도 프로필 기본값은 그대로야. 이 투여는 timeline에 그대로 남아.</p>
          <div className="meal-form-actions">
            <button className="btn-primary" onClick={onSaveDose} disabled={saving}>
              {saving ? '저장 중…' : editing ? '투여 기록 수정' : '투여 기록 저장'}
            </button>
            {editing && <button className="custom-cancel-btn" onClick={onCancelEdit}>취소</button>}
          </div>
        </>
      )}
    </div>
  )
}
