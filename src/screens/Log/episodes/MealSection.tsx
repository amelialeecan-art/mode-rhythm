import { useEffect, useRef, useState } from 'react'
import { GlassCard, SectionHeader, RatingScale, Chip, ChipGroup } from '../../../design'
import { mealEpisodeRepository } from '../../../data/repositories'
import type { MealAmount, MealEpisode, RatingValue, TriBoolean } from '../../../data/modelsV2'
import { computeMealIntervals, formatSleepDuration } from '../../../engine'
import { toISODate } from '../../../lib/date'
import { setFormBusy } from '../../../lib/pwaUpdate'
import { reportDirty, clearDirty, registerSaver, unregisterSaver, SAVE_ORDER } from '../checkIn/dirtyRegistry'
import { TriChoice } from './TriChoice'
import { toDatetimeLocalValue, fromDatetimeLocalValue, nowDatetimeLocalValue, formatClock } from './time'

interface MealSectionProps {
  localDate: string
  reloadToken: number
  onSaved: () => void
}

/* ---------- 표시 헬퍼 (순수) ---------- */
function ratingText(v: RatingValue | undefined): string {
  if (v === undefined || v === null) return '—'
  if (v === 'unknown') return '모름'
  return String(v)
}
function triText(v: TriBoolean | undefined): string {
  if (v === undefined || v === null) return '—'
  if (v === 'unknown') return '모름'
  return v ? 'O' : 'X'
}
const AMOUNT_LABEL: Record<Exclude<MealAmount, null | undefined>, string> = {
  small: '적음',
  normal: '보통',
  large: '많음',
  unknown: '모름',
}
function amountText(a: MealAmount | undefined): string {
  if (a === undefined || a === null) return '—'
  return AMOUNT_LABEL[a]
}
/** 식사 후 필드가 하나라도 채워졌는지. */
function hasPost(m: MealEpisode): boolean {
  return [m.amount, m.proteinIncluded, m.sweetsIncluded, m.ultraProcessedIncluded, m.perceivedOvereating, m.endedAt, m.alcoholAmount].some(
    (v) => v !== undefined && v !== null,
  )
}

/* =====================================================================
   빠른 식사/간식 기록 (10초): 시작 시각 + 직전 3축
   ===================================================================== */
// localDate는 startedAt의 실제 로컬 날짜에서 도출하므로 prop으로 받지 않는다.
function MealQuickAdd({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [startedAt, setStartedAt] = useState<string>(nowDatetimeLocalValue())
  const [hunger, setHunger] = useState<RatingValue>(null)
  const [craving, setCraving] = useState<RatingValue>(null)
  const [binge, setBinge] = useState<RatingValue>(null)
  const [saving, setSaving] = useState(false)
  const DIRTY_KEY = 'meal-quick'

  const reset = () => {
    setStartedAt(nowDatetimeLocalValue())
    setHunger(null)
    setCraving(null)
    setBinge(null)
    reportDirty(DIRTY_KEY, false)
  }

  useEffect(() => {
    if (!open) return
    const dirty = hunger !== null || craving !== null || binge !== null
    reportDirty(DIRTY_KEY, dirty)
  }, [open, hunger, craving, binge])
  useEffect(() => () => clearDirty(DIRTY_KEY), [])

  const onSave = async (): Promise<boolean> => {
    const startIso = fromDatetimeLocalValue(startedAt)
    if (!startIso) return false
    setSaving(true)
    setFormBusy(true)
    try {
      await mealEpisodeRepository.add({
        localDate: toISODate(new Date(startIso)),
        startedAt: startIso,
        // 미선택은 null(미측정) — 0으로 채우지 않는다.
        prePhysicalHunger: hunger,
        preCraving: craving,
        preBingeUrge: binge,
        source: 'manual',
        schemaVersion: 1,
      })
      reset()
      setOpen(false)
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 식사 저장 실패', e)
      return false
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  const saveRef = useRef(onSave)
  saveRef.current = onSave
  useEffect(() => {
    registerSaver(DIRTY_KEY, () => saveRef.current(), '식사 기록', SAVE_ORDER.meal)
    return () => unregisterSaver(DIRTY_KEY)
  }, [])

  if (!open) {
    return (
      <button className="meal-add-btn" onClick={() => { setStartedAt(nowDatetimeLocalValue()); setOpen(true) }}>
        ＋ 식사/간식 기록
      </button>
    )
  }

  return (
    <GlassCard tint="coral">
      <SectionHeader title="식사/간식 기록" subtitle="먹기 직전 상태를 빠르게 남겨요" />
      <label className="dt-field">
        시작 시각
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setStartedAt(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>
      <RatingScale label="신체적 배고픔" lowLabel="없음" highLabel="매우 강함" tone="coral" value={hunger} onChange={setHunger} />
      <RatingScale label="음식 craving" lowLabel="없음" highLabel="매우 강함" tone="coral" value={craving} onChange={setCraving} />
      <RatingScale label="폭식 충동" lowLabel="없음" highLabel="매우 강함" tone="coral" value={binge} onChange={setBinge} />
      <p className="state-hint">먹은 뒤 양·음식 종류는 타임라인에서 이 기록을 열어 추가해.</p>
      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave} disabled={saving}>{saving ? '저장 중…' : '식사 기록 저장'}</button>
        <button className="custom-cancel-btn" onClick={() => { reset(); setOpen(false) }}>취소</button>
      </div>
    </GlassCard>
  )
}

/* =====================================================================
   식사 후 필드 편집기 (같은 episode를 열어 추가)
   ===================================================================== */
function MealPostEditor({ meal, onSaved }: { meal: MealEpisode; onSaved: () => void }) {
  const [ended, setEnded] = useState<string>(toDatetimeLocalValue(meal.endedAt))
  const [amount, setAmount] = useState<MealAmount>(meal.amount ?? null)
  const [protein, setProtein] = useState<TriBoolean>(meal.proteinIncluded ?? null)
  const [sweets, setSweets] = useState<TriBoolean>(meal.sweetsIncluded ?? null)
  const [ultra, setUltra] = useState<TriBoolean>(meal.ultraProcessedIncluded ?? null)
  const [overeat, setOvereat] = useState<TriBoolean>(meal.perceivedOvereating ?? null)
  const [alcohol, setAlcohol] = useState<string>(meal.alcoholAmount == null ? '' : String(meal.alcoholAmount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const DIRTY_KEY = `meal-post-${meal.id}`

  const baselineRef = useRef<string>('')
  const snapshot = () => JSON.stringify({ ended, amount, protein, sweets, ultra, overeat, alcohol })
  useEffect(() => {
    baselineRef.current = snapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    reportDirty(DIRTY_KEY, snapshot() !== baselineRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, amount, protein, sweets, ultra, overeat, alcohol])
  useEffect(() => () => clearDirty(DIRTY_KEY), [DIRTY_KEY])

  const pickAmount = (a: MealAmount) => setAmount((cur) => (cur === a ? null : a))

  const onSave = async (): Promise<boolean> => {
    setSaving(true)
    setError('')
    setFormBusy(true)
    try {
      await mealEpisodeRepository.patch(meal.id!, {
        endedAt: fromDatetimeLocalValue(ended),
        amount,
        proteinIncluded: protein,
        sweetsIncluded: sweets,
        ultraProcessedIncluded: ultra,
        perceivedOvereating: overeat,
        alcoholAmount: alcohol.trim() === '' ? null : Number(alcohol),
      })
      baselineRef.current = snapshot()
      reportDirty(DIRTY_KEY, false)
      onSaved()
      return true
    } catch (e) {
      console.error('[MODE] 식사 후 기록 실패', e)
      setError('시각 순서를 확인해 줘 (시작 → 종료).')
      return false
    } finally {
      setSaving(false)
      setFormBusy(false)
    }
  }

  const saveRef = useRef(onSave)
  saveRef.current = onSave
  useEffect(() => {
    registerSaver(DIRTY_KEY, () => saveRef.current(), '식사 후 기록', SAVE_ORDER.meal)
    return () => unregisterSaver(DIRTY_KEY)
  }, [DIRTY_KEY])

  return (
    <div className="meal-post">
      <label className="dt-field">
        종료 시각 (선택)
        <span className="dt-with-now">
          <input type="datetime-local" className="dt-input" value={ended} onChange={(e) => setEnded(e.target.value)} />
          <button type="button" className="dt-now" onClick={() => setEnded(nowDatetimeLocalValue())}>지금</button>
        </span>
      </label>

      <p className="event-group__label">양</p>
      <ChipGroup label="양">
        <Chip label="적음" tone="coral" selected={amount === 'small'} onToggle={() => pickAmount('small')} />
        <Chip label="보통" tone="coral" selected={amount === 'normal'} onToggle={() => pickAmount('normal')} />
        <Chip label="많음" tone="coral" selected={amount === 'large'} onToggle={() => pickAmount('large')} />
        <Chip label="모름" tone="neutral" selected={amount === 'unknown'} onToggle={() => pickAmount('unknown')} />
      </ChipGroup>

      <TriChoice label="단백질 포함" value={protein} onChange={setProtein} />
      <TriChoice label="단 음식/디저트" value={sweets} onChange={setSweets} />
      <TriChoice label="초가공식품" value={ultra} onChange={setUltra} />
      <TriChoice label="과식한 느낌" value={overeat} onChange={setOvereat} />

      <label className="dt-field">
        술 양 (선택)
        <input type="number" min={0} inputMode="decimal" className="dt-input dt-input--num" placeholder="미입력" value={alcohol} onChange={(e) => setAlcohol(e.target.value)} />
      </label>

      <p className="state-hint">미입력은 "아니오"가 아니야. 모르면 "모름"을 눌러요.</p>
      <button className="btn-primary" onClick={onSave} disabled={saving}>{saving ? '저장 중…' : '식사 후 기록 저장'}</button>
      {error && <p className="log-feedback log-feedback--err">{error}</p>}
    </div>
  )
}

/* =====================================================================
   식사 타임라인 카드 1개 (요약 + 식사 후 편집 토글)
   ===================================================================== */
function MealCard({ meal, sincePrev, onSaved }: { meal: MealEpisode; sincePrev: number | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const preLine = `배고픔 ${ratingText(meal.prePhysicalHunger)} · craving ${ratingText(meal.preCraving)} · 폭식충동 ${ratingText(meal.preBingeUrge)}`
  const postLine = hasPost(meal)
    ? `양 ${amountText(meal.amount)} · 단백질 ${triText(meal.proteinIncluded)} · 단 음식 ${triText(meal.sweetsIncluded)}`
    : null

  return (
    <div className="meal-card">
      <div className="meal-card__top">
        <span className="meal-card__time">{formatClock(meal.startedAt)}</span>
        {sincePrev !== null && <span className="meal-card__gap">직전 식사 +{formatSleepDuration(sincePrev)}</span>}
      </div>
      <div className="meal-card__line">
        <span className="meal-card__tag">식사 전</span>
        {preLine}
      </div>
      {postLine && (
        <div className="meal-card__line">
          <span className="meal-card__tag">식사 후</span>
          {postLine}
        </div>
      )}
      <button className="meal-card__edit" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
        {editing ? '식사 후 기록 접기 ▲' : hasPost(meal) ? '식사 후 기록 수정 ▼' : '식사 후 기록 추가 ▼'}
      </button>
      {editing && <MealPostEditor meal={meal} onSaved={onSaved} />}
    </div>
  )
}

/* =====================================================================
   섹션: 빠른 추가 + 오늘 식사 타임라인
   ===================================================================== */
export function MealSection({ localDate, reloadToken, onSaved }: MealSectionProps) {
  const [meals, setMeals] = useState<MealEpisode[]>([])

  useEffect(() => {
    let cancelled = false
    void mealEpisodeRepository.listByDate(localDate).then((list) => {
      if (!cancelled) setMeals(list)
    })
    return () => {
      cancelled = true
    }
  }, [localDate, reloadToken])

  const intervals = computeMealIntervals(meals) // meals는 startedAt 오름차순

  return (
    <>
      <MealQuickAdd onSaved={onSaved} />

      <GlassCard>
        <SectionHeader title="오늘 식사 타임라인" subtitle="먹기 직전 상태와 먹은 뒤 기록" />
        {meals.length === 0 ? (
          <p className="state-hint" style={{ marginTop: 10 }}>아직 식사 기록이 없어.</p>
        ) : (
          <div className="meal-list">
            {meals.map((m, i) => (
              <MealCard key={m.id} meal={m} sincePrev={intervals[i]} onSaved={onSaved} />
            ))}
          </div>
        )}
      </GlassCard>
    </>
  )
}
