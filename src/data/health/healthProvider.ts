/* =====================================================================
   MODE · 자동수집 provider 경계 (future native/HealthKit 연동용)
   ⚠️ 현재 앱은 웹 PWA다. 이 파일은 "인터페이스 경계"만 정의한다.
   - 브라우저에서 Apple HealthKit/Screen Time을 직접 읽지 않는다.
   - 실제 HealthKit 구현은 이 저장소에 넣지 않는다.
   - 장래 iOS native wrapper/companion이 이 인터페이스를 구현해 샘플을 전달한다.
   - provider가 없어도 PWA는 정상 동작한다(등록된 provider 없음 = manual only).
   ===================================================================== */
import type { ISODate } from '../models'
import type { DataSource } from '../modelsV2'

/** native가 전달할 수 있는 원자 샘플들(모두 optional — 있는 것만 보냄). */
export interface HealthSampleBundle {
  /** 수면: 절대 ISO datetime. */
  sleep?: { localDate: ISODate; wentToBedAt?: string; sleepOnsetAt?: string; wakeAt?: string; awakenings?: number | null }[]
  /** 걸음 수(하루 합계). */
  steps?: { localDate: ISODate; steps: number }[]
  /** 운동 세션. */
  workouts?: { localDate: ISODate; startedAt: string; durationMinutes: number; activeCalories?: number | null; kind?: string }[]
  /** 안정시 심박(선택). */
  restingHeartRate?: { localDate: ISODate; bpm: number }[]
  /** HRV(선택). */
  hrv?: { localDate: ISODate; ms: number }[]
  /** 체중(선택). */
  weight?: { measuredAt: string; localDate: ISODate; weightKg: number }[]
  /** 월경 흐름/시작(선택). */
  menstrual?: { localDate: ISODate; periodStart?: boolean; flow?: 'none' | 'light' | 'normal' | 'heavy' }[]
  /** 화면 사용(선택 — future native only, 웹에서 가짜로 만들지 않는다). */
  screen?: { localDate: ISODate; totalMinutes?: number; socialMinutes?: number; shortFormMinutes?: number; preBed2hMinutes?: number; lastScreenAt?: string }[]
}

/** provider 능력 광고 — UI가 무엇을 받을 수 있는지 안다. */
export interface HealthProviderCapabilities {
  sleep: boolean
  steps: boolean
  workouts: boolean
  restingHeartRate: boolean
  hrv: boolean
  weight: boolean
  menstrual: boolean
  screen: boolean
}

/**
 * 자동수집 provider 인터페이스. native wrapper가 구현한다.
 * 반환 샘플은 항상 source가 명확해야 하며(기본 'healthkit'), 원자료를 덮어쓰지 않는다.
 */
export interface HealthDataProvider {
  readonly id: string
  readonly source: DataSource // 보통 'healthkit'
  capabilities(): HealthProviderCapabilities
  /** [start, end] 범위의 샘플을 가져온다. 미지원 항목은 생략. */
  fetch(start: ISODate, end: ISODate): Promise<HealthSampleBundle>
}

/* ---------------------------------------------------------------------
   registry — provider가 없어도 앱은 정상 동작
   --------------------------------------------------------------------- */
let registered: HealthDataProvider | null = null

/** native wrapper가 부팅 시 provider를 등록한다. */
export function registerHealthProvider(provider: HealthDataProvider): void {
  registered = provider
}
export function clearHealthProvider(): void {
  registered = null
}
/** 현재 등록된 provider(없으면 null = manual only). */
export function getHealthProvider(): HealthDataProvider | null {
  return registered
}
export function hasHealthProvider(): boolean {
  return registered !== null
}
