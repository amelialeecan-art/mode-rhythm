import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { STATE_CHIPS } from '../../data/catalog/modes'
import { EVENT_CATALOG, EVENT_CATEGORY_LABEL, type EventCatalogItem } from '../../data/catalog/events'
import {
  LAST_NIGHT_SLEEP_CODES,
  SLEEP_HOUR_BUCKETS,
  SLEEP_QUALITY_OPTIONS,
  SLEEP_ISSUE_CHIPS,
} from '../../data/catalog/lastNightSleep'
import {
  FUNCTION_LEVELS,
  FUNCTION_IMPACT_CHIPS,
  FUNCTION_ONSET_OPTIONS,
  isFunctionDetailLevel,
} from '../../data/catalog/dailyFunction'
import type { FunctionLevel } from '../../data/models'
import { RECOVERY_ACTIONS, RECOVERY_EFFECTS } from '../../data/catalog/recoveryActions'
import { INTENSITY_OPTIONS } from '../../data/catalog/intensity'
import { CUSTOM_EVENT_CATEGORIES, makeCustomEventCode, makeCustomFactorGroup } from '../../data/catalog/customEvent'
import {
  saveDailyEntry,
  loadDailyEntry,
  emptyDraft,
  type DailyEntryDraft,
  type EventDraft,
  type IntensityCode,
  type AppetiteRatings,
} from '../../data/services/dailyEntryService'
import { getTodayISODate, parseISODate, formatMonthDay } from '../../lib/date'
import { setFormBusy, setFormDirty } from '../../lib/pwaUpdate'
import { serializeForm } from './dirty'
import type { EventCategory } from '../../data/types'
import type { EventTiming, EventDuration, FlowLevel } from '../../data/models'
import './log.css'

// 오늘 있었던 일을 카테고리별로 묶음 (사건/상황 기록 — 원인 추측 아님).
const EVENT_GROUPS = EVENT_CATALOG.reduce<Record<string, EventCatalogItem[]>>((acc, item) => {
  ;(acc[item.category] ??= []).push(item)
  return acc
}, {})
const EVENT_ORDER: EventCategory[] = ['sleep', 'food', 'work', 'relationship', 'control', 'appearance', 'digital', 'environment', 'movement', 'body', 'unknown']

// 전체/사건 강도 칩 (전체 강도에는 '없음' 제외).
const INTENSITY_CHIPS = INTENSITY_OPTIONS.filter((o) => o.code !== 'none') as { code: IntensityCode; label: string; value: number }[]

// 정확한 발생일이 정해지는 시점만 남긴다(최근 3일·최근 7일은 lag·누적·흐름 분석에 쓰기 어려워 제외).
// 옛 기록에 남아 있는 recent3days/recent7days 값은 그대로 열람된다(타입/데이터 삭제 없음).
const TIMING_OPTIONS: { code: EventTiming; label: string }[] = [
  { code: 'today', label: '오늘' },
  { code: 'yesterday', label: '어제' },
  { code: 'exact', label: '날짜 선택' },
]

// 여러 날 이어진 사건의 지속기간(발생 시점과 별개).
const DURATION_OPTIONS: { code: EventDuration; label: string }[] = [
  { code: 'single', label: '하루' },
  { code: 'few', label: '2~3일' },
  { code: 'extended', label: '4일 이상' },
]

const FLOW_OPTIONS: { code: FlowLevel; label: string }[] = [
  { code: 'none', label: '없음' },
  { code: 'light', label: '적음' },
  { code: 'normal', label: '보통' },
  { code: 'heavy', label: '많음' },
]

const PAIN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '없음' },
  { value: 3, label: '조금' },
  { value: 5, label: '보통' },
  { value: 7, label: '많이' },
  { value: 9, label: '매우 많이' },
]

// 식욕 상태 5항목 + 강도 옵션(0/3/5/7/9). "먹고 싶음"만 — 실제로 먹은 건 사건 카드로.
const APPETITE_ITEMS: { key: keyof AppetiteRatings; label: string }[] = [
  { key: 'appetite', label: '식욕' },
  { key: 'sweetCraving', label: '단 음식 욕구' },
  { key: 'saltyCraving', label: '짠 음식 욕구' },
  { key: 'greasyCraving', label: '기름진 음식 욕구' },
  { key: 'bingeUrge', label: '폭식욕' },
]

// 회복 그룹에서 실제 행동만 (sentinel은 positive 그룹에서만 노출)
const RECOVERY_REAL_ACTIONS = RECOVERY_ACTIONS.filter((a) => a.code !== 'not_yet' && a.code !== 'none')
const RECOVERY_SENTINELS = RECOVERY_ACTIONS.filter((a) => a.code === 'not_yet' || a.code === 'none')
const APPETITE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '없음' },
  { value: 3, label: '조금' },
  { value: 5, label: '보통' },
  { value: 7, label: '많이' },
  { value: 9, label: '매우 많이' },
]

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function LogScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 캘린더의 "이 날짜 기록하기"에서 넘어오면 해당 날짜로 시작 (없으면 오늘)
  const initialDate = (() => {
    const q = searchParams.get('date')
    return q && ISO_RE.test(q) ? q : getTodayISODate()
  })()
  const [date, setDate] = useState<string>(initialDate)
  const [draft, setDraft] = useState<DailyEntryDraft>(() => emptyDraft(initialDate))
  const [symptomsText, setSymptomsText] = useState('')
  const [hasSaved, setHasSaved] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  // 마지막으로 불러오거나 저장한 시점의 폼 스냅샷 — 이 값과 다르면 "저장하지 않은 입력"으로 본다.
  const baselineRef = useRef<string>(serializeForm(draft, symptomsText))

  // 커스텀 사건 추가 폼
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<EventCategory>('sleep')
  const [customIntensity, setCustomIntensity] = useState<IntensityCode>('some')
  const [customTiming, setCustomTiming] = useState<EventTiming>('today')
  const [customOccurredOn, setCustomOccurredOn] = useState('')
  const [customDuration, setCustomDuration] = useState<EventDuration | undefined>(undefined)
  // 기능 저하 직접 추가 입력
  const [impactCustomText, setImpactCustomText] = useState('')

  // 날짜 변경/진입 시 기존 기록 불러오기
  useEffect(() => {
    let cancelled = false
    void loadDailyEntry(date).then((loaded) => {
      if (cancelled) return
      const next = loaded ?? emptyDraft(date)
      const nextSymptoms = next.cycle.symptoms.join(', ')
      setDraft(next)
      setSymptomsText(nextSymptoms)
      setHasSaved(loaded != null)
      setStatus('idle')
      // 불러온 값이 새 baseline — 단순히 탭에 들어오거나 기존 기록을 여는 것은 dirty가 아니다.
      baselineRef.current = serializeForm(next, nextSymptoms)
      setFormDirty(false)
    })
    return () => {
      cancelled = true
    }
  }, [date])

  // 저장하지 않은 입력 감지 — baseline과 현재 폼이 다르면 dirty. 실제 입력 변화가 있을 때만 true.
  useEffect(() => {
    setFormDirty(serializeForm(draft, symptomsText) !== baselineRef.current)
  }, [draft, symptomsText])

  // 화면을 벗어나면 미저장 플래그를 정리한다 (Log 탭 밖에서는 업데이트 보류 사유가 아님).
  useEffect(() => () => setFormDirty(false), [])

  /* ---- draft 업데이트 헬퍼 ---- */
  const toggleInArray = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]

  const setAppetite = (key: keyof AppetiteRatings, value: number) =>
    setDraft((d) => ({
      ...d,
      appetiteRatings: { ...d.appetiteRatings, [key]: d.appetiteRatings[key] === value ? undefined : value },
    }))

  const toggleState = (code: string) => setDraft((d) => ({ ...d, stateCodes: toggleInArray(d.stateCodes, code) }))
  // 사건을 해제하면 관련 선후관계도 남지 않게 정리한다(유령 데이터 방지).
  const toggleEvent = (code: string) =>
    setDraft((d) => {
      const next = toggleInArray(d.catalogEventCodes, code)
      const removed = !next.includes(code)
      return removed
        ? { ...d, catalogEventCodes: next, eventRelationBefore: d.eventRelationBefore.filter((c) => c !== code), eventRelationAfter: d.eventRelationAfter.filter((c) => c !== code) }
        : { ...d, catalogEventCodes: next }
    })

  /* ---- 오늘 일상 기능 헬퍼 ---- */
  const setFunctionLevel = (level: FunctionLevel) =>
    setDraft((d) => ({ ...d, functionLevel: d.functionLevel === level ? undefined : level }))
  const toggleFunctionImpact = (code: string) =>
    setDraft((d) => ({ ...d, functionImpactCodes: toggleInArray(d.functionImpactCodes, code) }))
  const setFunctionOnset = (code: string) =>
    setDraft((d) => ({ ...d, functionDropOnset: d.functionDropOnset === code ? undefined : code }))
  const addImpactCustom = () => {
    const name = impactCustomText.trim()
    if (!name) return
    setDraft((d) => (d.functionImpactCustom.includes(name) ? d : { ...d, functionImpactCustom: [...d.functionImpactCustom, name] }))
    setImpactCustomText('')
  }
  const removeImpactCustom = (name: string) =>
    setDraft((d) => ({ ...d, functionImpactCustom: d.functionImpactCustom.filter((c) => c !== name) }))
  const toggleRelationBefore = (code: string) =>
    setDraft((d) => ({ ...d, eventRelationBefore: toggleInArray(d.eventRelationBefore, code) }))
  const toggleRelationAfter = (code: string) =>
    setDraft((d) => ({ ...d, eventRelationAfter: toggleInArray(d.eventRelationAfter, code) }))

  /* ---- 지난밤 수면 헬퍼 ---- */
  const setSleepHours = (hours: number) =>
    setDraft((d) => ({ ...d, lastNightSleep: { ...d.lastNightSleep, hours: d.lastNightSleep.hours === hours ? undefined : hours } }))
  const setSleepQuality = (quality: number) =>
    setDraft((d) => ({ ...d, lastNightSleep: { ...d.lastNightSleep, quality: d.lastNightSleep.quality === quality ? undefined : quality } }))
  const toggleSleepIssue = (code: string) =>
    setDraft((d) => ({ ...d, lastNightSleep: { ...d.lastNightSleep, issues: toggleInArray(d.lastNightSleep.issues, code) } }))
  // 같은 칩은 도움/안 맞음 중 한쪽에만 — 한쪽 선택 시 반대쪽에서 제거
  const toggleRecovery = (code: string) =>
    setDraft((d) => ({
      ...d,
      recoveryCodes: toggleInArray(d.recoveryCodes, code),
      recoveryNegativeCodes: d.recoveryNegativeCodes.filter((c) => c !== code),
    }))
  const toggleRecoveryNegative = (code: string) =>
    setDraft((d) => ({
      ...d,
      recoveryNegativeCodes: toggleInArray(d.recoveryNegativeCodes, code),
      recoveryCodes: d.recoveryCodes.filter((c) => c !== code),
    }))

  const addCustomEvent = () => {
    const name = customName.trim()
    if (!name) return
    const ev: EventDraft = {
      eventCode: makeCustomEventCode(),
      eventLabel: name,
      category: customCategory,
      timing: customTiming,
      intensity: INTENSITY_OPTIONS.find((o) => o.code === customIntensity)?.value ?? 5,
      isCustom: true,
      customLabel: name,
      mappedFactorGroup: makeCustomFactorGroup(customCategory, name),
      occurredOn: customTiming === 'exact' ? customOccurredOn || date : undefined,
      durationDays: customDuration,
    }
    setDraft((d) => ({ ...d, customEvents: [...d.customEvents, ev] }))
    setCustomName('')
    setCustomTiming('today')
    setCustomOccurredOn('')
    setCustomDuration(undefined)
    setShowCustom(false)
  }

  const removeCustomEvent = (code: string) =>
    setDraft((d) => ({
      ...d,
      customEvents: d.customEvents.filter((e) => e.eventCode !== code),
      eventRelationBefore: d.eventRelationBefore.filter((c) => c !== code),
      eventRelationAfter: d.eventRelationAfter.filter((c) => c !== code),
    }))

  const onSave = async () => {
    setStatus('saving')
    setFormBusy(true) // 저장 중에는 PWA 업데이트(reload)를 보류
    const symptoms = symptomsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const toSave: DailyEntryDraft = { ...draft, date, cycle: { ...draft.cycle, symptoms } }
    try {
      await saveDailyEntry(toSave)
      setHasSaved(true)
      setStatus('success')
      // 저장 성공 → 현재 폼이 새 baseline, dirty 해제.
      baselineRef.current = serializeForm(draft, symptomsText)
      setFormDirty(false)
    } catch (e) {
      console.error('[MODE] 저장 실패', e)
      setStatus('error')
    } finally {
      setFormBusy(false)
    }
  }

  const saveLabel =
    status === 'saving' ? '저장 중…' : status === 'success' ? '저장됐어요' : status === 'error' ? '저장 실패' : '기록 저장'

  // 지난밤 수면은 "깨어난 날짜"(=date)에 귀속 → "전날 밤 → 오늘 아침"으로 표시.
  const wakeDate = parseISODate(date)
  const sleepSpan = `${formatMonthDay(new Date(wakeDate.getTime() - 86_400_000))} 밤 → ${formatMonthDay(wakeDate)} 아침`

  // 선후관계 대상 = today 사건만 (지난밤 수면 코드는 이미 제외됨). yesterday/recent는 제외.
  const showFunctionDetail = isFunctionDetailLevel(draft.functionLevel)
  const relationEvents: { code: string; label: string }[] = [
    ...(draft.eventTiming === 'today'
      ? draft.catalogEventCodes
          .filter((c) => !LAST_NIGHT_SLEEP_CODES.has(c))
          .map((c) => EVENT_CATALOG.find((e) => e.code === c))
          .filter((e): e is EventCatalogItem => e != null)
          .map((e) => ({ code: e.code, label: e.label }))
      : []),
    ...draft.customEvents.filter((c) => c.timing === 'today').map((c) => ({ code: c.eventCode, label: c.eventLabel })),
  ]

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">빠른 기록</h1>
        <p className="screen-head__sub">원인은 추측하지 않아요. 오늘 있었던 일만 가볍게 남겨요</p>
      </header>

      {/* 날짜 선택 */}
      <GlassCard>
        <div className="log-daterow">
          <div>
            <SectionHeader title="날짜" />
            {hasSaved && <span className="log-saved-badge">이 날짜에 저장된 기록이 있어요</span>}
          </div>
          <input
            className="log-date-input"
            type="date"
            value={date}
            max={getTodayISODate()}
            onChange={(e) => setDate(e.target.value || getTodayISODate())}
          />
        </div>
      </GlassCard>

      {/* 1. 오늘 상태 (다중 선택) + 전체 강도 */}
      <GlassCard>
        <SectionHeader title="오늘 나 어떤 상태?" subtitle="여러 개 골라도 돼요" />
        <ChipGroup label="오늘 상태">
          {STATE_CHIPS.map((s) => (
            <Chip key={s.code} label={s.label} tone="lav" selected={draft.stateCodes.includes(s.code)} onToggle={() => toggleState(s.code)} />
          ))}
        </ChipGroup>
        <p className="state-hint">안정을 다른 감정과 함께 고르면, 힘든 감정 사이에 안정된 순간도 있었다는 뜻이에요.</p>
        <p className="event-group__label" style={{ marginTop: 16 }}>오늘 전체 강도</p>
        <ChipGroup label="전체 강도">
          {INTENSITY_CHIPS.map((o) => (
            <Chip
              key={o.code}
              label={o.label}
              tone="lav"
              selected={draft.overallIntensity === o.code}
              onToggle={() => setDraft((d) => ({ ...d, overallIntensity: o.code }))}
            />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 1-2. 식욕 상태 (직접 입력 — state preset보다 우선) */}
      <GlassCard tint="coral">
        <SectionHeader title="식욕 상태" subtitle="식욕, 단 음식 욕구, 폭식욕을 따로 남겨요" />
        {APPETITE_ITEMS.map((item) => (
          <div className="event-group" key={item.key}>
            <p className="event-group__label">{item.label}</p>
            <ChipGroup label={item.label}>
              {APPETITE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  tone="coral"
                  selected={draft.appetiteRatings[item.key] === o.value}
                  onToggle={() => setAppetite(item.key, o.value)}
                />
              ))}
            </ChipGroup>
          </div>
        ))}
      </GlassCard>

      {/* 1-3. 지난밤 수면 (깨어난 날짜에 귀속 — 일반 사건과 분리) */}
      <GlassCard tint="sky">
        <SectionHeader title="지난밤 수면" subtitle={sleepSpan} />
        <p className="event-group__label">몇 시간 잤어요?</p>
        <ChipGroup label="수면시간">
          {SLEEP_HOUR_BUCKETS.map((b) => (
            <Chip key={b.code} label={b.label} tone="sky" selected={draft.lastNightSleep.hours === b.hours} onToggle={() => setSleepHours(b.hours)} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>잘 잤어요?</p>
        <ChipGroup label="수면 만족도">
          {SLEEP_QUALITY_OPTIONS.map((q) => (
            <Chip key={q.value} label={q.label} tone="sky" selected={draft.lastNightSleep.quality === q.value} onToggle={() => setSleepQuality(q.value)} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>지난밤에 이런 일이 있었어요?</p>
        <ChipGroup label="지난밤 수면 이슈">
          {SLEEP_ISSUE_CHIPS.map((s) => (
            <Chip key={s.code} label={s.label} tone="sky" selected={draft.lastNightSleep.issues.includes(s.code)} onToggle={() => toggleSleepIssue(s.code)} />
          ))}
        </ChipGroup>
        <p className="state-hint">낮잠은 여기가 아니라 아래 "오늘 있었던 일"에 남겨요.</p>
      </GlassCard>

      {/* 2. 오늘 있었던 일 */}
      <GlassCard>
        <SectionHeader title="오늘 있었던 일" subtitle="원인 추측이 아니라 사건·상황 기록이에요" />

        <p className="event-group__label">언제 있었던 일이에요?</p>
        <ChipGroup label="사건 시점">
          {TIMING_OPTIONS.map((t) => (
            <Chip key={t.code} label={t.label} tone="coral" selected={draft.eventTiming === t.code} onToggle={() => setDraft((d) => ({ ...d, eventTiming: t.code }))} />
          ))}
        </ChipGroup>
        {draft.eventTiming === 'exact' && (
          <input
            className="log-date-input"
            style={{ marginTop: 10 }}
            type="date"
            aria-label="사건 발생일"
            value={draft.eventOccurredOn ?? date}
            max={getTodayISODate()}
            onChange={(e) => setDraft((d) => ({ ...d, eventOccurredOn: e.target.value || undefined }))}
          />
        )}
        <p className="event-group__label" style={{ marginTop: 14 }}>며칠 이어졌어요? (선택)</p>
        <ChipGroup label="사건 지속기간">
          {DURATION_OPTIONS.map((o) => (
            <Chip
              key={o.code}
              label={o.label}
              tone="coral"
              selected={draft.eventDuration === o.code}
              onToggle={() => setDraft((d) => ({ ...d, eventDuration: d.eventDuration === o.code ? undefined : o.code }))}
            />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>사건 강도</p>
        <ChipGroup label="사건 강도">
          {INTENSITY_CHIPS.map((o) => (
            <Chip key={o.code} label={o.label} tone="coral" selected={draft.eventIntensity === o.code} onToggle={() => setDraft((d) => ({ ...d, eventIntensity: o.code }))} />
          ))}
        </ChipGroup>

        {EVENT_ORDER.filter((c) => EVENT_GROUPS[c]).map((cat) => {
          // 지난밤 수면 코드는 별도 카드에서 입력 → 일반 사건 섹션에서 감춘다. (낮잠 등은 유지)
          const items = EVENT_GROUPS[cat].filter((e) => !LAST_NIGHT_SLEEP_CODES.has(e.code))
          if (items.length === 0) return null
          return (
            <div className="event-group" key={cat}>
              <p className="event-group__label">{EVENT_CATEGORY_LABEL[cat]}</p>
              <ChipGroup label={EVENT_CATEGORY_LABEL[cat]}>
                {items.map((e) => (
                  <Chip key={e.code} label={e.label} tone="coral" selected={draft.catalogEventCodes.includes(e.code)} onToggle={() => toggleEvent(e.code)} />
                ))}
              </ChipGroup>
            </div>
          )
        })}

        {/* 커스텀 사건 */}
        {draft.customEvents.length > 0 && (
          <div className="event-group">
            <p className="event-group__label">직접 추가한 일</p>
            <div className="custom-list">
              {draft.customEvents.map((e) => (
                <span className="custom-chip" key={e.eventCode}>
                  {e.eventLabel}
                  <button className="custom-chip__x" aria-label="삭제" onClick={() => removeCustomEvent(e.eventCode)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {!showCustom ? (
          <button className="custom-add-btn" onClick={() => setShowCustom(true)}>
            ＋ 오늘 있었던 일 추가
          </button>
        ) : (
          <div className="custom-form">
            <input className="custom-input" placeholder="이름 (예: 체중계 올라감)" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <p className="event-group__label">카테고리</p>
            <ChipGroup label="카테고리">
              {CUSTOM_EVENT_CATEGORIES.map((c) => (
                <Chip key={c.code} label={c.label} tone="coral" selected={customCategory === c.code} onToggle={() => setCustomCategory(c.code)} />
              ))}
            </ChipGroup>
            <p className="event-group__label" style={{ marginTop: 12 }}>강도</p>
            <ChipGroup label="강도">
              {INTENSITY_CHIPS.map((o) => (
                <Chip key={o.code} label={o.label} tone="coral" selected={customIntensity === o.code} onToggle={() => setCustomIntensity(o.code)} />
              ))}
            </ChipGroup>
            <p className="event-group__label" style={{ marginTop: 12 }}>시점</p>
            <ChipGroup label="시점">
              {TIMING_OPTIONS.map((t) => (
                <Chip key={t.code} label={t.label} tone="coral" selected={customTiming === t.code} onToggle={() => setCustomTiming(t.code)} />
              ))}
            </ChipGroup>
            {customTiming === 'exact' && (
              <input
                className="log-date-input"
                style={{ marginTop: 10 }}
                type="date"
                aria-label="사건 발생일"
                value={customOccurredOn || date}
                max={getTodayISODate()}
                onChange={(e) => setCustomOccurredOn(e.target.value)}
              />
            )}
            <p className="event-group__label" style={{ marginTop: 12 }}>며칠 이어졌어요? (선택)</p>
            <ChipGroup label="지속기간">
              {DURATION_OPTIONS.map((o) => (
                <Chip
                  key={o.code}
                  label={o.label}
                  tone="coral"
                  selected={customDuration === o.code}
                  onToggle={() => setCustomDuration((prev) => (prev === o.code ? undefined : o.code))}
                />
              ))}
            </ChipGroup>
            <div className="custom-form__actions">
              <button className="custom-add-btn" onClick={addCustomEvent} disabled={!customName.trim()}>
                추가하기
              </button>
              <button className="custom-cancel-btn" onClick={() => setShowCustom(false)}>
                취소
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* 2-2. 오늘 일상 기능 (평소엔 질문 1개, 무너짐일 때만 세부) */}
      <GlassCard>
        <SectionHeader title="오늘 일상 기능" subtitle="오늘 해야 할 일을 얼마나 할 수 있었어요?" />
        <ChipGroup label="오늘 일상 기능">
          {FUNCTION_LEVELS.map((f) => (
            <Chip key={f.level} label={f.label} tone="lav" selected={draft.functionLevel === f.level} onToggle={() => setFunctionLevel(f.level)} />
          ))}
        </ChipGroup>

        {showFunctionDetail && (
          <>
            <p className="event-group__label" style={{ marginTop: 16 }}>무엇을 못 했어요? (여러 개 가능)</p>
            <ChipGroup label="기능 저하 항목">
              {FUNCTION_IMPACT_CHIPS.map((o) => (
                <Chip key={o.code} label={o.label} tone="lav" selected={draft.functionImpactCodes.includes(o.code)} onToggle={() => toggleFunctionImpact(o.code)} />
              ))}
            </ChipGroup>
            {draft.functionImpactCustom.length > 0 && (
              <div className="custom-list" style={{ marginTop: 10 }}>
                {draft.functionImpactCustom.map((name) => (
                  <span className="custom-chip" key={name}>
                    {name}
                    <button className="custom-chip__x" aria-label="삭제" onClick={() => removeImpactCustom(name)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="custom-form__actions" style={{ marginTop: 10 }}>
              <input className="custom-input" placeholder="직접 추가 (예: 전화 못 받음)" value={impactCustomText} onChange={(e) => setImpactCustomText(e.target.value)} />
              <button className="custom-add-btn" onClick={addImpactCustom} disabled={!impactCustomText.trim()}>추가</button>
            </div>

            <p className="event-group__label" style={{ marginTop: 16 }}>언제부터 무너졌어요?</p>
            <ChipGroup label="무너짐 시작 시점">
              {FUNCTION_ONSET_OPTIONS.map((o) => (
                <Chip key={o.code} label={o.label} tone="lav" selected={draft.functionDropOnset === o.code} onToggle={() => setFunctionOnset(o.code)} />
              ))}
            </ChipGroup>

            {relationEvents.length > 0 && (
              <>
                <p className="event-group__label" style={{ marginTop: 18 }}>오늘 사건은 언제 있었어요?</p>
                <p className="state-hint" style={{ marginTop: 4 }}>선택은 참고용이에요. 표시 안 하면 "모름"으로 둬요.</p>
                <p className="event-group__label" style={{ marginTop: 12 }}>상태가 나빠지기 전부터 있었던 것</p>
                <ChipGroup label="나빠지기 전부터">
                  {relationEvents.map((e) => (
                    <Chip key={`b-${e.code}`} label={e.label} tone="mint" selected={draft.eventRelationBefore.includes(e.code)} onToggle={() => toggleRelationBefore(e.code)} />
                  ))}
                </ChipGroup>
                <p className="event-group__label" style={{ marginTop: 12 }}>나빠진 뒤 나타난 것</p>
                <ChipGroup label="나빠진 뒤">
                  {relationEvents.map((e) => (
                    <Chip key={`a-${e.code}`} label={e.label} tone="coral" selected={draft.eventRelationAfter.includes(e.code)} onToggle={() => toggleRelationAfter(e.code)} />
                  ))}
                </ChipGroup>
              </>
            )}
          </>
        )}
        <p className="state-hint">일상 기능은 의료 진단이 아니라, 오늘 하루가 어땠는지 스스로 남기는 기록이에요.</p>
      </GlassCard>

      {/* 3. 생리 기록 — 별도 섹션. 원인 칩 아님. */}
      <GlassCard tint="lav">
        <SectionHeader title="생리 기록" subtitle="생리·주기는 원인이 아니라 사실 기록이에요. 패턴은 앱이 계산해요" />
        <ChipGroup label="생리 상태">
          <Chip label="생리 시작" tone="rose" selected={draft.cycle.periodStart} onToggle={() => setDraft((d) => ({ ...d, cycle: { ...d.cycle, periodStart: !d.cycle.periodStart } }))} />
          <Chip label="생리 종료" tone="rose" selected={draft.cycle.periodEnd} onToggle={() => setDraft((d) => ({ ...d, cycle: { ...d.cycle, periodEnd: !d.cycle.periodEnd } }))} />
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>출혈량</p>
        <ChipGroup label="출혈량">
          {FLOW_OPTIONS.map((f) => (
            <Chip key={f.code} label={f.label} tone="rose" selected={draft.cycle.flowLevel === f.code} onToggle={() => setDraft((d) => ({ ...d, cycle: { ...d.cycle, flowLevel: d.cycle.flowLevel === f.code ? undefined : f.code } }))} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>생리통</p>
        <ChipGroup label="생리통">
          {PAIN_OPTIONS.map((p) => (
            <Chip key={p.value} label={p.label} tone="rose" selected={draft.cycle.periodPain === p.value} onToggle={() => setDraft((d) => ({ ...d, cycle: { ...d.cycle, periodPain: d.cycle.periodPain === p.value ? undefined : p.value } }))} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>특이 증상 (선택)</p>
        <input className="custom-input" placeholder="쉼표로 구분 (예: 허리 묵직함, 두통)" value={symptomsText} onChange={(e) => setSymptomsText(e.target.value)} />
      </GlassCard>

      {/* 4. 회복 행동 — 도움/안 맞음 두 그룹 (같은 칩이 날마다 다른 쪽에 갈 수 있음) */}
      <GlassCard tint="mint">
        <SectionHeader title="뭐 했더니 좀 나아졌어?" subtitle="도움 된 것과 오히려 안 맞았던 것을 나눠 남겨요" />
        <p className="event-group__label">도움 된 것</p>
        <ChipGroup label="도움 된 회복 행동">
          {RECOVERY_REAL_ACTIONS.map((a) => (
            <Chip key={a.code} label={a.label} tone="mint" selected={draft.recoveryCodes.includes(a.code)} onToggle={() => toggleRecovery(a.code)} />
          ))}
          {RECOVERY_SENTINELS.map((a) => (
            <Chip key={a.code} label={a.label} tone="neutral" selected={draft.recoveryCodes.includes(a.code)} onToggle={() => toggleRecovery(a.code)} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 16 }}>그래서 좀 어땠어?</p>
        <ChipGroup label="효과">
          {RECOVERY_EFFECTS.map((e) => (
            <Chip key={e.code} label={e.label} tone="mint" selected={draft.recoveryEffect === e.code} onToggle={() => setDraft((d) => ({ ...d, recoveryEffect: d.recoveryEffect === e.code ? '' : e.code }))} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 18 }}>오히려 안 맞았던 것</p>
        <ChipGroup label="안 맞았던 행동">
          {RECOVERY_REAL_ACTIONS.map((a) => (
            <Chip key={a.code} label={a.label} tone="coral" selected={draft.recoveryNegativeCodes.includes(a.code)} onToggle={() => toggleRecoveryNegative(a.code)} />
          ))}
        </ChipGroup>
        <p className="recovery-note">같은 행동도 날에 따라 다르게 작동할 수 있어요. 판단이 아니라 기록이에요.</p>
      </GlassCard>

      {/* 5. 메모 */}
      <GlassCard>
        <SectionHeader title="메모" subtitle="남기고 싶은 한 줄 (선택)" />
        <textarea className="memo" placeholder="오늘 떠오르는 걸 자유롭게…" value={draft.memo} onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))} rows={3} />
      </GlassCard>

      <button className="btn-primary log__done" onClick={onSave} disabled={status === 'saving'}>
        {saveLabel}
      </button>

      {status === 'success' && (
        <div className="log-feedback log-feedback--ok">
          저장됐어요. 오늘 화면에서 모드를 확인할 수 있어요.
          <button className="log-gohome" onClick={() => navigate('/')}>
            오늘 화면 보기
          </button>
        </div>
      )}
      {status === 'error' && <p className="log-feedback log-feedback--err">저장에 실패했어요. 잠시 후 다시 시도해 주세요.</p>}
    </>
  )
}
