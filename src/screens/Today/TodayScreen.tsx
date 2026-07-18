import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, ModeHeroCard, PlanCard, Mascot } from '../../design'
import { getTodaySummary } from '../../data/services/dailyScoreService'
import { getRecoveryRecommendations } from '../../data/services/patternAnalysisService'
import { getRhythmForecastViewModel } from '../../data/services/rhythmForecastService'
import type { TodaySummary, FactorTier, RecoveryActionInsight, RhythmForecastDay } from '../../engine'
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
// 주기는 데이터 유무에 따라 별도 렌더(숫자 대신 "데이터 없음" 등).
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
  const [recs, setRecs] = useState<RecoveryActionInsight[]>([])
  const [tomorrow, setTomorrow] = useState<RhythmForecastDay | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([getTodaySummary(getTodayISODate()), getRecoveryRecommendations(), getRhythmForecastViewModel()]).then(
      ([s, r, f]) => {
        if (cancelled) return
        setSummary(s)
        setRecs(r)
        setTomorrow(f.tomorrow)
        setLoading(false)
      },
    )
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
        <FilledToday summary={summary} recs={recs} tomorrow={tomorrow} onRecord={() => navigate('/log')} />
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
  recs,
  tomorrow,
  onRecord,
}: {
  summary: TodaySummary
  recs: RecoveryActionInsight[]
  tomorrow: RhythmForecastDay | null
  onRecord: () => void
}) {
  const tone = useToneMode()
  const { classification, scores, factorCandidates, plan, recordedRecovery, cycleContext, eventSummary } = summary
  const mascot = MASCOT_BY_DAYTYPE[classification.dayType] ?? 'calm'
  const cycleDisplay = CYCLE_DISPLAY[cycleContext.confidence] ?? null

  return (
    <>
      <ModeHeroCard
        modeName={classification.label}
        subLabel={classification.subLabel}
        body={classification.description}
        mascotMood={mascot}
      />

      {/* 오늘의 종합 부하 + 항목별 요약 */}
      <GlassCard>
        <SectionHeader title="오늘의 버거움" subtitle="오늘 기록 기준으로 계산했어요" right={<span className="rhythm-num">{scores.rhythmLoad}</span>} />
        <p className="load-explain">
          오늘 기록한 감정·식욕·수면·몸·주기·사건 점수를 앱 내부 가중치로 합친 값이에요. 진단 점수나 호르몬 수치가 아니에요.
        </p>
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
          {/* 주기: 데이터 상태에 따라 정직하게 표시 */}
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
        <p className="load-explain load-explain--soft">
          감정 점수는 선택한 불안·짜증·슬픔·무거움 등의 강도를 앱 내부 공식으로 합친 값이에요.
        </p>
      </GlassCard>

      {/* 오늘 있었던 일 (사건 부하 숫자 대신 개수·주요 사건) */}
      <GlassCard>
        <SectionHeader title="오늘 있었던 일" subtitle={`오늘 있었던 일 ${eventSummary.count}개`} />
        {eventSummary.count === 0 ? (
          <p className="today-rec-empty">오늘 기록된 사건이 없어요.</p>
        ) : (
          <>
            <div className="recovery-rec">
              {eventSummary.top.map((e, i) => (
                <span className="recovery-rec__chip recovery-rec__chip--plain" key={`${e.label}-${i}`}>
                  {e.label}
                </span>
              ))}
            </div>
            {eventSummary.count > 3 && <p className="load-explain load-explain--soft">사건 기록이 많았어요.</p>}
          </>
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
        <p className="factor-note">아직 장기 패턴 분석 전이에요. 단정이 아니라 오늘 기록 기준이에요.</p>
      </GlassCard>

      {/* 오늘의 4줄 설계 */}
      <PlanCard
        lines={[
          { tag: '일정', text: plan.schedule },
          { tag: '식사', text: plan.food },
          { tag: '운동', text: plan.movement },
          { tag: '관계', text: plan.relationship },
        ]}
      />

      {/* 내일 참고 (가벼운 참고 — 예측 확정 아님) */}
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

      {/* 오늘 도움이 될 수 있는 것 (효과 후보 기반) */}
      <GlassCard tint="mint">
        <SectionHeader title="오늘 도움이 될 수 있는 것" subtitle="최근 기록상 비슷한 날에 도움이 된 편이에요" star />
        {recs.length > 0 ? (
          <div className="recovery-rec">
            {recs.map((r) => (
              <span className="recovery-rec__chip" key={r.actionCode}>
                {r.actionLabel}
              </span>
            ))}
          </div>
        ) : (
          <p className="today-rec-empty">회복 행동 기록이 쌓이면 오늘 도움이 될 수 있는 행동을 추천해볼게요.</p>
        )}
      </GlassCard>

      {/* 오늘 기록된 회복 행동 (있을 때만, 추천과 별개) */}
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

      <button className="quick-record" onClick={onRecord}>
        <span className="quick-record__plus">＋</span>
        <span>오늘 기록 다시 남기기</span>
      </button>
    </>
  )
}
