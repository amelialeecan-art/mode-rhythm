/* =====================================================================
   MODE · 4단계 Exposure/Context 저장 통합 테스트
   스트레스 사건 / 운동 / 약 / 건강예외 / 체중 + 통합 타임라인.
   ===================================================================== */
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDatabase } from '../../../data/reset'
import {
  activityEpisodeRepository,
  eventLogRepository,
  healthExceptionRepository,
  medicationRepository,
  weightMeasurementRepository,
} from '../../../data/repositories'
import { buildStressEventInput, isV2StressEvent } from '../../../data/catalog/stressEvents'
import { legacyFactorGroupToCanonicalStress } from '../../../data/catalog/factorGroupMapping'
import { buildDayTimeline, deleteTimelineEntry, sortTimelineEntries, type TimelineEntry } from '../../../data/services/dayTimelineService'
import type { EventLogInput } from '../../../data/models'

const D = '2026-08-21'
beforeEach(async () => {
  await resetDatabase()
})

function stress(category: Parameters<typeof buildStressEventInput>[0]['category'], intensity: number, hhmm: string) {
  return eventLogRepository.add(buildStressEventInput({ localDate: D, category, intensity, occurredAt: `${D}T${hhmm}:00.000Z` }))
}

describe('스트레스 사건 — 개별 레코드/독립 강도', () => {
  it('같은 날 여러 사건이 각자 다른 강도로 독립 저장된다', async () => {
    await stress('interpersonal_conflict', 8, '16:40')
    await stress('work_study_pressure', 4, '10:00')
    const events = await eventLogRepository.listByDate(D)
    expect(events).toHaveLength(2)
    const byCode = Object.fromEntries(events.map((e) => [e.eventCode, e]))
    expect(byCode.interpersonal_conflict.intensity).toBe(8)
    expect(byCode.work_study_pressure.intensity).toBe(4)
    // V2 canonical 사건으로 식별되고 occurredAt/ mappedFactorGroup을 가진다
    expect(isV2StressEvent(byCode.interpersonal_conflict)).toBe(true)
    expect(byCode.interpersonal_conflict.mappedFactorGroup).toBe('interpersonal_conflict')
    expect(byCode.interpersonal_conflict.occurredAt).toBe('2026-08-21T16:40:00.000Z')
    // relationToShift는 묻지 않는다
    expect(byCode.interpersonal_conflict.relationToShift).toBeUndefined()
  })

  it('한 사건 수정이 다른 사건에 영향을 주지 않는다', async () => {
    const id1 = await stress('interpersonal_conflict', 8, '16:40')
    const id2 = await stress('work_study_pressure', 4, '10:00')
    await eventLogRepository.update(id1, { intensity: 3 })
    expect((await eventLogRepository.getById(id1))!.intensity).toBe(3)
    expect((await eventLogRepository.getById(id2))!.intensity).toBe(4) // 그대로
  })

  it('한 사건 삭제 시 다른 사건은 유지된다', async () => {
    const id1 = await stress('interpersonal_conflict', 8, '16:40')
    await stress('work_study_pressure', 4, '10:00')
    await eventLogRepository.delete(id1)
    const events = await eventLogRepository.listByDate(D)
    expect(events).toHaveLength(1)
    expect(events[0].eventCode).toBe('work_study_pressure')
  })
})

describe('legacy factorGroup 매핑 (읽기 전용)', () => {
  it('레거시 factorGroup을 canonical 스트레스 group으로 매핑한다', () => {
    expect(legacyFactorGroupToCanonicalStress('deadline_pressure')).toBe('work_study_pressure')
    expect(legacyFactorGroupToCanonicalStress('interpersonal_stress')).toBe('interpersonal_conflict')
    expect(legacyFactorGroupToCanonicalStress('body_image')).toBe('appearance_body_concern')
    // 스트레스가 아닌 그룹은 매핑하지 않는다
    expect(legacyFactorGroupToCanonicalStress('caffeine')).toBeNull()
    expect(legacyFactorGroupToCanonicalStress('sleep_deficit')).toBeNull()
  })

  it('legacy eventLog(다른 schemaVersion)는 V2 스트레스로 오인되지 않는다', async () => {
    const legacy: EventLogInput = {
      date: D, eventCode: 'conflict', eventLabel: '사람과 갈등', category: 'relationship',
      timing: 'today', intensity: 6, isCustom: false, mappedFactorGroup: 'interpersonal_stress',
    }
    await eventLogRepository.add(legacy)
    const [e] = await eventLogRepository.listByDate(D)
    expect(isV2StressEvent(e)).toBe(false) // schemaVersion 없음 + occurredAt 없음
  })
})

describe('운동 (ActivityEpisode)', () => {
  it('자동 데이터 없이 type+duration+RPE만으로 저장되고 수정된다', async () => {
    const id = await activityEpisodeRepository.add({
      localDate: D, startedAt: `${D}T18:30:00.000Z`, durationMinutes: 45, rpe: 7, activityType: 'strength',
      source: 'manual', schemaVersion: 1,
    })
    let a = await activityEpisodeRepository.getById(id)
    expect(a!.durationMinutes).toBe(45)
    expect(a!.rpe).toBe(7)
    expect(a!.steps).toBeUndefined() // 자동 데이터 없음 → 미입력
    await activityEpisodeRepository.update(id, { durationMinutes: 60, rpe: 5 })
    a = await activityEpisodeRepository.getById(id)
    expect(a!.durationMinutes).toBe(60)
    expect(a!.rpe).toBe(5)
    expect(a!.activityType).toBe('strength') // merge 보존
  })
})

describe('약 (Medication) — stable ID + dose timeline', () => {
  it('이름이 아니라 medicationId로 dose를 연결하고, 용량 변경이 timeline에 남는다', async () => {
    const medId = await medicationRepository.createProfile({ name: '설트랄린', defaultDose: 50, doseUnit: 'mg', active: true })
    await medicationRepository.addDose({ medicationId: medId, localDate: D, takenAt: `${D}T09:00:00.000Z`, dose: 50, source: 'manual', schemaVersion: 1 })
    await medicationRepository.addDose({ medicationId: medId, localDate: '2026-08-25', takenAt: '2026-08-25T09:00:00.000Z', dose: 100, source: 'manual', schemaVersion: 1 })
    const timeline = await medicationRepository.listDosesByMedication(medId)
    expect(timeline.map((d) => d.dose)).toEqual([50, 100]) // 용량 변경이 프로필 덮어쓰기가 아니라 타임라인에 남음
    // 프로필 기본값은 그대로
    expect((await medicationRepository.getProfile(medId))!.defaultDose).toBe(50)
    // 이름 변경해도 id로 연결 유지
    await medicationRepository.updateProfile(medId, { name: 'Zoloft' })
    expect((await medicationRepository.listDosesByMedication(medId))).toHaveLength(2)
  })
})

describe('건강 예외 (HealthException)', () => {
  it('category + timestamp로 저장하고 강도는 선택이다', async () => {
    await healthExceptionRepository.add({ localDate: D, occurredAt: `${D}T08:00:00.000Z`, category: 'fever', intensity: 7, source: 'manual', schemaVersion: 1 })
    await healthExceptionRepository.add({ localDate: D, occurredAt: `${D}T20:00:00.000Z`, category: 'gi_illness', source: 'manual', schemaVersion: 1 })
    const list = await healthExceptionRepository.listByDate(D)
    expect(list).toHaveLength(2)
    const gi = list.find((h) => h.category === 'gi_illness')!
    expect(gi.intensity).toBeUndefined() // 강도 미입력 → 부재(0 아님)
  })
})

describe('체중 (Weight) — userSawWeight 의미 구분', () => {
  it('weightKg와 userSawWeight(true/false/unknown/null)를 분리한다', async () => {
    const idFalse = await weightMeasurementRepository.add({ localDate: D, measuredAt: `${D}T07:00:00.000Z`, weightKg: 56.3, userSawWeight: false, source: 'manual', schemaVersion: 1 })
    const idUnknown = await weightMeasurementRepository.add({ localDate: D, measuredAt: `${D}T07:05:00.000Z`, weightKg: 56.4, userSawWeight: 'unknown', source: 'manual', schemaVersion: 1 })
    const idNull = await weightMeasurementRepository.add({ localDate: D, measuredAt: `${D}T07:10:00.000Z`, weightKg: 56.5, userSawWeight: null, source: 'manual', schemaVersion: 1 })
    expect((await weightMeasurementRepository.getById(idFalse))!.userSawWeight).toBe(false)
    expect((await weightMeasurementRepository.getById(idUnknown))!.userSawWeight).toBe('unknown')
    expect((await weightMeasurementRepository.getById(idNull))!.userSawWeight).toBeNull()
    // 값 자체는 심리적 노출과 별개로 보존
    expect((await weightMeasurementRepository.getById(idFalse))!.weightKg).toBe(56.3)
  })
})

describe('통합 오늘 타임라인', () => {
  it('여러 종류를 timestamp 순으로 정렬한다', () => {
    const entries: TimelineEntry[] = [
      { kind: 'stress', sourceId: 1, at: '2026-08-21T16:40:00.000Z', title: '갈등', tone: 'coral' },
      { kind: 'state', sourceId: 2, at: '2026-08-21T07:32:00.000Z', title: '아침 상태', tone: 'sky' },
      { kind: 'meal', sourceId: 3, at: '2026-08-21T12:43:00.000Z', title: '점심', tone: 'coral' },
    ]
    const sorted = sortTimelineEntries(entries)
    expect(sorted.map((e) => e.sourceId)).toEqual([2, 3, 1])
  })

  it('실제 저장 데이터를 모아 시간 순 타임라인을 만들고, 한 항목 삭제가 나머지를 유지한다', async () => {
    await stress('interpersonal_conflict', 8, '16:40')
    await activityEpisodeRepository.add({ localDate: D, startedAt: `${D}T18:30:00.000Z`, durationMinutes: 45, rpe: 7, activityType: 'strength', source: 'manual', schemaVersion: 1 })
    const medId = await medicationRepository.createProfile({ name: 'A', active: true })
    await medicationRepository.addDose({ medicationId: medId, localDate: D, takenAt: `${D}T08:05:00.000Z`, dose: 1, source: 'manual', schemaVersion: 1 })

    let timeline = await buildDayTimeline(D)
    expect(timeline).toHaveLength(3)
    // 시간 순: 08:05 약 → 16:40 스트레스 → 18:30 운동
    expect(timeline.map((e) => e.kind)).toEqual(['medication', 'stress', 'activity'])

    // 스트레스 한 항목만 삭제
    const stressEntry = timeline.find((e) => e.kind === 'stress')!
    await deleteTimelineEntry(stressEntry)
    timeline = await buildDayTimeline(D)
    expect(timeline.map((e) => e.kind)).toEqual(['medication', 'activity']) // 나머지 유지
  })
})

describe('V1 eventLogs 호환', () => {
  it('V2 스트레스 사건 추가가 legacy eventLog를 건드리지 않는다', async () => {
    const legacy: EventLogInput = {
      date: D, eventCode: 'work_heavy', eventLabel: '일이 많았음', category: 'work',
      timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'workload',
    }
    await eventLogRepository.add(legacy)
    await stress('work_study_pressure', 7, '11:00')
    const all = await eventLogRepository.listByDate(D)
    expect(all).toHaveLength(2)
    // legacy 원본 eventCode/factorGroup 보존
    const leg = all.find((e) => e.eventCode === 'work_heavy')!
    expect(leg.mappedFactorGroup).toBe('workload')
    expect(leg.schemaVersion).toBeUndefined()
    // 통합 타임라인에는 V2 스트레스만 잡힌다(legacy는 occurredAt 없음)
    const timeline = await buildDayTimeline(D)
    expect(timeline.filter((e) => e.kind === 'stress')).toHaveLength(1)
  })
})
