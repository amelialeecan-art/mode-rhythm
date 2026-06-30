/* =====================================================================
   MODE · 개발용 demo data seed
   ⚠️ 이 데이터는 실제 분석 결과가 아니라 "개발용 demo data"다.
   화면 확인과 다음 단계 테스트를 위한 가짜 기록일 뿐이다.
   seedDemoData()는 먼저 기존 데이터를 비운 뒤(demo 일관성), demo 기록을 넣는다.
   ===================================================================== */
import { db } from './db'
import { resetDatabase } from './reset'
import { userSettingsRepository } from './repositories/userSettingsRepository'
import { toISODate } from '../lib/date'
import type {
  CycleLog,
  DailyLog,
  DailyScore,
  DayTypeCode,
  EventLog,
  RecoveryLog,
} from './models'

/** 오늘로부터 daysAgo일 전의 ISODate. */
function dateAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return toISODate(d)
}

/** 0~10 범위로 자르기. */
const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)))

const NOW = () => new Date().toISOString()

const DAY_TYPES: DayTypeCode[] = [
  'stable',
  'focus',
  'emotion_sensitive',
  'appetite_shift',
  'recovery_priority',
  'unknown_cause',
]

/**
 * demo data를 IndexedDB에 채운다.
 * 포함: 최근 21일 dailyLogs, 약간의 eventLogs/cycleLogs/recoveryLogs,
 *       일부 dailyScores(mock), userSettings 기본값.
 * @returns 각 테이블에 넣은 개수 요약
 */
export async function seedDemoData(): Promise<Record<string, number>> {
  await resetDatabase()

  const DAYS = 21
  const now = NOW()

  // ---- dailyLogs: 최근 21일 (사인파 + 가벼운 변동으로 demo 흐름) ----
  const dailyLogs: DailyLog[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = dateAgo(i)
    const wave = Math.sin((i / DAYS) * Math.PI * 2)
    const base = 4 + wave * 2.5
    dailyLogs.push({
      date,
      moodLow: clamp10(base + 1),
      anxiety: clamp10(base),
      irritability: clamp10(base - 1),
      sadness: clamp10(base),
      heaviness: clamp10(base + 0.5),
      calm: clamp10(6 - base),
      energy: clamp10(6 - base * 0.5),
      focus: clamp10(5 - wave),
      selfCriticism: clamp10(base),
      impulsivity: clamp10(base - 2),
      appetite: clamp10(5 + wave),
      sweetCraving: clamp10(4 + wave * 2),
      saltyCraving: clamp10(3 + wave),
      bingeUrge: clamp10(2 + wave * 2),
      sleepHours: +(6 + wave).toFixed(1),
      sleepQuality: clamp10(6 - base * 0.4),
      bodyDiscomfort: clamp10(base - 1),
      pain: clamp10(base - 2),
      bloating: clamp10(base - 1),
      fatigue: clamp10(base),
      headache: clamp10(base - 3),
      digestion: clamp10(base - 2),
      memo: i === 0 ? '오늘은 좀 가라앉는 느낌 (demo)' : undefined,
      createdAt: now,
      updatedAt: now,
    })
  }
  await db.dailyLogs.bulkAdd(dailyLogs)

  // ---- eventLogs: "오늘 있었던 일" demo 몇 개 (생리/주기는 절대 없음) ----
  const eventLogs: EventLog[] = [
    { date: dateAgo(0), eventCode: 'sleep_short', eventLabel: '잠이 부족했음', category: 'sleep', timing: 'today', intensity: 7, isCustom: false, mappedFactorGroup: 'sleep_deficit', createdAt: now },
    { date: dateAgo(0), eventCode: 'reply_stress', eventLabel: '연락/답장 때문에 신경 쓰였음', category: 'relationship', timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'reply_stress', createdAt: now },
    { date: dateAgo(1), eventCode: 'work_pressure', eventLabel: '마감/압박이 있었음', category: 'work', timing: 'today', intensity: 7, isCustom: false, mappedFactorGroup: 'deadline_pressure', createdAt: now },
    { date: dateAgo(2), eventCode: 'meal_latenight', eventLabel: '야식 먹음', category: 'food', timing: 'today', intensity: 5, isCustom: false, mappedFactorGroup: 'late_night_eating', createdAt: now },
    { date: dateAgo(3), eventCode: 'weighed', eventLabel: '몸무게를 봄', category: 'appearance', timing: 'today', intensity: 4, isCustom: false, mappedFactorGroup: 'body_image', createdAt: now },
    { date: dateAgo(5), eventCode: 'sns_heavy', eventLabel: 'SNS를 많이 봄', category: 'digital', timing: 'today', intensity: 6, isCustom: false, mappedFactorGroup: 'social_media', createdAt: now },
    // custom event도 mappedFactorGroup으로 수렴 가능함을 보여주는 demo
    { date: dateAgo(6), eventCode: 'custom_1', eventLabel: '체중계 올라감', category: 'custom', timing: 'today', intensity: 4, isCustom: true, customLabel: '체중계 올라감', mappedFactorGroup: 'body_image', createdAt: now },
  ]
  await db.eventLogs.bulkAdd(eventLogs)

  // ---- cycleLogs: 생리 시작/종료 사실 기록 demo ----
  const cycleLogs: CycleLog[] = [
    { date: dateAgo(14), periodStart: true, periodEnd: false, flowLevel: 'normal', periodPain: 4, symptoms: ['허리 묵직함'], createdAt: now, updatedAt: now },
    { date: dateAgo(10), periodStart: false, periodEnd: true, flowLevel: 'light', periodPain: 1, createdAt: now, updatedAt: now },
  ]
  await db.cycleLogs.bulkAdd(cycleLogs)

  // ---- recoveryLogs: 회복 행동 demo ----
  const recoveryLogs: RecoveryLog[] = [
    { date: dateAgo(0), actionCode: 'walk', actionLabel: '산책', category: 'body', beforeMood: 6, afterMood: 4, beforeAnxiety: 6, afterAnxiety: 4, effect: 'little_better', timeGap: '30m', createdAt: now },
    { date: dateAgo(1), actionCode: 'shower', actionLabel: '샤워', category: 'body', beforeMood: 7, afterMood: 5, effect: 'little_better', timeGap: 'immediate', createdAt: now },
    { date: dateAgo(2), actionCode: 'alone', actionLabel: '혼자 있기', category: 'reality', beforeAnxiety: 7, afterAnxiety: 5, effect: 'much_better', timeGap: '2h', createdAt: now },
    { date: dateAgo(4), actionCode: 'protein', actionLabel: '단백질 식사', category: 'body', beforeAppetite: 7, afterAppetite: 4, effect: 'little_better', timeGap: 'immediate', createdAt: now },
    { date: dateAgo(7), actionCode: 'journal', actionLabel: '일기', category: 'emotional', beforeMood: 6, afterMood: 5, effect: 'same', timeGap: 'immediate', createdAt: now },
  ]
  await db.recoveryLogs.bulkAdd(recoveryLogs)

  // ---- dailyScores: mock 점수 (실제 계산 아님 — 후속 단계 engine이 대체) ----
  const dailyScores: DailyScore[] = []
  for (let i = 6; i >= 0; i--) {
    const date = dateAgo(i)
    const wave = Math.abs(Math.sin((i / 7) * Math.PI))
    const emotional = Math.round(40 + wave * 40)
    dailyScores.push({
      date,
      emotionalLoad: emotional,
      appetiteLoad: Math.round(30 + wave * 35),
      sleepLoad: Math.round(35 + wave * 30),
      bodyLoad: Math.round(25 + wave * 25),
      cycleLoad: Math.round(20 + wave * 20),
      eventLoad: Math.round(30 + wave * 30),
      rhythmLoad: Math.round(35 + wave * 35),
      recoveryScore: Math.round(20 + (1 - wave) * 40),
      dayType: DAY_TYPES[i % DAY_TYPES.length],
      dayTypeSubLabel: undefined, // 동적 문구는 후속 단계 engine에서 생성
      confidence: Math.round(30 + wave * 40),
      createdAt: now,
      updatedAt: now,
    })
  }
  await db.dailyScores.bulkAdd(dailyScores)

  // ---- patternInsights: demo 1개 (단정 금지 톤) ----
  await db.patternInsights.add({
    insightType: 'combo',
    targetMetric: 'appetite',
    factorCodes: ['sleep_deficit', 'cycle_premenstrual'],
    effectSize: 0.4,
    confidence: 42,
    supportCount: 5,
    message: '수면 부족과 월경 전 구간이 함께 있을 때 식욕 변동이 더 크게 나타난 경향이 있어요. 아직은 가능성 단계예요. (개발용 demo data)',
    createdAt: now,
  })

  // ---- userSettings: 기본값 보장 ----
  await userSettingsRepository.ensureDefault()

  return {
    dailyLogs: dailyLogs.length,
    eventLogs: eventLogs.length,
    cycleLogs: cycleLogs.length,
    recoveryLogs: recoveryLogs.length,
    dailyScores: dailyScores.length,
    patternInsights: 1,
    userSettings: 1,
  }
}
