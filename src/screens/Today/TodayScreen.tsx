import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, ModeHeroCard, PlanCard, Mascot } from '../../design'
import { getTodaySummary } from '../../data/services/dailyScoreService'
import { getRecoveryRecommendations } from '../../data/services/patternAnalysisService'
import type { TodaySummary, FactorTier, RecoveryActionInsight } from '../../engine'
import { getTodayISODate, formatMonthDay, formatWeekday } from '../../lib/date'
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

const LOAD_ROWS: { key: keyof TodaySummary['scores']; label: string; color: string }[] = [
  { key: 'emotionalLoad', label: '감정', color: 'var(--lav)' },
  { key: 'appetiteLoad', label: '식욕', color: 'var(--coral)' },
  { key: 'sleepLoad', label: '수면', color: 'var(--sky)' },
  { key: 'bodyLoad', label: '몸', color: 'var(--mint)' },
  { key: 'cycleLoad', label: '주기', color: 'var(--rose)' },
  { key: 'eventLoad', label: '사건', color: 'var(--butter)' },
]

export function TodayScreen() {
  const navigate = useNavigate()
  const now = new Date()
  const [summary, setSummary] = useState<TodaySummary | null>(null)
  const [recs, setRecs] = useState<RecoveryActionInsight[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void Promise.all([getTodaySummary(getTodayISODate()), getRecoveryRecommendations()]).then(([s, r]) => {
      if (cancelled) return
      setSummary(s)
      setRecs(r)
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
        <FilledToday summary={summary} recs={recs} onRecord={() => navigate('/log')} />
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

function FilledToday({ summary, recs, onRecord }: { summary: TodaySummary; recs: RecoveryActionInsight[]; onRecord: () => void }) {
  const { classification, scores, factorCandidates, plan, recordedRecovery } = summary
  const mascot = MASCOT_BY_DAYTYPE[classification.dayType] ?? 'calm'

  return (
    <>
      <ModeHeroCard
        modeName={classification.label}
        subLabel={classification.subLabel}
        body={classification.description}
        mascotMood={mascot}
      />

      {/* 전체 리듬 부하 + 항목별 요약 */}
      <GlassCard>
        <SectionHeader title="오늘의 리듬 부하" subtitle="오늘 기록 기준으로 계산했어요" right={<span className="rhythm-num">{scores.rhythmLoad}</span>} />
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
        </div>
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
