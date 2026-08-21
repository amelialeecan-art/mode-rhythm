/* =====================================================================
   MODE · 오늘 타임라인 (모든 기록을 timestamp 순으로 한데 모음)
   여러 저장소(state/sleep/meal/medication/stress/activity/health/weight)를
   읽어 하나의 시간순 목록으로 만든다.

   ⚠️ 각 항목은 개별 레코드다. 삭제는 그 레코드만 지운다 —
      "오늘 기록 저장" 한 번으로 같은 날짜의 다른 episode를 통째 replace하지 않는다.
   ===================================================================== */
import type { ISODate } from '../models'
import { sleepDuration, formatSleepDuration } from '../../engine/sleepDerived'
import {
  activityEpisodeRepository,
  eventLogRepository,
  healthExceptionRepository,
  mealEpisodeRepository,
  medicationRepository,
  sleepEpisodeRepository,
  stateMeasurementRepository,
  weightMeasurementRepository,
} from '../repositories'
import { isV2StressEvent } from '../catalog/stressEvents'
import { ACTIVITY_TYPE_LABEL } from '../catalog/activityTypes'
import { HEALTH_EXCEPTION_LABEL } from '../catalog/healthExceptions'
import type { CheckInType, TriBoolean } from '../modelsV2'

export type TimelineKind =
  | 'state'
  | 'sleep'
  | 'meal'
  | 'medication'
  | 'stress'
  | 'activity'
  | 'health'
  | 'weight'

/** 표시 색 힌트. design ChipTone과 값이 일치하되 데이터 계층이 design에 의존하지 않도록 로컬 정의. */
export type TimelineTone = 'lav' | 'coral' | 'mint' | 'sky' | 'rose' | 'neutral'

export interface TimelineEntry {
  kind: TimelineKind
  /** 원본 레코드 id (삭제/수정 시 이 레코드만 대상). */
  sourceId: number
  /** 정렬 기준 ISO datetime. */
  at: string
  title: string
  detail?: string
  tone: TimelineTone
}

const CHECKIN_TITLE: Record<CheckInType, string> = {
  morning: '아침 상태',
  evening: '저녁 상태',
  adhoc: '수시 상태',
}

function ratingText(v: number | 'unknown' | null | undefined): string {
  if (v === undefined || v === null) return '—'
  return v === 'unknown' ? '모름' : String(v)
}
function sawText(v: TriBoolean | undefined): string {
  if (v === undefined || v === null) return '봤는지 미기록'
  if (v === 'unknown') return '봤는지 모름'
  return v ? '숫자 봄' : '숫자 안 봄'
}

/** ISO datetime 오름차순 정렬(순수). 파싱 불가/동시각은 안정 정렬. */
export function sortTimelineEntries(entries: TimelineEntry[]): TimelineEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ta = Date.parse(a.e.at)
      const tb = Date.parse(b.e.at)
      if (Number.isNaN(ta) && Number.isNaN(tb)) return a.i - b.i
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return ta - tb || a.i - b.i
    })
    .map((x) => x.e)
}

/** 해당 날짜의 모든 기록을 timestamp 순 타임라인으로. */
export async function buildDayTimeline(localDate: ISODate): Promise<TimelineEntry[]> {
  const [states, sleeps, meals, doses, events, activities, exceptions, weights, profiles] = await Promise.all([
    stateMeasurementRepository.listByDate(localDate),
    sleepEpisodeRepository.listByDate(localDate),
    mealEpisodeRepository.listByDate(localDate),
    medicationRepository.listDosesByDate(localDate),
    eventLogRepository.listByDate(localDate),
    activityEpisodeRepository.listByDate(localDate),
    healthExceptionRepository.listByDate(localDate),
    weightMeasurementRepository.listByDate(localDate),
    medicationRepository.listProfiles(),
  ])
  const profileName = new Map(profiles.map((p) => [p.id!, p.name]))

  const entries: TimelineEntry[] = []

  for (const s of states) {
    entries.push({
      kind: 'state',
      sourceId: s.id!,
      at: s.recordedAt,
      title: CHECKIN_TITLE[s.checkInType],
      detail: `${Object.keys(s.metrics).length}개 응답`,
      tone: s.checkInType === 'morning' ? 'sky' : 'lav',
    })
  }

  for (const s of sleeps) {
    const at = s.wakeAt ?? s.sleepOnsetAt ?? s.wentToBedAt
    if (!at) continue
    const dur = formatSleepDuration(sleepDuration(s))
    entries.push({ kind: 'sleep', sourceId: s.id!, at, title: '수면', detail: dur ? `수면시간 ${dur}` : undefined, tone: 'sky' })
  }

  for (const m of meals) {
    entries.push({
      kind: 'meal',
      sourceId: m.id!,
      at: m.startedAt,
      title: '식사/간식',
      detail: `배고픔 ${ratingText(m.prePhysicalHunger)} · craving ${ratingText(m.preCraving)}`,
      tone: 'coral',
    })
  }

  for (const d of doses) {
    const name = profileName.get(d.medicationId) ?? '약'
    const dose = d.dose == null ? '' : ` ${d.dose}`
    entries.push({ kind: 'medication', sourceId: d.id!, at: d.takenAt, title: `약: ${name}`, detail: dose.trim() || undefined, tone: 'mint' })
  }

  for (const e of events) {
    if (!isV2StressEvent(e) || !e.occurredAt) continue
    entries.push({ kind: 'stress', sourceId: e.id!, at: e.occurredAt, title: e.eventLabel, detail: `강도 ${e.intensity}`, tone: 'coral' })
  }

  for (const a of activities) {
    const rpe = a.rpe === undefined || a.rpe === null ? '' : ` · RPE ${a.rpe === 'unknown' ? '모름' : a.rpe}`
    entries.push({
      kind: 'activity',
      sourceId: a.id!,
      at: a.startedAt,
      title: `${ACTIVITY_TYPE_LABEL[a.activityType]} 운동`,
      detail: `${a.durationMinutes}분${rpe}`,
      tone: 'mint',
    })
  }

  for (const h of exceptions) {
    const at = h.occurredAt ?? h.createdAt
    const inten = h.intensity === undefined || h.intensity === null ? '' : ` · 강도 ${h.intensity === 'unknown' ? '모름' : h.intensity}`
    entries.push({ kind: 'health', sourceId: h.id!, at, title: HEALTH_EXCEPTION_LABEL[h.category], detail: `예외${inten}`, tone: 'neutral' })
  }

  for (const w of weights) {
    entries.push({ kind: 'weight', sourceId: w.id!, at: w.measuredAt, title: `체중 ${w.weightKg}kg`, detail: sawText(w.userSawWeight), tone: 'neutral' })
  }

  return sortTimelineEntries(entries)
}

/** 타임라인 항목 하나만 삭제(해당 레코드만). */
export async function deleteTimelineEntry(entry: Pick<TimelineEntry, 'kind' | 'sourceId'>): Promise<void> {
  switch (entry.kind) {
    case 'state':
      return stateMeasurementRepository.deleteById(entry.sourceId)
    case 'sleep':
      return sleepEpisodeRepository.deleteById(entry.sourceId)
    case 'meal':
      return mealEpisodeRepository.deleteById(entry.sourceId)
    case 'medication':
      return medicationRepository.deleteDose(entry.sourceId)
    case 'stress':
      return eventLogRepository.delete(entry.sourceId)
    case 'activity':
      return activityEpisodeRepository.deleteById(entry.sourceId)
    case 'health':
      return healthExceptionRepository.deleteById(entry.sourceId)
    case 'weight':
      return weightMeasurementRepository.deleteById(entry.sourceId)
  }
}
