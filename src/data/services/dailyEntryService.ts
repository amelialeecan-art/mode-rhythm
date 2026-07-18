/* =====================================================================
   MODE · 하루 기록 저장 서비스 (Phase 3)
   UI가 repository를 여러 개 직접 호출하지 않도록 한 곳에 묶는다.
   "사실 기록"만 저장한다 — 점수 계산/분석/예보는 하지 않는다(후속 단계).

   저장 모델: "해당 날짜의 빠른 기록 1세트".
   - dailyLogs: 하루 1행 upsert (date unique)
   - eventLogs / recoveryLogs / cycleLogs: 같은 날짜를 replace(삭제 후 재삽입)
     → eventLogs/recoveryLogs는 원래 하루 다건 가능하지만, quick log 저장에서는
       같은 날짜를 통째로 교체해 중복을 방지한다.
   - cycleLogs: 이번 단계는 "하루 1개 cycle log" 전제. 입력이 있을 때만 저장.
     상세 다건이 필요해지면 repository는 그대로 두고 이 서비스만 확장한다.
   ===================================================================== */
import { db } from '../db'
import { dailyLogRepository } from '../repositories/dailyLogRepository'
import { eventLogRepository } from '../repositories/eventLogRepository'
import { cycleLogRepository } from '../repositories/cycleLogRepository'
import { recoveryLogRepository } from '../repositories/recoveryLogRepository'
import { EVENT_CATALOG } from '../catalog/events'
import { LAST_NIGHT_SLEEP_CODES } from '../catalog/lastNightSleep'
import {
  RECOVERY_ACTIONS,
  RECOVERY_CATEGORY_TO_MODEL,
  NON_SAVED_RECOVERY_CODES,
} from '../catalog/recoveryActions'
import { intensityValue } from '../catalog/intensity'
import { buildStateNumericFields, inferStateCodes } from '../catalog/statePresets'
import { recalculateDailyScore } from './dailyScoreService'
import type {
  AppetiteRatings,
  CycleLogInput,
  DailyLogInput,
  EventLogCategory,
  EventLogInput,
  EventTiming,
  FlowLevel,
  ISODate,
  LastNightSleep,
  RecoveryEffectValue,
  RecoveryLogInput,
} from '../models'

export type { AppetiteRatings }

/** 강도 칩 코드 (전체 강도는 '없음'을 쓰지 않는다). */
export type IntensityCode = 'little' | 'some' | 'much' | 'veryMuch'

/** 폼 내 사건 1건 (커스텀 포함). */
export interface EventDraft {
  eventCode: string
  eventLabel: string
  category: EventLogCategory
  timing: EventTiming
  intensity: number
  isCustom: boolean
  customLabel?: string
  mappedFactorGroup: string
}

/** 폼 내 생리 기록 (사실만). */
export interface CycleDraft {
  periodStart: boolean
  periodEnd: boolean
  flowLevel?: FlowLevel
  periodPain?: number
  symptoms: string[]
}

/** Log 화면 폼의 직렬화 가능한 상태. 저장/불러오기의 단위. */
export interface DailyEntryDraft {
  date: ISODate
  /** 오늘 상태 칩 코드들 (다중 선택). */
  stateCodes: string[]
  /** 상태 preset에 적용할 전체 강도. */
  overallIntensity: IntensityCode
  /** 카탈로그 사건에 공통 적용할 시점/강도. */
  eventTiming: EventTiming
  eventIntensity: IntensityCode
  /** 선택된 카탈로그 사건 코드들. */
  catalogEventCodes: string[]
  /** 커스텀 사건들. */
  customEvents: EventDraft[]
  /** 식욕 상태 직접 입력값 (있으면 state preset보다 우선). 항목별 0/3/5/7/9. */
  appetiteRatings: AppetiteRatings
  cycle: CycleDraft
  /** "도움 된 것" 회복 행동. */
  recoveryCodes: string[]
  /** "오히려 안 맞았던 것" 회복 행동 (effect는 worse로 저장). */
  recoveryNegativeCodes: string[]
  /** 회복 효과 (빈 문자열 = 미선택) — 도움 된 것 그룹에 적용. */
  recoveryEffect: RecoveryEffectValue | ''
  /** 지난밤 수면 (깨어난 날짜에 귀속). timing 없음. */
  lastNightSleep: LastNightSleepDraft
  memo: string
}

/** 폼 내 지난밤 수면. */
export interface LastNightSleepDraft {
  hours?: number
  quality?: number
  issues: string[]
}

/** 지난밤 수면 입력이 하나라도 있으면 저장, 없으면 undefined(빈 저장 깔끔하게). */
function normalizeLastNight(ln: LastNightSleepDraft): LastNightSleep | undefined {
  const issues = (ln.issues ?? []).filter(Boolean)
  if (ln.hours === undefined && ln.quality === undefined && issues.length === 0) return undefined
  return {
    ...(ln.hours !== undefined ? { hours: ln.hours } : {}),
    ...(ln.quality !== undefined ? { quality: ln.quality } : {}),
    ...(issues.length > 0 ? { issues } : {}),
  }
}

/** appetiteRatings에 입력값이 하나라도 있는지. */
function hasAppetiteRatings(ar: AppetiteRatings): boolean {
  return (
    ar.appetite != null ||
    ar.sweetCraving != null ||
    ar.saltyCraving != null ||
    ar.bingeUrge != null ||
    ar.greasyCraving != null
  )
}

export function emptyCycleDraft(): CycleDraft {
  return { periodStart: false, periodEnd: false, symptoms: [] }
}

export function emptyDraft(date: ISODate): DailyEntryDraft {
  return {
    date,
    stateCodes: [],
    overallIntensity: 'some',
    eventTiming: 'today',
    eventIntensity: 'some',
    catalogEventCodes: [],
    customEvents: [],
    appetiteRatings: {},
    cycle: emptyCycleDraft(),
    recoveryCodes: [],
    recoveryNegativeCodes: [],
    recoveryEffect: '',
    lastNightSleep: { issues: [] },
    memo: '',
  }
}

/* ---------------------------------------------------------------------
   draft → 저장 입력 변환
   --------------------------------------------------------------------- */

function buildDailyLogInput(draft: DailyEntryDraft): DailyLogInput {
  const n = buildStateNumericFields(draft.stateCodes, draft.overallIntensity)
  const memo = draft.memo.trim()
  const ar = draft.appetiteRatings ?? {}
  // 식욕 상태 직접 입력값이 있으면 preset보다 우선 (spec 우선순위)
  const clamp10 = (x: number) => Math.max(0, Math.min(10, Math.round(x)))
  const pick = (rating: number | undefined, preset: number) => (rating != null ? clamp10(rating) : preset)
  return {
    date: draft.date,
    moodLow: n.moodLow,
    anxiety: n.anxiety,
    irritability: n.irritability,
    sadness: n.sadness,
    heaviness: n.heaviness,
    calm: n.calm,
    energy: n.energy,
    focus: n.focus,
    selfCriticism: n.selfCriticism,
    impulsivity: n.impulsivity,
    appetite: pick(ar.appetite, n.appetite),
    sweetCraving: pick(ar.sweetCraving, n.sweetCraving),
    saltyCraving: pick(ar.saltyCraving, n.saltyCraving),
    bingeUrge: pick(ar.bingeUrge, n.bingeUrge),
    bodyDiscomfort: n.bodyDiscomfort,
    pain: n.pain,
    bloating: n.bloating,
    fatigue: n.fatigue,
    headache: n.headache,
    digestion: n.digestion,
    greasyCraving: ar.greasyCraving != null ? clamp10(ar.greasyCraving) : undefined,
    memo: memo ? memo : undefined,
    // 폼 복원용 메타데이터 (비인덱스). 재저장 시 상태값이 0으로 날아가지 않도록 보존.
    stateCodes: [...draft.stateCodes],
    overallIntensity: draft.overallIntensity,
    appetiteRatings: hasAppetiteRatings(ar) ? { ...ar } : undefined,
    // 지난밤 수면(비인덱스). 입력 없으면 undefined.
    lastNightSleep: normalizeLastNight(draft.lastNightSleep),
  }
}

function buildEventInputs(draft: DailyEntryDraft): EventLogInput[] {
  // 신규 지난밤 수면을 실제로 입력·저장한 날짜만, 지난밤 전용 legacy 수면 사건을 canonical
  // 데이터(lastNightSleep)로 교체한다 → 유령 수면 사건 재생성 방지, 이중 노출 방지.
  // lastNightSleep가 비어 있으면(옛 기록 열기만 한 경우 등) 아무것도 제거하지 않는다.
  const lastNightFilled = normalizeLastNight(draft.lastNightSleep) !== undefined
  const codes = lastNightFilled
    ? draft.catalogEventCodes.filter((c) => !LAST_NIGHT_SLEEP_CODES.has(c))
    : draft.catalogEventCodes
  const catalogEvents: EventLogInput[] = codes
    .map((code) => EVENT_CATALOG.find((e) => e.code === code))
    .filter((e): e is (typeof EVENT_CATALOG)[number] => e != null)
    .map((e) => ({
      date: draft.date,
      eventCode: e.code,
      eventLabel: e.label,
      category: e.category, // EventCategory ⊂ EventLogCategory (custom 제외)
      timing: draft.eventTiming,
      intensity: intensityValue(draft.eventIntensity),
      isCustom: false,
      mappedFactorGroup: e.factorGroup,
    }))

  const customEvents: EventLogInput[] = draft.customEvents.map((c) => ({
    date: draft.date,
    eventCode: c.eventCode,
    eventLabel: c.eventLabel,
    category: c.category,
    timing: c.timing,
    intensity: c.intensity,
    isCustom: true,
    customLabel: c.customLabel,
    mappedFactorGroup: c.mappedFactorGroup,
  }))

  return [...catalogEvents, ...customEvents]
}

function buildRecoveryInputs(draft: DailyEntryDraft): RecoveryLogInput[] {
  const positiveEffect: RecoveryEffectValue = draft.recoveryEffect === '' ? 'unknown' : draft.recoveryEffect
  const inputs: RecoveryLogInput[] = []
  const pushAction = (code: string, direction: 'positive' | 'negative') => {
    if (NON_SAVED_RECOVERY_CODES.has(code)) return // '없었음'/'아직 모름'은 저장 안 함
    const action = RECOVERY_ACTIONS.find((a) => a.code === code)
    if (!action) return
    const modelCategory = RECOVERY_CATEGORY_TO_MODEL[action.category]
    if (!modelCategory) return
    inputs.push({
      date: draft.date,
      actionCode: action.code,
      actionLabel: action.label,
      category: modelCategory,
      // 안 맞았던 것은 자기보고상 'worse'로 — 기존 회복 분석(EFFECT_SCORE)이 그대로 소화한다.
      effect: direction === 'negative' ? 'worse' : positiveEffect,
      direction,
      // before/after 세부 점수는 optional(비움). 전후 비교 필드는 유지.
    })
  }
  const negativeSet = new Set(draft.recoveryNegativeCodes ?? [])
  for (const code of draft.recoveryCodes) {
    if (negativeSet.has(code)) continue // 같은 날 양쪽 중복 방지 (UI에서도 막지만 안전망)
    pushAction(code, 'positive')
  }
  for (const code of negativeSet) pushAction(code, 'negative')
  return inputs
}

function buildCycleInput(draft: DailyEntryDraft): CycleLogInput | null {
  const c = draft.cycle
  const hasInput =
    c.periodStart || c.periodEnd || c.flowLevel != null || c.periodPain != null || c.symptoms.length > 0
  if (!hasInput) return null
  return {
    date: draft.date,
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
    flowLevel: c.flowLevel,
    periodPain: c.periodPain,
    symptoms: c.symptoms.length ? c.symptoms : undefined,
  }
}

/* ---------------------------------------------------------------------
   저장 / 불러오기
   --------------------------------------------------------------------- */

/** 하루 기록 1세트를 트랜잭션으로 저장한다(부분 성공 방지). */
export async function saveDailyEntry(draft: DailyEntryDraft): Promise<void> {
  const dailyLogInput = buildDailyLogInput(draft)
  const eventInputs = buildEventInputs(draft)
  const recoveryInputs = buildRecoveryInputs(draft)
  const cycleInput = buildCycleInput(draft)

  await db.transaction('rw', [db.dailyLogs, db.eventLogs, db.cycleLogs, db.recoveryLogs], async () => {
    await dailyLogRepository.upsert(dailyLogInput)

    // 같은 날짜 replace (quick log = 하루 1세트)
    await eventLogRepository.deleteByDate(draft.date)
    if (eventInputs.length > 0) await eventLogRepository.bulkAdd(eventInputs)

    await recoveryLogRepository.deleteByDate(draft.date)
    for (const r of recoveryInputs) await recoveryLogRepository.add(r)

    // 하루 1개 cycle log 전제 — 입력이 있을 때만 add
    await cycleLogRepository.deleteByDate(draft.date)
    if (cycleInput) await cycleLogRepository.add(cycleInput)
  })

  // 저장(커밋) 후 해당 날짜 점수를 다시 계산해 dailyScores upsert.
  // (engine은 DB를 모르므로 service가 트랜잭션 밖에서 모아 계산한다)
  await recalculateDailyScore(draft.date)
}

/** 해당 날짜의 저장 기록을 폼 draft로 복원한다. 기록이 전혀 없으면 null. */
export async function loadDailyEntry(date: ISODate): Promise<DailyEntryDraft | null> {
  const [dailyLog, events, cycles, recovery] = await Promise.all([
    dailyLogRepository.getByDate(date),
    eventLogRepository.listByDate(date),
    cycleLogRepository.listByDate(date),
    recoveryLogRepository.listByDate(date),
  ])

  if (!dailyLog && events.length === 0 && cycles.length === 0 && recovery.length === 0) {
    return null
  }

  const cycle = cycles[0]
  // 상태 칩 복원: 저장된 메타데이터 우선, 없으면(옛 기록) 숫자값에서 역추론.
  const stateCodes = dailyLog?.stateCodes ?? (dailyLog ? inferStateCodes(dailyLog) : [])
  const overallIntensity = (dailyLog?.overallIntensity as IntensityCode) ?? 'some'
  const appetiteRatings: AppetiteRatings = dailyLog?.appetiteRatings ? { ...dailyLog.appetiteRatings } : {}
  // 회복 방향 분리 (direction 없는 옛 기록은 positive로 간주)
  const positiveRecovery = recovery.filter((r) => r.direction !== 'negative')
  const negativeRecovery = recovery.filter((r) => r.direction === 'negative')
  return {
    date,
    stateCodes,
    overallIntensity,
    eventTiming: events[0]?.timing ?? 'today',
    eventIntensity: 'some',
    catalogEventCodes: events.filter((e) => !e.isCustom).map((e) => e.eventCode),
    customEvents: events
      .filter((e) => e.isCustom)
      .map((e) => ({
        eventCode: e.eventCode,
        eventLabel: e.eventLabel,
        category: e.category,
        timing: e.timing,
        intensity: e.intensity,
        isCustom: true,
        customLabel: e.customLabel,
        mappedFactorGroup: e.mappedFactorGroup,
      })),
    appetiteRatings,
    cycle: cycle
      ? {
          periodStart: cycle.periodStart,
          periodEnd: cycle.periodEnd,
          flowLevel: cycle.flowLevel,
          periodPain: cycle.periodPain,
          symptoms: cycle.symptoms ?? [],
        }
      : emptyCycleDraft(),
    recoveryCodes: positiveRecovery.map((r) => r.actionCode),
    recoveryNegativeCodes: negativeRecovery.map((r) => r.actionCode),
    recoveryEffect: positiveRecovery[0]?.effect ?? '',
    // 지난밤 수면 복원. 옛 기록(필드 없음)은 빈 카드로 — 기존 sleep 사건은 그대로 보존된다.
    lastNightSleep: dailyLog?.lastNightSleep
      ? {
          hours: dailyLog.lastNightSleep.hours,
          quality: dailyLog.lastNightSleep.quality,
          issues: [...(dailyLog.lastNightSleep.issues ?? [])],
        }
      : { issues: [] },
    memo: dailyLog?.memo ?? '',
  }
}
