import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { STATE_CHIPS } from '../../data/catalog/modes'
import { EVENT_CATALOG, EVENT_CATEGORY_LABEL, type EventCatalogItem } from '../../data/catalog/events'
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
import { getTodayISODate } from '../../lib/date'
import { setFormBusy } from '../../lib/pwaUpdate'
import type { EventCategory } from '../../data/types'
import type { EventTiming, FlowLevel } from '../../data/models'
import './log.css'

// 오늘 있었던 일을 카테고리별로 묶음 (사건/상황 기록 — 원인 추측 아님).
const EVENT_GROUPS = EVENT_CATALOG.reduce<Record<string, EventCatalogItem[]>>((acc, item) => {
  ;(acc[item.category] ??= []).push(item)
  return acc
}, {})
const EVENT_ORDER: EventCategory[] = ['sleep', 'food', 'work', 'relationship', 'control', 'appearance', 'digital', 'environment', 'movement', 'body', 'unknown']

// 전체/사건 강도 칩 (전체 강도에는 '없음' 제외).
const INTENSITY_CHIPS = INTENSITY_OPTIONS.filter((o) => o.code !== 'none') as { code: IntensityCode; label: string; value: number }[]

const TIMING_OPTIONS: { code: EventTiming; label: string }[] = [
  { code: 'today', label: '오늘' },
  { code: 'yesterday', label: '어제' },
  { code: 'recent3days', label: '최근 3일' },
  { code: 'recent7days', label: '최근 7일' },
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

  // 커스텀 사건 추가 폼
  const [showCustom, setShowCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<EventCategory>('sleep')
  const [customIntensity, setCustomIntensity] = useState<IntensityCode>('some')
  const [customTiming, setCustomTiming] = useState<EventTiming>('today')

  // 날짜 변경/진입 시 기존 기록 불러오기
  useEffect(() => {
    let cancelled = false
    void loadDailyEntry(date).then((loaded) => {
      if (cancelled) return
      const next = loaded ?? emptyDraft(date)
      setDraft(next)
      setSymptomsText(next.cycle.symptoms.join(', '))
      setHasSaved(loaded != null)
      setStatus('idle')
    })
    return () => {
      cancelled = true
    }
  }, [date])

  /* ---- draft 업데이트 헬퍼 ---- */
  const toggleInArray = (arr: string[], key: string) =>
    arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]

  const setAppetite = (key: keyof AppetiteRatings, value: number) =>
    setDraft((d) => ({
      ...d,
      appetiteRatings: { ...d.appetiteRatings, [key]: d.appetiteRatings[key] === value ? undefined : value },
    }))

  const toggleState = (code: string) => setDraft((d) => ({ ...d, stateCodes: toggleInArray(d.stateCodes, code) }))
  const toggleEvent = (code: string) => setDraft((d) => ({ ...d, catalogEventCodes: toggleInArray(d.catalogEventCodes, code) }))
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
    }
    setDraft((d) => ({ ...d, customEvents: [...d.customEvents, ev] }))
    setCustomName('')
    setShowCustom(false)
  }

  const removeCustomEvent = (code: string) =>
    setDraft((d) => ({ ...d, customEvents: d.customEvents.filter((e) => e.eventCode !== code) }))

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
    } catch (e) {
      console.error('[MODE] 저장 실패', e)
      setStatus('error')
    } finally {
      setFormBusy(false)
    }
  }

  const saveLabel =
    status === 'saving' ? '저장 중…' : status === 'success' ? '저장됐어요' : status === 'error' ? '저장 실패' : '기록 저장'

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

      {/* 2. 오늘 있었던 일 */}
      <GlassCard>
        <SectionHeader title="오늘 있었던 일" subtitle="원인 추측이 아니라 사건·상황 기록이에요" />

        <p className="event-group__label">언제 있었던 일이에요?</p>
        <ChipGroup label="사건 시점">
          {TIMING_OPTIONS.map((t) => (
            <Chip key={t.code} label={t.label} tone="coral" selected={draft.eventTiming === t.code} onToggle={() => setDraft((d) => ({ ...d, eventTiming: t.code }))} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>사건 강도</p>
        <ChipGroup label="사건 강도">
          {INTENSITY_CHIPS.map((o) => (
            <Chip key={o.code} label={o.label} tone="coral" selected={draft.eventIntensity === o.code} onToggle={() => setDraft((d) => ({ ...d, eventIntensity: o.code }))} />
          ))}
        </ChipGroup>

        {EVENT_ORDER.filter((c) => EVENT_GROUPS[c]).map((cat) => (
          <div className="event-group" key={cat}>
            <p className="event-group__label">{EVENT_CATEGORY_LABEL[cat]}</p>
            <ChipGroup label={EVENT_CATEGORY_LABEL[cat]}>
              {EVENT_GROUPS[cat].map((e) => (
                <Chip key={e.code} label={e.label} tone="coral" selected={draft.catalogEventCodes.includes(e.code)} onToggle={() => toggleEvent(e.code)} />
              ))}
            </ChipGroup>
          </div>
        ))}

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
