import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../../design'
import {
  activityEpisodeRepository,
  eventLogRepository,
  healthExceptionRepository,
  medicationRepository,
  weightMeasurementRepository,
} from '../../../data/repositories'
import type { EventLog } from '../../../data/models'
import type { ActivityEpisode, HealthException, MedicationDose, WeightMeasurement } from '../../../data/modelsV2'
import { StressEventForm } from './StressEventForm'
import { ActivityForm } from './ActivityForm'
import { MedicationPanel } from './MedicationPanel'
import { HealthExceptionForm } from './HealthExceptionForm'
import { WeightForm } from './WeightForm'
import './special.css'

export type SpecialTab = 'stress' | 'activity' | 'medication' | 'health' | 'weight'

export interface EditTarget {
  kind: SpecialTab
  id: number
}

interface Props {
  localDate: string
  reloadToken: number
  onSaved: () => void
  /** 타임라인에서 "수정"을 누르면 여기로 편집 대상이 들어온다. */
  editTarget: EditTarget | null
  onEditHandled: () => void
}

const TABS: { key: SpecialTab; label: string }[] = [
  { key: 'stress', label: '스트레스' },
  { key: 'activity', label: '운동' },
  { key: 'medication', label: '약' },
  { key: 'health', label: '예외' },
  { key: 'weight', label: '체중' },
]

export function SpecialEventSection({ localDate, reloadToken, onSaved, editTarget, onEditHandled }: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<SpecialTab>('stress')

  // 편집 대상 레코드(타임라인 수정 시 로드)
  const [editStress, setEditStress] = useState<EventLog | null>(null)
  const [editActivity, setEditActivity] = useState<ActivityEpisode | null>(null)
  const [editDose, setEditDose] = useState<MedicationDose | null>(null)
  const [editHealth, setEditHealth] = useState<HealthException | null>(null)
  const [editWeight, setEditWeight] = useState<WeightMeasurement | null>(null)

  useEffect(() => {
    if (!editTarget) return
    setOpen(true)
    setTab(editTarget.kind)
    const { kind, id } = editTarget
    void (async () => {
      if (kind === 'stress') setEditStress((await eventLogRepository.getById(id)) ?? null)
      else if (kind === 'activity') setEditActivity((await activityEpisodeRepository.getById(id)) ?? null)
      else if (kind === 'medication') setEditDose((await medicationRepository.getDose(id)) ?? null)
      else if (kind === 'health') setEditHealth((await healthExceptionRepository.getById(id)) ?? null)
      else if (kind === 'weight') setEditWeight((await weightMeasurementRepository.getById(id)) ?? null)
    })()
  }, [editTarget])

  const clearEdits = () => {
    setEditStress(null)
    setEditActivity(null)
    setEditDose(null)
    setEditHealth(null)
    setEditWeight(null)
    onEditHandled()
  }

  const handleSaved = () => {
    clearEdits()
    onSaved()
  }

  const switchTab = (t: SpecialTab) => {
    setTab(t)
    clearEdits()
  }

  if (!open) {
    return (
      <button className="special-open-btn" onClick={() => setOpen(true)}>
        ＋ 특별한 일 기록 (스트레스 · 운동 · 약 · 예외 · 체중)
      </button>
    )
  }

  return (
    <GlassCard>
      <div className="special-head">
        <SectionHeader title="특별한 일 기록" subtitle="있었던 것만 골라 남겨요 (매일 훑지 않아)" />
        <button className="special-close" onClick={() => { clearEdits(); setOpen(false) }}>접기</button>
      </div>

      <ChipGroup label="기록 종류">
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} tone="lav" selected={tab === t.key} onToggle={() => switchTab(t.key)} />
        ))}
      </ChipGroup>

      <div className="special-body" key={`${tab}-${reloadToken}`}>
        {tab === 'stress' && <StressEventForm localDate={localDate} editRecord={editStress} onSaved={handleSaved} onCancelEdit={clearEdits} />}
        {tab === 'activity' && <ActivityForm editRecord={editActivity} onSaved={handleSaved} onCancelEdit={clearEdits} />}
        {tab === 'medication' && <MedicationPanel editDose={editDose} onSaved={handleSaved} onCancelEdit={clearEdits} />}
        {tab === 'health' && <HealthExceptionForm editRecord={editHealth} onSaved={handleSaved} onCancelEdit={clearEdits} />}
        {tab === 'weight' && <WeightForm editRecord={editWeight} onSaved={handleSaved} onCancelEdit={clearEdits} />}
      </div>
    </GlassCard>
  )
}
