/* =====================================================================
   MODE · 공통 이벤트 타임라인 (순수 함수 · update2 연결 1단계)
   새로 추가된 mindSignalCodes와 새 sleep issue 코드를, 기존 eventLogs와
   함께 "날짜 기준 하나의 timeline"으로 합친다. 아직 factorEffect/분석 점수에
   연결하지 않는다 — 이후 단계가 소비할 수 있는 canonical 입력만 만든다.

   engine은 React/Dexie를 모른다. 입력(로그 배열) → 타임라인 배열(순수).
   ⚠️ 저장 데이터를 만들지 않는다. 빈 날짜를 자동 생성하지 않는다.
   ⚠️ today 이후(미래) 날짜는 절대 타임라인에 넣지 않는다(누수 방지, §12).
   ===================================================================== */
import type { DailyLog, EventLog, ISODate } from '../data/models'
import { SLEEP_CODE_TO_GROUP } from '../data/catalog/lastNightSleep'
import { hasRhythmException } from '../data/catalog/dailyCheckIn'
import { resolveDailyStateDomains, type DailyStateDomains } from './stateDomains'
import { isHard } from './todayDecision'
import { addDaysISO } from './correlation'

/** 타임라인 항목의 출처. state = 사용자가 직접 입력한 하루 상태. */
export type EpisodeTimelineSource = 'event' | 'mind' | 'sleep' | 'state'

/** 날짜 기준으로 합쳐진 하나의 타임라인 항목. 분석 계층이 소비할 canonical 입력. */
export interface EpisodeTimelineItem {
  /** 귀속 날짜(사건은 발생 추정일, 마음·수면은 기록 날짜=recordedOn). */
  date: ISODate
  source: EpisodeTimelineSource
  /** 항목 식별 키(사건/수면은 eventCode, 마음은 mindSignal code). */
  eventKey: string
  /** 이후 분석 연결용 factorGroup(마음은 아직 매핑 없음 → 코드 그대로). */
  factorGroup: string
  /**
   * 수면 전용: lastNightSleep을 입력한 DailyLog 날짜(아침). 낮 상태·사건은 undefined.
   * ⚠️ lastNightSleep은 그날 아침에 적는 "전날 밤"의 잠이다. date(=recordedOn)를
   *    낮 상태와 같은 시점으로 착각하지 않도록 recordedOn/nightOf를 구분해 보존한다.
   */
  recordedOn?: ISODate
  /** 수면 전용: 실제 잠을 잔 밤(recordedOn - 1일). run/transition의 시간 순서에 쓴다. */
  nightOf?: ISODate
}

/** buildEpisodeTimeline 입력. 셋 다 optional — 없으면 그 출처는 건너뛴다. */
export interface EpisodeTimelineInput {
  /** 기존 "오늘 있었던 일" 사건 로그. */
  eventLogs?: EventLog[]
  /** 마음 신호·지난밤 수면을 담은 일일 로그(비인덱스 optional 필드에서 읽는다). */
  dailyLogs?: DailyLog[]
}

/* ---------------------------------------------------------------------
   직접 입력한 하루 상태 → state timeline item
   resolveDailyStateDomains(공식 불변)로 영역을 읽고, "어려운 값"일 때만 item을
   만든다. 어려움 판정은 Today가 쓰는 isHard(difficulty>=HARD_MIN)를 그대로 재사용
   한다(임의 threshold 없음, capacity/strain 방향을 뒤집지 않음).
   ⚠️ generic 수면(sleep 영역)은 구체 lastNightSleep과 겹쳐 제외. mindSignalCodes는
      state로 바꾸지 않는다. 미입력(undefined) 영역은 item을 만들지 않는다.
   --------------------------------------------------------------------- */

/** state 신호 정의: resolver 영역 ↔ 내부 key ↔ 사람말 label. sleep 영역은 의도적으로 제외. */
export const STATE_SIGNAL_DEFS: { domain: keyof DailyStateDomains; key: string; label: string }[] = [
  { domain: 'emotionalStability', key: 'state_emotion_unsteady', label: '감정이 쉽게 흔들림' },
  { domain: 'emotionalBurden', key: 'state_emotions_linger', label: '예민함이나 짜증 같은 감정이 오래 감' },
  { domain: 'bodyEnergy', key: 'state_tired', label: '몸이 쉽게 지침' },
  { domain: 'mentalSpace', key: 'state_mind_busy', label: '머리가 복잡함' },
  { domain: 'focus', key: 'state_focus_hard', label: '집중하기 어려움' },
  { domain: 'functionLevel', key: 'state_daily_tasks_hard', label: '평소 하던 일이 버거움' },
  { domain: 'socialCapacity', key: 'state_people_hard', label: '사람을 대하기 버거움' },
  { domain: 'bodyDiscomfort', key: 'state_body_uncomfortable', label: '몸이 불편함' },
  // 식욕·단것 당김은 resolver에서 하나의 appetite 영역으로 합쳐진다(별도 sweets 영역 없음).
  // double count를 피하려 대표 1개(state_appetite_changed)만 만들고 state_sweets_craving은 생략한다.
  { domain: 'appetite', key: 'state_appetite_changed', label: '먹고 싶은 정도가 평소와 달라짐' },
]

/** state 코드 → 사람말 라벨(이후 화면용). unknown은 여기 없으면 미표시. */
export const STATE_SIGNAL_LABEL: Map<string, string> = new Map(STATE_SIGNAL_DEFS.map((d) => [d.key, d.label]))

/**
 * 하루 상태를 state timeline item으로 변환한다(순수). 각 영역은 resolver가 주는 값이
 * "어려운 값"일 때만 item을 만든다(capacity 낮음/ strain 높음 = isHard). 미입력은 생략.
 * date=DailyLog 날짜(낮 상태). 미래 날짜는 제외한다.
 */
export function buildStateTimelineItems(dailyLogs: DailyLog[] | undefined, today: ISODate): EpisodeTimelineItem[] {
  const items: EpisodeTimelineItem[] = []
  for (const log of dailyLogs ?? []) {
    if (log.date > today) continue
    const domains = resolveDailyStateDomains(log)
    for (const def of STATE_SIGNAL_DEFS) {
      const reading = domains[def.domain]
      if (!isHard(reading)) continue // 미입력(undefined)이나 어렵지 않은 값이면 item 없음.
      items.push({ date: log.date, source: 'state', eventKey: def.key, factorGroup: String(def.domain) })
    }
  }
  return items
}

/**
 * 사건의 귀속 날짜(발생 추정일). engine은 서비스를 import하지 않으므로
 * patternAnalysisService.eventOccurrenceDate와 동일한 규칙을 여기서 순수하게 재현한다.
 * - today → 기록 날짜, yesterday → 하루 전, exact → occurredOn(없으면 기록 날짜).
 * - recent3days/recent7days → 정확한 날짜가 없어 타임라인에서 제외(null).
 */
function occurrenceDate(timing: string, date: ISODate, occurredOn?: ISODate): ISODate | null {
  if (timing === 'today') return date
  if (timing === 'yesterday') return addDaysISO(date, -1)
  if (timing === 'exact') return occurredOn ?? date
  return null
}

/**
 * eventLogs + mindSignalCodes + 지난밤 수면 issue를 하나의 타임라인으로 합친다.
 *
 * 규칙:
 * - 날짜순 오름차순 정렬(같은 날짜는 eventKey순으로 안정 정렬).
 * - 같은 날짜 + 같은 eventKey 중복 제거(먼저 나온 항목 유지 — 사건 > 수면 > 마음 순).
 * - 빈 날짜를 자동 생성하지 않는다(입력에 있는 날짜만).
 * - today 이후(미래) 날짜는 제외한다.
 *
 * ⚠️ 수면은 기존 3그룹(sleep_deficit/sleep_schedule/sleep_quality)뿐 아니라
 *    새 그룹(bedtime_delay/bedtime_resistance/sleep_onset 등)도 모두 포함한다
 *    (getSleepExposureForDate와 달리 SLEEP_EXPOSURE_GROUPS로 걸러내지 않는다).
 */
export function buildEpisodeTimeline(input: EpisodeTimelineInput, today: ISODate): EpisodeTimelineItem[] {
  const items: EpisodeTimelineItem[] = []

  // 1) 기존 사건 로그 — 발생 추정일이 없는(recent3/7days) 항목은 제외.
  for (const e of input.eventLogs ?? []) {
    const occ = occurrenceDate(e.timing, e.date, e.occurredOn)
    if (occ === null) continue
    items.push({ date: occ, source: 'event', eventKey: e.eventCode, factorGroup: e.mappedFactorGroup })
  }

  // 2) 지난밤 수면 issue — 새 그룹 포함. 코드 → factorGroup 매핑이 있는 것만.
  for (const log of input.dailyLogs ?? []) {
    for (const code of log.lastNightSleep?.issues ?? []) {
      const group = SLEEP_CODE_TO_GROUP[code]
      if (!group) continue
      items.push({
        date: log.date,
        source: 'sleep',
        eventKey: code,
        factorGroup: group,
        recordedOn: log.date,
        nightOf: addDaysISO(log.date, -1),
      })
    }
  }

  // 3) 마음 신호 — 아직 factorGroup 매핑이 없어 코드를 그대로 factorGroup으로 둔다.
  for (const log of input.dailyLogs ?? []) {
    for (const code of log.mindSignalCodes ?? []) {
      items.push({ date: log.date, source: 'mind', eventKey: code, factorGroup: code })
    }
  }

  // 4) 직접 입력한 하루 상태(어려운 영역만). resolver 공식·방향 그대로 재사용.
  items.push(...buildStateTimelineItems(input.dailyLogs, today))

  // 미래 날짜 제외 → 날짜·키 순 정렬 → 같은 날짜+키 중복 제거(먼저 나온 것 유지).
  const seen = new Set<string>()
  return items
    .filter((it) => it.date <= today)
    .sort((a, b) => (a.date === b.date ? (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0) : a.date < b.date ? -1 : 1))
    .filter((it) => {
      const key = `${it.date}|${it.eventKey}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/* =====================================================================
   이어진 구간(run) · 변화 순서(transition) · 여파(aftereffect)
   ─────────────────────────────────────────────────────────────────────
   buildEpisodeTimeline이 만든 날짜별 item 위에서 "구조"만 계산한다.
   ⚠️ 이번 단계에서 하지 않는 것: episode 전체 시작/종료 판정, 반복 motif,
      회복 순서, 개인 주기, factorEffect/flowDrivers, service 연결. 인과 라벨 없음.
   ⚠️ 수면 item의 시간 순서에는 date(=recordedOn)가 아니라 nightOf를 쓴다.
   ⚠️ 미기록 하루를 "없음"으로 단정하지 않는다(불확실 경계로 분리).
   ⚠️ rhythm exception 날짜와 3일 이상 연속 미기록은 블록 경계로 취급한다.
   ===================================================================== */

/**
 * run 경계 이유 — 다음 단계 회복 판정을 위해 시작/종료가 왜 생겼는지 구분한다.
 * - observed:    실제 기록일에서 이전/이후 신호가 더 이상 선택되지 않음(관찰된 시작·종료).
 * - missing_gap: 이웃 날 DailyLog 자체가 없어 확인 불가(정상·회복으로 단정하지 않는다).
 * - exception:   rhythm exception으로 일반 흐름이 끊김.
 * - range_edge:  분석 범위(관찰 구간) 시작 또는 끝까지 이어짐.
 */
export type RunBoundary = 'observed' | 'missing_gap' | 'exception' | 'range_edge'

/** 하나의 신호(eventKey)가 실제 연속된 날짜에 이어진 구간. */
export interface TimelineRun {
  /** 신호 식별 키(= item.eventKey). */
  key: string
  source: EpisodeTimelineSource
  factorGroup: string
  /** 순서용 날짜(수면은 nightOf) 기준 시작/끝. */
  startDate: ISODate
  endDate: ISODate
  /** 실제 기록으로 확인된 날 수. */
  validDays: number
  /** 시작~끝 달력 일수(연속 run이라 validDays와 같다). */
  calendarDays: number
  /** run에 포함된 순서용 날짜들(오름차순). */
  dates: ISODate[]
  /** run 시작 경계 이유. */
  startBoundary: RunBoundary
  /** run 종료 경계 이유(회복 판정용). */
  endBoundary: RunBoundary
}

/** 먼저 시작한 run 뒤에 다른 run이 며칠 뒤 시작했는지(변화 순서). 인과가 아니다. */
export interface TimelineTransition {
  fromKey: string
  toKey: string
  fromStartDate: ISODate
  toStartDate: ISODate
  /** toStart - fromStart (0~3). 같은 날 시작=0, 다음 날=1. */
  lagDays: number
  /** 두 run이 실제로 겹친 날짜 수. */
  overlapDays: number
}

/** 먼저 끝난 신호 뒤에 다른 신호가 실제 기록상 며칠 더 남았는지. */
export interface TimelineAftereffect {
  sourceKey: string
  remainingKey: string
  sourceEndDate: ISODate
  remainingEndDate: ISODate
  /** remainingEnd - sourceEnd (최소 1). */
  extraDays: number
}

/** run/transition 계산에 필요한 순수 컨텍스트(DB 모델 변경 없음). */
export interface EpisodeSequenceContext {
  /** 실제 DailyLog가 있는 날(=기록 존재일). 여기 없는 날은 "미기록"이며 없음으로 단정하지 않는다. */
  recordedDates: ReadonlySet<ISODate>
  /** rhythm exception 날(일반 흐름에서 분리할 날). */
  exceptionDates: ReadonlySet<ISODate>
  /** 분석 범위(관찰 구간) 시작. 이보다 앞을 못 보면 run 시작은 range_edge. */
  rangeStart?: ISODate
  /** 분석 범위 끝(보통 today). 이 날까지 이어지면 run 종료는 range_edge. */
  rangeEnd?: ISODate
}

/** 연속 미기록이 이 일수 이상이면 확실한 새 블록 경계. */
export const UNRECORDED_BLOCK_GAP = 3
/** transition으로 인정하는 최대 시작 간격(일). */
export const MAX_TRANSITION_LAG = 3

/**
 * DailyLog 배열에서 기록 존재일·예외일·분석 범위를 파생한다(순수 · 저장 없음).
 * today를 주면 rangeEnd=today(관찰 끝). rangeStart는 가장 이른 기록일.
 */
export function deriveSequenceContext(dailyLogs: DailyLog[] | undefined, today?: ISODate): EpisodeSequenceContext {
  const recordedDates = new Set<ISODate>()
  const exceptionDates = new Set<ISODate>()
  let min: ISODate | undefined
  let max: ISODate | undefined
  for (const log of dailyLogs ?? []) {
    recordedDates.add(log.date)
    if (hasRhythmException(log.rhythmExceptionCodes)) exceptionDates.add(log.date)
    if (min === undefined || log.date < min) min = log.date
    if (max === undefined || log.date > max) max = log.date
  }
  return { recordedDates, exceptionDates, rangeStart: min, rangeEnd: today ?? max }
}

function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** item의 순서용 날짜(수면=nightOf, 그 외=date). */
function orderDate(item: EpisodeTimelineItem): ISODate {
  return item.source === 'sleep' ? item.nightOf ?? item.date : item.date
}

/** 순서용 날짜(orderDay)를 DailyLog가 실제 놓이는 날로 환산(수면=아침 D+1, 그 외=그날). */
function logDateFor(source: EpisodeTimelineSource, orderDay: ISODate): ISODate {
  return source === 'sleep' ? addDaysISO(orderDay, 1) : orderDay
}

/**
 * run 경계 이유 판정. edgeDay=run의 시작/끝 순서용 날짜, dir로 이웃 방향을 정한다.
 * 우선순위: range_edge > exception > observed(기록 있으나 미선택) > missing_gap(미기록).
 */
function classifyBoundary(source: EpisodeTimelineSource, edgeDay: ISODate, dir: 'start' | 'end', ctx: EpisodeSequenceContext): RunBoundary {
  const edgeLogDay = logDateFor(source, edgeDay)
  if (dir === 'end' && ctx.rangeEnd !== undefined && edgeLogDay >= ctx.rangeEnd) return 'range_edge'
  if (dir === 'start' && ctx.rangeStart !== undefined && edgeLogDay <= ctx.rangeStart) return 'range_edge'
  const neighborLogDay = logDateFor(source, addDaysISO(edgeDay, dir === 'end' ? 1 : -1))
  if (ctx.exceptionDates.has(neighborLogDay)) return 'exception'
  if (ctx.recordedDates.has(neighborLogDay)) return 'observed' // 기록은 있는데 그 key가 없음 = 관찰된 경계
  return 'missing_gap' // DailyLog 자체가 없음 = 확인 불가(회복으로 단정하지 않음)
}

/** 이 item이 예외일에 걸리는가. 수면은 nightOf(밤 D)와 recordedOn(아침 D+1) 모두 확인. */
function isExceptional(item: EpisodeTimelineItem, exceptionDates: ReadonlySet<ISODate>): boolean {
  if (item.source === 'sleep') {
    return exceptionDates.has(item.recordedOn ?? item.date) || exceptionDates.has(item.nightOf ?? item.date)
  }
  return exceptionDates.has(item.date)
}

/** [start, end] 구간에 예외일 또는 3일 이상 연속 미기록(하드 경계)이 있는가. */
function hasHardBoundary(start: ISODate, end: ISODate, ctx: EpisodeSequenceContext): boolean {
  if (diffDays(start, end) <= 0) return false
  let unrecorded = 0
  // 시작 다음 날부터 끝 전날까지(양 끝 run 날짜 자체는 제외)만 검사한다.
  for (let d = addDaysISO(start, 1); d < end; d = addDaysISO(d, 1)) {
    if (ctx.exceptionDates.has(d)) return true
    if (ctx.recordedDates.has(d)) {
      unrecorded = 0
    } else {
      unrecorded += 1
      if (unrecorded >= UNRECORDED_BLOCK_GAP) return true
    }
  }
  return false
}

/**
 * 같은 신호가 실제 연속된 날짜에 이어진 run들로 나눈다.
 * - 같은 (source, eventKey)만 하나의 run 후보. factorGroup이 같아도 key가 다르면 별도 run.
 * - 순서용 날짜(수면=nightOf)가 정확히 하루씩 이어질 때만 이어붙인다.
 * - 하루라도 비면(기록 존재하며 미선택이든, 미기록이든) run을 나눈다(미기록을 자동 연결하지 않음).
 * - 예외일에 걸린 item은 일반 흐름 run에서 제외한다.
 */
export function buildTimelineRuns(items: EpisodeTimelineItem[], ctx: EpisodeSequenceContext): TimelineRun[] {
  // (source, key) → 순서용 날짜 집합 + 메타.
  const groups = new Map<string, { key: string; source: EpisodeTimelineSource; factorGroup: string; dates: Set<ISODate> }>()
  for (const it of items) {
    if (isExceptional(it, ctx.exceptionDates)) continue
    const gk = `${it.source}|${it.eventKey}`
    let g = groups.get(gk)
    if (!g) {
      g = { key: it.eventKey, source: it.source, factorGroup: it.factorGroup, dates: new Set() }
      groups.set(gk, g)
    }
    g.dates.add(orderDate(it))
  }

  const runs: TimelineRun[] = []
  for (const g of groups.values()) {
    const sorted = [...g.dates].sort()
    let block: ISODate[] = []
    const flush = () => {
      if (block.length === 0) return
      const startDate = block[0]
      const endDate = block[block.length - 1]
      runs.push({
        key: g.key,
        source: g.source,
        factorGroup: g.factorGroup,
        startDate,
        endDate,
        validDays: block.length,
        calendarDays: diffDays(startDate, endDate) + 1,
        dates: [...block],
        startBoundary: classifyBoundary(g.source, startDate, 'start', ctx),
        endBoundary: classifyBoundary(g.source, endDate, 'end', ctx),
      })
      block = []
    }
    for (const d of sorted) {
      if (block.length > 0 && diffDays(block[block.length - 1], d) !== 1) flush()
      block.push(d)
    }
    flush()
  }
  // 시작일 → key 순으로 안정 정렬.
  return runs.sort((a, b) => (a.startDate === b.startDate ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.startDate < b.startDate ? -1 : 1))
}

/** 두 run이 실제로 겹친 날짜 수(순서용 날짜 교집합). */
function overlapCount(a: TimelineRun, b: TimelineRun): number {
  const setB = new Set(b.dates)
  let n = 0
  for (const d of a.dates) if (setB.has(d)) n += 1
  return n
}

/**
 * 먼저 시작한 run → 0~3일 뒤 시작한 다른 key run의 변화 순서.
 * - 같은 episode block 안(예외/긴 미기록 경계를 넘지 않음)만.
 * - 같은 from/to 조합이 여러 번이면 가장 가까운(lag 최소) 하나만 남긴다.
 * - 인과관계 필드/이름은 만들지 않는다.
 */
export function buildTimelineTransitions(runs: TimelineRun[], ctx: EpisodeSequenceContext): TimelineTransition[] {
  const best = new Map<string, TimelineTransition>()
  for (const a of runs) {
    for (const b of runs) {
      if (a === b || a.key === b.key) continue
      const lag = diffDays(a.startDate, b.startDate)
      if (lag < 0 || lag > MAX_TRANSITION_LAG) continue // a가 먼저(또는 동시) 시작 + 0~3일
      // 두 run을 감싸는 구간에 하드 경계(예외/3일+ 미기록)가 있으면 다른 블록으로 본다.
      const spanStart = a.startDate < b.startDate ? a.startDate : b.startDate
      const spanEnd = a.endDate > b.endDate ? a.endDate : b.endDate
      if (hasHardBoundary(spanStart, spanEnd, ctx)) continue
      const t: TimelineTransition = {
        fromKey: a.key,
        toKey: b.key,
        fromStartDate: a.startDate,
        toStartDate: b.startDate,
        lagDays: lag,
        overlapDays: overlapCount(a, b),
      }
      const dedupeKey = `${a.key}|${b.key}`
      const prev = best.get(dedupeKey)
      if (!prev || t.lagDays < prev.lagDays) best.set(dedupeKey, t)
    }
  }
  return [...best.values()].sort((x, y) =>
    x.fromStartDate === y.fromStartDate ? (x.toStartDate < y.toStartDate ? -1 : x.toStartDate > y.toStartDate ? 1 : 0) : x.fromStartDate < y.fromStartDate ? -1 : 1,
  )
}

/**
 * transition으로 연결된 대표 신호끼리, 선행(from)이 끝난 뒤 후속(to)이 실제 기록상 더 남은 여파.
 * 겹침(overlap)이 없어도, 후속이 선행 종료 직후 바로 이어지는 순차 여파도 포함한다.
 *
 * 판정:
 * - 후속(to)이 선행(from) 종료일보다 실제로 뒤까지 이어져야 한다(to.end > from.end).
 * - 실제 기록 연속성: 후속이 늦어도 "선행 종료 다음 날"부터 시작해야 한다
 *   (to.start ≤ from.end+1). 그보다 늦으면 사이에 미기록·미선택 공백이 있는 것이므로
 *   연속성을 추정하지 않고 제외한다.
 * - run은 미기록·미선택 하루에서 끊기고, 예외일 item을 애초에 제외하므로,
 *   위 조건이 성립하면 [from.end+1 .. to.end] 구간은 후속 run이 실제 기록으로 메운다
 *   (중간 미기록·rhythm exception이 끼면 run이 그 전에 끝나 조건이 깨진다).
 * - extraDays = 선행 종료 다음 날부터 후속 종료일까지의 실제 연속 일수(최소 1).
 * - 모든 종료일 조합을 만들지 않고, transition 대표쌍만 본다.
 * - 선행 run의 종료 이유가 불확실하면(observed가 아니면) 여파를 만들지 않는다:
 *   missing_gap(미기록)·range_edge(관찰 끝)·exception은 실제로 끝났다고 볼 수 없다.
 */
export function buildTimelineAftereffects(runs: TimelineRun[], transitions: TimelineTransition[]): TimelineAftereffect[] {
  const byKeyStart = new Map<string, TimelineRun>()
  for (const r of runs) byKeyStart.set(`${r.key}|${r.startDate}`, r)
  const out: TimelineAftereffect[] = []
  for (const t of transitions) {
    const from = byKeyStart.get(`${t.fromKey}|${t.fromStartDate}`)
    const to = byKeyStart.get(`${t.toKey}|${t.toStartDate}`)
    if (!from || !to) continue
    if (from.endBoundary !== 'observed') continue // 실제로 관찰된 종료만(미기록·범위끝·예외 제외).
    if (to.endDate <= from.endDate) continue // 후속이 선행 종료보다 뒤까지 이어져야 한다.
    if (to.startDate > addDaysISO(from.endDate, 1)) continue // 사이 공백을 연속으로 추정하지 않는다.
    const extraDays = diffDays(from.endDate, to.endDate)
    out.push({
      sourceKey: t.fromKey,
      remainingKey: t.toKey,
      sourceEndDate: from.endDate,
      remainingEndDate: to.endDate,
      extraDays,
    })
  }
  return out
}

/* =====================================================================
   의미상 중복 신호 관계표 (다음 episode 조립 단계 준비용)
   같은 하루의 마음 신호와 직접 상태는 사실상 같은 것을 다르게 적은 경우가 있다.
   ⚠️ 이번 단계에서는 helper·상수만 준비한다 — transition/aftereffect에서 제외하지 않는다.
   ===================================================================== */

/** 의미상 가까운(사실상 같은 것을 다르게 적은) 신호 쌍. 순서 무관. */
export const SEMANTIC_OVERLAP_PAIRS: readonly (readonly [string, string])[] = [
  ['mind_would_not_rest', 'state_mind_busy'],
  ['too_many_thoughts', 'state_mind_busy'],
  ['hard_to_start', 'state_daily_tasks_hard'],
  ['avoided_tasks', 'state_daily_tasks_hard'],
  ['no_desire', 'state_daily_tasks_hard'],
  ['sensory_overload', 'state_people_hard'],
  ['need_time_alone', 'state_people_hard'],
]

const SEMANTIC_OVERLAP_SET: ReadonlySet<string> = new Set(SEMANTIC_OVERLAP_PAIRS.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)))

/** 두 신호 key가 의미상 중복(사실상 같은 것)인지. 순서 무관. 같은 key는 false(자기 자신). */
export function areSemanticallyOverlappingSignals(keyA: string, keyB: string): boolean {
  if (keyA === keyB) return false
  return SEMANTIC_OVERLAP_SET.has(keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`)
}
