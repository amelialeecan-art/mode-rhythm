import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, ModeHeroCard, PlanCard, Mascot } from '../../design'
import { getTodaySummary } from '../../data/services/dailyScoreService'
import { getTodayPatternContext, type TodayPatternContext } from '../../data/services/patternAnalysisService'
import { getRecentFlow } from '../../data/services/rhythmService'
import { getRhythmForecastViewModel } from '../../data/services/rhythmForecastService'
import { selectTodayDecision, type TodaySummary, type FactorTier, type RhythmForecastDay, type RecentFlow, type TodayDecision } from '../../engine'
import { recentChangeSentence, followUpSentence } from './todayVoice'
import { getTodayISODate, formatMonthDay, formatWeekday } from '../../lib/date'
import { useToneMode } from '../../lib/useToneMode'
import { getToneCopy } from '../../copy/tone'
import './today.css'

// dayType → 모찌 표정 (분류 코드 기준)
const MASCOT_BY_DAYTYPE: Record<string, 'happy' | 'teary' | 'sleepy' | 'hungry' | 'focus' | 'confused' | 'calm'> = {
  stable: 'calm',
  focus: 'focus',
  emotion_sensitive: 'teary',
  appetite_shift: 'hungry',
  body_load: 'sleepy',
  social_fatigue: 'confused',
  impulse_caution: 'hungry',
  recovery_priority: 'sleepy',
  unknown_cause: 'confused',
  mixed_load: 'teary',
}

const TIER_LABEL: Record<FactorTier, string> = {
  recorded: '오늘 기록',
  calculated: '계산 높음',
  watch: '관찰',
  not_enough_data: '데이터 부족',
}

// 사건 부하(0~100)는 오해 소지가 커서 항목 막대에서 제외하고 개수·주요 사건으로 표시.
const LOAD_ROWS: { key: keyof TodaySummary['scores']; label: string; color: string }[] = [
  { key: 'emotionalLoad', label: '감정 흔들림', color: 'var(--lav)' },
  { key: 'appetiteLoad', label: '식욕 흔들림', color: 'var(--coral)' },
  { key: 'sleepLoad', label: '수면 문제', color: 'var(--sky)' },
  { key: 'bodyLoad', label: '몸 불편', color: 'var(--mint)' },
]

// 주기 데이터 상태 → 표시 (calcCycleLoad 공식은 변경하지 않음, 표시의 정직성만 개선)
const CYCLE_DISPLAY: Record<string, { value: string; hint: string } | null> = {
  none: { value: '데이터 없음', hint: '생리 시작일을 기록하면 주기 구간을 계산해요.' },
  low: { value: '데이터 부족', hint: '평균 주기를 사용한 초기 추정이에요.' },
  medium: { value: '', hint: '주기 반복 기록 중이에요.' },
  high: null, // 일반 표시
}

export function TodayScreen() {
  const navigate = useNavigate()
  const now = new Date()
  const [summary, setSummary] = useState<TodaySummary | null>(null)
  const [pattern, setPattern] = useState<TodayPatternContext>({ recoveryRecs: [], topFlowDriver: null })
  const [recentFlow, setRecentFlow] = useState<RecentFlow | null>(null)
  const [tomorrow, setTomorrow] = useState<RhythmForecastDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      getTodaySummary(getTodayISODate()),
      getTodayPatternContext(),
      getRecentFlow(),
      getRhythmForecastViewModel(),
    ]).then(([s, p, rf, f]) => {
      if (cancelled) return
      setSummary(s)
      setPattern(p)
      setRecentFlow(rf)
      setTomorrow(f.tomorrow)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <header className="topbar">
        <div className="topbar__date">
          {formatMonthDay(now)}
          <small>{formatWeekday(now)}</small>
        </div>
        <button className="topbar__settings" aria-label="설정" onClick={() => navigate('/settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H2a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 3.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8a1.7 1.7 0 0 0 1-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8a1.7 1.7 0 0 0 1.56 1H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </header>

      {loading ? (
        <GlassCard>
          <p className="today-loading">오늘 기록을 불러오는 중…</p>
        </GlassCard>
      ) : !summary ? (
        <EmptyToday onRecord={() => navigate('/log')} />
      ) : (
        <FilledToday summary={summary} pattern={pattern} recentFlow={recentFlow} tomorrow={tomorrow} onRecord={() => navigate('/log')} />
      )}
    </>
  )
}

function EmptyToday({ onRecord }: { onRecord: () => void }) {
  return (
    <GlassCard>
      <div className="today-empty">
        <Mascot mood="calm" size={96} />
        <p className="today-empty__title">아직 오늘 기록이 없어요</p>
        <p className="today-empty__sub">30초 기록을 남기면 오늘의 모드를 계산해볼게요.</p>
        <button className="btn-primary today-empty__btn" onClick={onRecord}>
          오늘 기록하기
        </button>
      </div>
    </GlassCard>
  )
}

function FilledToday({
  summary,
  pattern,
  recentFlow,
  tomorrow,
  onRecord,
}: {
  summary: TodaySummary
  pattern: TodayPatternContext
  recentFlow: RecentFlow | null
  tomorrow: RhythmForecastDay | null
  onRecord: () => void
}) {
  const tone = useToneMode()
  const { classification, scores, stateDomains, stateNarrative, factorCandidates, plan, recordedRecovery, rhythmExceptions, cycleContext, eventSummary } = summary
  const mascot = MASCOT_BY_DAYTYPE[classification.dayType] ?? 'calm'
  const cycleDisplay = CYCLE_DISPLAY[cycleContext.confidence] ?? null
  const isException = rhythmExceptions.length > 0

  // 오늘의 대표 행동 1개 (예외일 안전 → 기본 기능 → 소모 흐름 → 개인 회복 → 기본).
  const decision: TodayDecision | null = selectTodayDecision({
    domains: stateDomains,
    isExceptionDay: isException,
    exceptionLabels: rhythmExceptions,
    recentFlow,
    recoveryRecs: pattern.recoveryRecs,
  })

  // 최근 변화 신호 / 다음에 이어진 변화 — 결과가 약하면 문장이 null → 카드 숨김.
  const recentSentence = recentChangeSentence(recentFlow)
  const followUp = isException ? null : followUpSentence(pattern.topFlowDriver)

  return (
    <>
      {/* 1. 예외일 배너 (해당할 때만, 최상단) */}
      {isException && (
        <GlassCard tint="coral">
          <SectionHeader title="오늘은 평소 리듬과 분리해서 봐요" subtitle={rhythmExceptions.join(' · ')} />
          <p className="today-rec-empty">기록은 그대로 남기되, 오늘은 평소 소모나 주기로 해석하지 않고 회복·기본 생활 중심으로 봐요.</p>
        </GlassCard>
      )}

      {/* 2. 오늘 상태 구조 (영역 대비 설명) */}
      <ModeHeroCard modeName={classification.label} subLabel={classification.subLabel} body={classification.description} mascotMood={mascot} />
      {stateNarrative.length > 0 && (
        <GlassCard>
          <SectionHeader title="오늘 상태" subtitle="유지되는 영역과 떨어진 영역을 나눠 봤어요" />
          {stateNarrative.map((line, i) => (
            <p className="today-state-line" key={i}>
              {line}
            </p>
          ))}
        </GlassCard>
      )}

      {/* 3. 오늘의 결정 — 최대 1개 */}
      {decision && (
        <GlassCard tint="mint">
          <SectionHeader title="오늘의 결정" subtitle={decision.source === 'personal' ? '비슷한 상태의 기록을 참고했어요' : '오늘 상태를 기준으로 한 가지만 골랐어요'} star />
          <p className="today-decision">{decision.text}</p>
        </GlassCard>
      )}

      {/* 4. 최근 변화 신호 — 강한 결과 1개 (약하면 카드 자체를 숨김) */}
      {recentSentence && (
        <GlassCard tint="sky">
          <SectionHeader title="최근 변화 신호" />
          <p className="today-flow-line">{recentSentence}</p>
        </GlassCard>
      )}

      {/* 5. 다음에 자주 이어진 변화 — 기존 근거 충분할 때만 1개 */}
      {followUp && (
        <GlassCard>
          <SectionHeader title="다음에 자주 이어진 변화" />
          <p className="today-flow-line">{followUp}</p>
        </GlassCard>
      )}

      {/* 6. 나머지 상세 — 접어두고 우선순위를 낮춤 */}
      <details className="today-detail">
        <summary className="today-detail__summary">오늘 상세 더 보기</summary>

        {/* 오늘의 종합 부하 + 항목별 요약 */}
        <GlassCard>
          <SectionHeader title="오늘의 버거움" subtitle="오늘 기록 기준으로 계산했어요" right={<span className="rhythm-num">{scores.rhythmLoad}</span>} />
          <p className="load-explain">오늘 기록한 감정·식욕·수면·몸·주기·사건 점수를 앱 내부 가중치로 합친 값이에요. 진단 점수나 호르몬 수치가 아니에요.</p>
          <div className="loadbars">
            {LOAD_ROWS.map((r) => (
              <div className="loadbar" key={r.key}>
                <span className="loadbar__label">{r.label}</span>
                <span className="loadbar__track">
                  <i style={{ width: `${scores[r.key]}%`, background: r.color }} />
                </span>
                <span className="loadbar__val">{scores[r.key]}</span>
              </div>
            ))}
            <div className="loadbar" key="cycle">
              <span className="loadbar__label">주기</span>
              {cycleDisplay && cycleDisplay.value ? (
                <span className="loadbar__nodata">{cycleDisplay.value}</span>
              ) : (
                <>
                  <span className="loadbar__track">
                    <i style={{ width: `${scores.cycleLoad}%`, background: 'var(--rose)' }} />
                  </span>
                  <span className="loadbar__val">{scores.cycleLoad}</span>
                </>
              )}
            </div>
          </div>
          {cycleDisplay && <p className="load-explain load-explain--soft">주기: {cycleDisplay.hint}</p>}
        </GlassCard>

        {/* 오늘 있었던 일 */}
        <GlassCard>
          <SectionHeader title="오늘 있었던 일" subtitle={`오늘 있었던 일 ${eventSummary.count}개`} />
          {eventSummary.count === 0 ? (
            <p className="today-rec-empty">오늘 기록된 사건이 없어요.</p>
          ) : (
            <div className="recovery-rec">
              {eventSummary.top.map((e, i) => (
                <span className="recovery-rec__chip recovery-rec__chip--plain" key={`${e.label}-${i}`}>
                  {e.label}
                </span>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 오늘 기록 기반 요인 후보 */}
        <GlassCard>
          <SectionHeader title="오늘 기록 기반 요인 후보" subtitle="원인이 아니라, 오늘 기록에서 함께 관찰된 요소예요" />
          <ul className="factor-list">
            {factorCandidates.map((f, i) => (
              <li className="factor" key={`${f.label}-${i}`}>
                <span className="factor__no">{i + 1}</span>
                <div className="factor__body">
                  <span className="factor__name">{f.label}</span>
                  <span className="factor__detail">{f.detail}</span>
                </div>
                <span className={`factor-tier factor-tier--${f.tier}`}>{TIER_LABEL[f.tier]}</span>
              </li>
            ))}
          </ul>
        </GlassCard>

        {/* 오늘 계획(참고) — 대표 행동은 위 '오늘의 결정' 하나, 여기서는 상세로만 */}
        <PlanCard
          lines={[
            { tag: '일정', text: plan.schedule },
            { tag: '식사', text: plan.food },
            { tag: '운동', text: plan.movement },
            { tag: '관계', text: plan.relationship },
          ]}
        />

        {/* 내일 참고 */}
        {tomorrow && (
          <GlassCard tint="sky">
            <SectionHeader title="내일 참고" subtitle={`참고도 ${tomorrow.confidence}`} />
            <p className="tmrw-line">
              내일은 <b>{tomorrow.label}</b> 가능성이 있어요{tomorrow.subLabel ? ` · ${tomorrow.subLabel}` : ''}.
            </p>
            <p className="tmrw-hint">{tomorrow.planHint}</p>
            <p className="tmrw-note">{getToneCopy(tone, 'reference')}</p>
          </GlassCard>
        )}

        {/* 오늘 기록된 회복 행동 */}
        {recordedRecovery.length > 0 && (
          <GlassCard>
            <SectionHeader title="오늘 기록된 회복 행동" subtitle="오늘 남긴 기록이에요" />
            <div className="recovery-rec">
              {recordedRecovery.map((r) => (
                <span className="recovery-rec__chip recovery-rec__chip--plain" key={r}>
                  {r}
                </span>
              ))}
            </div>
          </GlassCard>
        )}
      </details>

      <button className="quick-record" onClick={onRecord}>
        <span className="quick-record__plus">＋</span>
        <span>오늘 기록 다시 남기기</span>
      </button>
    </>
  )
}
