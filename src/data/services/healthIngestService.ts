/* =====================================================================
   MODE · 자동수집 ingest 어댑터 (future native provider → repositories)
   ⚠️ 현재 PWA는 provider가 없어 호출되지 않는다(inert). native wrapper가
      HealthSampleBundle을 넘기면 source='healthkit'로 저장한다.
   ⚠️ 원자료를 overwrite하지 않는다:
      - episode형(sleep/workout/weight)은 add로 별도 행을 남긴다(manual과 공존).
      - 하루 1행형(screen)은 기존 값이 있으면 건드리지 않는다(manual 보존).
   canonical 선택은 sourceResolver가 표시/분석 시점에 규칙으로 처리한다.
   ===================================================================== */
import type { HealthSampleBundle } from '../health/healthProvider'
import type { ActivityType } from '../modelsV2'
import {
  activityEpisodeRepository,
  screenMetricRepository,
  sleepEpisodeRepository,
  weightMeasurementRepository,
} from '../repositories'

const HK = { source: 'healthkit' as const, schemaVersion: 1 }

function mapWorkout(kind?: string): ActivityType {
  switch (kind) {
    case 'strength':
    case 'cardio':
    case 'walk':
      return kind
    default:
      return 'other'
  }
}

export interface IngestCounts {
  sleep: number
  workouts: number
  weight: number
  screen: number
}

/**
 * healthkit 샘플을 저장소로 ingest한다. 이미 있는 manual 기록을 덮어쓰지 않는다.
 * PWA 기본 동작에는 영향이 없다(provider 없으면 호출되지 않음).
 */
export async function ingestHealthBundle(bundle: HealthSampleBundle): Promise<IngestCounts> {
  const counts: IngestCounts = { sleep: 0, workouts: 0, weight: 0, screen: 0 }

  for (const s of bundle.sleep ?? []) {
    // add(upsert 아님) → 같은 날 manual episode와 공존, resolver가 canonical 선택.
    await sleepEpisodeRepository.add({
      localDate: s.localDate,
      wentToBedAt: s.wentToBedAt,
      sleepOnsetAt: s.sleepOnsetAt,
      wakeAt: s.wakeAt,
      awakenings: s.awakenings ?? null,
      satisfaction: null,
      ...HK,
    })
    counts.sleep++
  }

  for (const w of bundle.workouts ?? []) {
    await activityEpisodeRepository.add({
      localDate: w.localDate,
      startedAt: w.startedAt,
      durationMinutes: w.durationMinutes,
      rpe: null,
      activityType: mapWorkout(w.kind),
      activeCalories: w.activeCalories ?? null,
      ...HK,
    })
    counts.workouts++
  }

  for (const w of bundle.weight ?? []) {
    await weightMeasurementRepository.add({
      localDate: w.localDate,
      measuredAt: w.measuredAt,
      weightKg: w.weightKg,
      userSawWeight: null, // 자동 측정은 "숫자를 봤다"와 별개 → 미상
      ...HK,
    })
    counts.weight++
  }

  for (const sc of bundle.screen ?? []) {
    // 하루 1행형: 기존 값(수동 포함) 보존 — 없을 때만 추가.
    const existing = await screenMetricRepository.getByDate(sc.localDate)
    if (existing) continue
    await screenMetricRepository.upsertByDate({
      localDate: sc.localDate,
      totalMinutes: sc.totalMinutes ?? null,
      socialMinutes: sc.socialMinutes ?? null,
      shortFormMinutes: sc.shortFormMinutes ?? null,
      preBed2hMinutes: sc.preBed2hMinutes ?? null,
      lastScreenAt: sc.lastScreenAt,
      ...HK,
    })
    counts.screen++
  }

  return counts
}
