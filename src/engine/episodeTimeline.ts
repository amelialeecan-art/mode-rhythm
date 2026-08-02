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
import { addDaysISO } from './correlation'

/** 타임라인 항목의 출처. */
export type EpisodeTimelineSource = 'event' | 'mind' | 'sleep'

/** 날짜 기준으로 합쳐진 하나의 타임라인 항목. 분석 계층이 소비할 canonical 입력. */
export interface EpisodeTimelineItem {
  /** 귀속 날짜(사건은 발생 추정일, 마음·수면은 기록 날짜). */
  date: ISODate
  source: EpisodeTimelineSource
  /** 항목 식별 키(사건/수면은 eventCode, 마음은 mindSignal code). */
  eventKey: string
  /** 이후 분석 연결용 factorGroup(마음은 아직 매핑 없음 → 코드 그대로). */
  factorGroup: string
}

/** buildEpisodeTimeline 입력. 셋 다 optional — 없으면 그 출처는 건너뛴다. */
export interface EpisodeTimelineInput {
  /** 기존 "오늘 있었던 일" 사건 로그. */
  eventLogs?: EventLog[]
  /** 마음 신호·지난밤 수면을 담은 일일 로그(비인덱스 optional 필드에서 읽는다). */
  dailyLogs?: DailyLog[]
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
      items.push({ date: log.date, source: 'sleep', eventKey: code, factorGroup: group })
    }
  }

  // 3) 마음 신호 — 아직 factorGroup 매핑이 없어 코드를 그대로 factorGroup으로 둔다.
  for (const log of input.dailyLogs ?? []) {
    for (const code of log.mindSignalCodes ?? []) {
      items.push({ date: log.date, source: 'mind', eventKey: code, factorGroup: code })
    }
  }

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
