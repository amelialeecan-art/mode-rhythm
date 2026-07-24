/* =====================================================================
   MODE · 월간 비교 리포트 (순수 함수 · step5)
   달을 넘어가는 개인 반복 흐름(personalRhythm)과 별개로, 현실적인 생활 변화를
   "이번 달 vs 지난달(같은 기간)"으로 비교한다. 새 판정 기준을 만들지 않고
   resolveDailyStateDomains + 기존 flowSegments만 재사용한다.

   - 상태값은 resolveDailyStateDomains(log)에서 읽는다(직접값 우선·옛 기록 fallback 유지).
   - 원시 건수가 아니라 각 기간의 "유효 기록일 대비 비율"로 공정 비교한다.
   - rhythmExceptionCodes가 있는 날은 일반 상태 비교의 분모·값에서 제외한다.
   - 문장은 만들지 않는다(데이터만 반환). 한국어 문장은 rhythm voice helper에서.
   ===================================================================== */
import type { DailyLog, ISODate, DayContextCode } from '../data/models'
import { parseISODate, toISODate, addMonths, startOfMonth, endOfMonth, startOfMonthISO, endOfMonthISO } from '../lib/date'
import { hasRhythmException } from '../data/catalog/dailyCheckIn'
import { resolveDailyStateDomains, type DailyStateDomains, type DomainReading } from './stateDomains'
import { buildFlowSegments, type FlowSegment } from './flowSegments'
import type { RecentFlowDay } from './recentFlow'

/* ---- 임계값 (한곳에서만 정의) ---- */
export const MONTHLY_MIN_VALID_DAYS = 10 // 각 기간 최소 유효 기록일
export const MONTHLY_MIN_COVERAGE = 0.5 // 각 기간 비교 범위 대비 최소 커버리지
export const MONTHLY_MIN_DOMAIN_DAYS = 8 // 한 영역을 비교하려면 각 기간에 이만큼 입력 필요
export const MONTHLY_MIN_RATIO_DIFF = 0.15 // 의미 있는 비율 차이(≈15%p)
export const MONTHLY_MIN_RECOVERY_CASES = 2 // 회복 속도 비교에 필요한 완결 사례(각 기간)

const LOW_CAPACITY = 35 // capacity 영역: 이하이면 "떨어진/낮은 날"
const HIGH_STRAIN = 60 // strain 영역: 이상이면 "큰/버거운 날"
const SWEET_HIGH = 7 // 단것 당김: 이상이면 "강한 날"
const RECOVERY_LEN_MIN_DIFF = 1.5 // 소모 구간 평균 길이 차이(일)

export type MonthlyInsightKind = 'state' | 'sleep' | 'appetite' | 'recovery' | 'context'

export interface MonthlyComparisonInsight {
  /** dedup·React key. */
  key: string
  /** 영역 식별자(voice helper가 라벨로 변환). 예: 'bodyEnergy', 'sweetCraving', 'context:office'. */
  domain: string
  direction: 'better' | 'worse' | 'changed'
  kind: MonthlyInsightKind
  /** 원시 방향(문장 "늘었/줄었"용). up=이번 기간에 더 많아짐. */
  trend: 'up' | 'down'
  /** 정렬용 크기(화면 미노출). */
  magnitude: number
}

export interface MonthlyComparison {
  currentStart: ISODate
  currentEnd: ISODate
  previousStart: ISODate
  previousEnd: ISODate
  /** 진행 중인 달(같은 일자 범위 비교)인지. */
  partialMonth: boolean
  insights: MonthlyComparisonInsight[]
}

export interface MonthlyPeriods {
  currentStart: ISODate
  currentEnd: ISODate
  previousStart: ISODate
  previousEnd: ISODate
  partialMonth: boolean
}

function daysInclusive(start: ISODate, end: ISODate): number {
  return Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / 86400000) + 1
}

/** targetDate가 today보다 미래의 달인지(미래 달은 분석하지 않는다). */
export function isFutureMonth(targetDate: ISODate, today: ISODate): boolean {
  const t = parseISODate(targetDate)
  const n = parseISODate(today)
  return t.getFullYear() > n.getFullYear() || (t.getFullYear() === n.getFullYear() && t.getMonth() > n.getMonth())
}

/**
 * 비교 기간 계산. "말일 여부"가 아니라 target 달이 실제 현재 달인지로 판정한다.
 * - target 달 == 현재 달(today 기준): 1일~오늘 vs 지난달 같은 일자 범위(진행 중).
 * - target 달 < 현재 달(과거 달): 그 달 중간 날짜를 골라도 선택 월 전체 vs 이전 달 전체.
 * (미래 달은 buildMonthlyComparison에서 제외한다.) 윤년·30/31일은 클램프로 안전 처리.
 */
export function monthlyComparePeriods(targetDate: ISODate, today: ISODate = targetDate): MonthlyPeriods {
  const d = parseISODate(targetDate)
  const now = parseISODate(today)
  const isCurrentMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  const monthStart = startOfMonth(d)
  const prev = addMonths(d, -1)
  const prevStart = startOfMonth(prev)

  if (isCurrentMonth) {
    // 진행 중: currentEnd = 오늘. 오늘이 말일이면 사실상 완료된 달(partialMonth=false).
    const day = now.getDate()
    const monthLen = endOfMonth(d).getDate()
    const prevLen = endOfMonth(prev).getDate()
    const prevDay = Math.min(day, prevLen)
    return {
      currentStart: startOfMonthISO(d),
      currentEnd: toISODate(new Date(d.getFullYear(), d.getMonth(), day)),
      previousStart: toISODate(prevStart),
      previousEnd: toISODate(new Date(prevStart.getFullYear(), prevStart.getMonth(), prevDay)),
      partialMonth: day < monthLen,
    }
  }
  // 과거 달: 선택 월 전체 vs 이전 달 전체 (선택 날짜와 무관).
  void monthStart
  return {
    currentStart: startOfMonthISO(d),
    currentEnd: endOfMonthISO(d),
    previousStart: toISODate(prevStart),
    previousEnd: endOfMonthISO(prev),
    partialMonth: false,
  }
}

/* ---- 영역별 비교 설정 ---- */
interface DomainSpec {
  domain: keyof DailyStateDomains
  kind: MonthlyInsightKind
  family: string // 같은 계열 중복 제거용
}
const DOMAIN_SPECS: DomainSpec[] = [
  { domain: 'bodyEnergy', kind: 'state', family: 'bodyEnergy' },
  { domain: 'functionLevel', kind: 'state', family: 'functionLevel' },
  { domain: 'emotionalStability', kind: 'state', family: 'emotionalStability' },
  { domain: 'emotionalBurden', kind: 'state', family: 'emotionalBurden' },
  { domain: 'mentalSpace', kind: 'state', family: 'mentalSpace' },
  { domain: 'focus', kind: 'state', family: 'focus' },
  { domain: 'socialCapacity', kind: 'state', family: 'socialCapacity' },
  { domain: 'bodyDiscomfort', kind: 'state', family: 'bodyDiscomfort' },
  { domain: 'sleep', kind: 'sleep', family: 'sleep' },
  { domain: 'appetite', kind: 'appetite', family: 'appetite' },
]
const CONTEXTS: DayContextCode[] = ['office', 'remote', 'off', 'special']

/** "힘든 날"인지 — capacity는 낮을 때, strain은 높을 때. */
function isBadDay(r: DomainReading): boolean {
  return r.kind === 'capacity' ? r.value <= LOW_CAPACITY : r.value >= HIGH_STRAIN
}

interface PeriodData {
  validDays: number
  coverage: number
  rangeLen: number
  domains: Map<string, DailyStateDomains> // date → resolved
  logs: DailyLog[] // 예외일 제외한 유효일
}

function collectPeriod(all: DailyLog[], start: ISODate, end: ISODate): PeriodData {
  const rangeLen = daysInclusive(start, end)
  const domains = new Map<string, DailyStateDomains>()
  const logs: DailyLog[] = []
  for (const l of all) {
    if (l.date < start || l.date > end) continue
    if (hasRhythmException(l.rhythmExceptionCodes)) continue // 예외일 제외
    const dom = resolveDailyStateDomains(l)
    const anyPresent = Object.values(dom).some((v) => v !== undefined)
    if (!anyPresent) continue // 빈 저장은 유효 기록 아님
    domains.set(l.date, dom)
    logs.push(l)
  }
  const validDays = logs.length
  return { validDays, coverage: rangeLen > 0 ? validDays / rangeLen : 0, rangeLen, domains, logs }
}

/** 완결 소모→회복 사례 수 + 소모 구간 평균 길이. */
function recoveryStats(logs: DailyLog[]): { completed: number; meanDepletingLen: number } {
  const days: RecentFlowDay[] = logs
    .map((l) => {
      const d = resolveDailyStateDomains(l)
      return {
        date: l.date,
        emotional: d.emotionalBurden?.value,
        appetite: d.appetite?.value,
        sleep: d.sleep?.value,
        body: d.bodyDiscomfort?.value,
        functionLevel: l.functionLevel,
      }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const segments: FlowSegment[] = buildFlowSegments(days)
  const depleting = segments.filter((s) => s.status === 'depleting')
  let completed = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].status !== 'depleting') continue
    // 이후 어느 구간이든 회복이 나오면 완결 사례로 본다.
    if (segments.slice(i + 1).some((s) => s.status === 'recovering')) completed++
  }
  const meanDepletingLen = depleting.length > 0 ? depleting.reduce((a, s) => a + s.lengthDays, 0) / depleting.length : 0
  return { completed, meanDepletingLen }
}

/** 영역 비교 → 후보(없으면 undefined). */
function compareDomain(spec: DomainSpec, cur: PeriodData, prev: PeriodData): MonthlyComparisonInsight | undefined {
  let curPresent = 0
  let curBad = 0
  let prevPresent = 0
  let prevBad = 0
  for (const dom of cur.domains.values()) {
    const r = dom[spec.domain]
    if (!r) continue
    curPresent++
    if (isBadDay(r)) curBad++
  }
  for (const dom of prev.domains.values()) {
    const r = dom[spec.domain]
    if (!r) continue
    prevPresent++
    if (isBadDay(r)) prevBad++
  }
  if (curPresent < MONTHLY_MIN_DOMAIN_DAYS || prevPresent < MONTHLY_MIN_DOMAIN_DAYS) return undefined
  const diff = curBad / curPresent - prevBad / prevPresent
  if (Math.abs(diff) < MONTHLY_MIN_RATIO_DIFF) return undefined
  return {
    key: `state:${spec.domain}`,
    domain: spec.domain,
    direction: diff < 0 ? 'better' : 'worse',
    kind: spec.kind,
    trend: diff < 0 ? 'down' : 'up',
    magnitude: Math.abs(diff),
  }
}

/** 단것 당김 강한 날 비율(식욕 계열 별도 후보). */
function compareSweetCraving(cur: PeriodData, prev: PeriodData): MonthlyComparisonInsight | undefined {
  const count = (pd: PeriodData) => {
    let present = 0
    let bad = 0
    for (const l of pd.logs) {
      const v = l.appetiteRatings?.sweetCraving ?? (l.sweetCraving > 0 ? l.sweetCraving : undefined)
      if (v === undefined) continue
      present++
      if (v >= SWEET_HIGH) bad++
    }
    return { present, bad }
  }
  const c = count(cur)
  const p = count(prev)
  if (c.present < MONTHLY_MIN_DOMAIN_DAYS || p.present < MONTHLY_MIN_DOMAIN_DAYS) return undefined
  const diff = c.bad / c.present - p.bad / p.present
  if (Math.abs(diff) < MONTHLY_MIN_RATIO_DIFF) return undefined
  return {
    key: 'appetite:sweetCraving',
    domain: 'sweetCraving',
    direction: diff < 0 ? 'better' : 'worse',
    kind: 'appetite',
    trend: diff < 0 ? 'down' : 'up',
    magnitude: Math.abs(diff),
  }
}

/** 생활 맥락 구성 변화(좋고 나쁨 없이 사실). */
function compareContext(ctx: DayContextCode, cur: PeriodData, prev: PeriodData): MonthlyComparisonInsight | undefined {
  const ratio = (pd: PeriodData) => {
    let has = 0
    let match = 0
    for (const l of pd.logs) {
      if (l.dayContext == null) continue
      has++
      if (l.dayContext === ctx) match++
    }
    return has > 0 ? { ratio: match / has, has } : null
  }
  const c = ratio(cur)
  const p = ratio(prev)
  if (!c || !p || c.has < MONTHLY_MIN_DOMAIN_DAYS || p.has < MONTHLY_MIN_DOMAIN_DAYS) return undefined
  const diff = c.ratio - p.ratio
  if (Math.abs(diff) < MONTHLY_MIN_RATIO_DIFF) return undefined
  return {
    key: `context:${ctx}`,
    domain: `context:${ctx}`,
    direction: 'changed',
    kind: 'context',
    trend: diff < 0 ? 'down' : 'up',
    magnitude: Math.abs(diff),
  }
}

const KIND_PRIORITY: Record<MonthlyInsightKind, number> = { state: 0, sleep: 0, appetite: 0, recovery: 1, context: 2 }

/**
 * 월간 비교. 근거가 부족하거나 의미 있는 차이가 없으면 null(카드 전체 숨김).
 * 미래 달(today 기준)은 분석하지 않는다. today 미지정 시 targetDate를 현재로 본다(하위 호환).
 */
export function buildMonthlyComparison(logs: DailyLog[], targetDate: ISODate, today: ISODate = targetDate): MonthlyComparison | null {
  if (isFutureMonth(targetDate, today)) return null
  const periods = monthlyComparePeriods(targetDate, today)
  const cur = collectPeriod(logs, periods.currentStart, periods.currentEnd)
  const prev = collectPeriod(logs, periods.previousStart, periods.previousEnd)

  // 최소 데이터·커버리지 게이트(둘 다 충족해야 일반 상태 비교).
  const gateOk = (pd: PeriodData) => pd.validDays >= MONTHLY_MIN_VALID_DAYS && pd.coverage >= MONTHLY_MIN_COVERAGE
  if (!gateOk(cur) || !gateOk(prev)) return null

  const raw: MonthlyComparisonInsight[] = []
  for (const spec of DOMAIN_SPECS) {
    const r = compareDomain(spec, cur, prev)
    if (r) raw.push(r)
  }
  const sweet = compareSweetCraving(cur, prev)
  if (sweet) raw.push(sweet)
  for (const ctx of CONTEXTS) {
    const r = compareContext(ctx, cur, prev)
    if (r) raw.push(r)
  }

  // 회복 속도(양쪽 완결 사례 2개↑일 때만). 부족하면 이 후보만 제외.
  const rc = recoveryStats(cur.logs)
  const rp = recoveryStats(prev.logs)
  if (rc.completed >= MONTHLY_MIN_RECOVERY_CASES && rp.completed >= MONTHLY_MIN_RECOVERY_CASES) {
    const lenDiff = rc.meanDepletingLen - rp.meanDepletingLen
    if (Math.abs(lenDiff) >= RECOVERY_LEN_MIN_DIFF) {
      raw.push({
        key: 'recovery:depletingLen',
        domain: 'depletingLen',
        direction: lenDiff < 0 ? 'better' : 'worse',
        kind: 'recovery',
        trend: lenDiff < 0 ? 'down' : 'up',
        magnitude: Math.min(1, Math.abs(lenDiff) / 10),
      })
    }
  }

  // 같은 계열(appetite: 식욕/단것 당김) 중복 제거 — 큰 것만.
  const byFamily = new Map<string, MonthlyComparisonInsight>()
  const familyOf = (i: MonthlyComparisonInsight) => (i.kind === 'appetite' ? 'appetite' : i.key)
  for (const i of raw) {
    const fam = familyOf(i)
    const cur2 = byFamily.get(fam)
    if (!cur2 || i.magnitude > cur2.magnitude) byFamily.set(fam, i)
  }
  const deduped = [...byFamily.values()]

  // 상태·기능 변화를 생활 맥락보다 우선, 그다음 크기순. 최대 3개.
  deduped.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || b.magnitude - a.magnitude)
  const insights = deduped.slice(0, 3)
  if (insights.length === 0) return null

  return {
    currentStart: periods.currentStart,
    currentEnd: periods.currentEnd,
    previousStart: periods.previousStart,
    previousEnd: periods.previousEnd,
    partialMonth: periods.partialMonth,
    insights,
  }
}
