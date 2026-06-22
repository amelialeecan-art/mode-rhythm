import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import { STATE_CHIPS } from '../../data/catalog/modes'
import { EVENT_CATALOG, EVENT_CATEGORY_LABEL, type EventCatalogItem } from '../../data/catalog/events'
import { RECOVERY_ACTIONS, RECOVERY_EFFECTS } from '../../data/catalog/recoveryActions'
import type { EventCategory } from '../../data/types'
import './log.css'

// 오늘 있었던 일을 카테고리별로 묶음 (사건/상황 기록 — 원인 추측 아님).
const EVENT_GROUPS = EVENT_CATALOG.reduce<Record<string, EventCatalogItem[]>>((acc, item) => {
  ;(acc[item.category] ??= []).push(item)
  return acc
}, {})
const EVENT_ORDER: EventCategory[] = ['sleep', 'food', 'work', 'relationship', 'appearance', 'digital', 'environment', 'movement', 'body', 'unknown']

const FLOW_CHIPS = ['스포팅', '적음', '보통', '많음']
const PERIOD_PAIN_CHIPS = ['없음', '조금', '보통', '심함']

/** 빠른 기록 화면. Phase 1: 저장 없음, UI 토글만. */
export function LogScreen() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [memo, setMemo] = useState('')

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const isOn = (key: string) => selected.has(key)

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">빠른 기록</h1>
        <p className="screen-head__sub">원인은 추측하지 않아요. 오늘 있었던 일만 가볍게 남겨요</p>
      </header>

      {/* 1. 오늘 상태 */}
      <GlassCard>
        <SectionHeader title="오늘 나 어떤 상태?" />
        <ChipGroup label="오늘 상태">
          {STATE_CHIPS.map((s) => (
            <Chip key={s.code} label={s.label} tone="lav" selected={isOn(`state:${s.code}`)} onToggle={() => toggle(`state:${s.code}`)} />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 2. 오늘 있었던 일 (NOT "이유 같았던 건?") */}
      <GlassCard>
        <SectionHeader title="오늘 있었던 일" subtitle="원인 추측이 아니라 사건·상황 기록이에요" />
        {EVENT_ORDER.filter((c) => EVENT_GROUPS[c]).map((cat) => (
          <div className="event-group" key={cat}>
            <p className="event-group__label">{EVENT_CATEGORY_LABEL[cat]}</p>
            <ChipGroup label={EVENT_CATEGORY_LABEL[cat]}>
              {EVENT_GROUPS[cat].map((e) => (
                <Chip key={e.code} label={e.label} tone="coral" selected={isOn(`event:${e.code}`)} onToggle={() => toggle(`event:${e.code}`)} />
              ))}
            </ChipGroup>
          </div>
        ))}
      </GlassCard>

      {/* 3. 생리 기록 — 별도 섹션. 원인 칩 아님. */}
      <GlassCard tint="lav">
        <SectionHeader title="생리 기록" subtitle="생리·주기는 원인이 아니라 사실 기록이에요. 패턴은 앱이 계산해요" />
        <ChipGroup label="생리 상태">
          <Chip label="생리 시작" tone="rose" selected={isOn('cycle:start')} onToggle={() => toggle('cycle:start')} />
          <Chip label="생리 종료" tone="rose" selected={isOn('cycle:end')} onToggle={() => toggle('cycle:end')} />
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>출혈량</p>
        <ChipGroup label="출혈량">
          {FLOW_CHIPS.map((f) => (
            <Chip key={f} label={f} tone="rose" selected={isOn(`flow:${f}`)} onToggle={() => toggle(`flow:${f}`)} />
          ))}
        </ChipGroup>
        <p className="event-group__label" style={{ marginTop: 14 }}>생리통</p>
        <ChipGroup label="생리통">
          {PERIOD_PAIN_CHIPS.map((p) => (
            <Chip key={p} label={p} tone="rose" selected={isOn(`pain:${p}`)} onToggle={() => toggle(`pain:${p}`)} />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 4. 회복 행동 */}
      <GlassCard tint="mint">
        <SectionHeader title="뭐 했더니 좀 나아졌어?" subtitle="회복 행동도 중요한 기록이에요" />
        <ChipGroup label="회복 행동">
          {RECOVERY_ACTIONS.map((a) => (
            <Chip key={a.code} label={a.label} tone="mint" selected={isOn(`recovery:${a.code}`)} onToggle={() => toggle(`recovery:${a.code}`)} />
          ))}
        </ChipGroup>

        {/* 5. 효과 선택 */}
        <p className="event-group__label" style={{ marginTop: 16 }}>그래서 좀 어땠어?</p>
        <ChipGroup label="효과">
          {RECOVERY_EFFECTS.map((e) => (
            <Chip key={e.code} label={e.label} tone="mint" selected={isOn(`effect:${e.code}`)} onToggle={() => toggle(`effect:${e.code}`)} />
          ))}
        </ChipGroup>
      </GlassCard>

      {/* 6. 메모 */}
      <GlassCard>
        <SectionHeader title="메모" subtitle="남기고 싶은 한 줄 (선택)" />
        <textarea
          className="memo"
          placeholder="오늘 떠오르는 걸 자유롭게…"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
        />
      </GlassCard>

      <button className="btn-primary log__done" onClick={() => navigate('/')}>
        기록 완료
      </button>
      <p className="log__note">아직은 화면만 동작해요. 저장 기능은 다음 단계에서 연결돼요.</p>
    </>
  )
}
