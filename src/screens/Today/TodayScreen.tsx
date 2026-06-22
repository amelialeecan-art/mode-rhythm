import { useNavigate } from 'react-router-dom'
import { GlassCard, SectionHeader, ConfidenceBadge, ModeHeroCard, PlanCard, type ConfidenceTier } from '../../design'
import { formatMonthDay, formatWeekday } from '../../lib/date'
import './today.css'

// Phase 1 mock — 후속 단계에서 dailyScores/엔진 결과로 대체.
const MOCK_FACTORS: { name: string; tier: ConfidenceTier }[] = [
  { name: '수면 부족', tier: 'strong' },
  { name: '월경 전 구간', tier: 'possible' },
  { name: '대인 스트레스', tier: 'reference' },
]

const MOCK_PLAN = [
  { tag: '일정', text: '중요한 결정은 미루기' },
  { tag: '식사', text: '단백질 먼저' },
  { tag: '운동', text: '산책 20분' },
  { tag: '관계', text: '대화 속도 조절' },
]

const MOCK_RECOVERY = ['산책', '샤워', '혼자 시간', '단백질 식사']

export function TodayScreen() {
  const navigate = useNavigate()
  const now = new Date()

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

      {/* 오늘의 모드 — subLabel은 후속 단계에서 동적 생성(고정 금지) */}
      <ModeHeroCard
        modeName="감정 민감일"
        subLabel="해석 보류 구간"
        body="작은 일에도 마음이 크게 반응할 수 있는 날이에요. 오늘의 판단은 잠시 보류해도 괜찮아요."
        mascotMood="teary"
      />

      {/* 오늘의 요인 후보 */}
      <GlassCard>
        <SectionHeader title="오늘의 요인 후보" />
        <ul className="factor-list">
          {MOCK_FACTORS.map((f, i) => (
            <li className="factor" key={f.name}>
              <span className="factor__no">{i + 1}</span>
              <span className="factor__name">{f.name}</span>
              <ConfidenceBadge tier={f.tier} />
            </li>
          ))}
        </ul>
        <p className="factor-note">단정은 아니고, 기록상 함께 나타난 패턴이에요.</p>
      </GlassCard>

      {/* 오늘의 4줄 설계 */}
      <PlanCard lines={MOCK_PLAN} />

      {/* 빠른 기록 진입 */}
      <button className="quick-record" onClick={() => navigate('/log')}>
        <span className="quick-record__plus">＋</span>
        <span>오늘 빠르게 기록하기 · 30초</span>
      </button>

      {/* 오늘 도움이 될 회복 행동 */}
      <GlassCard tint="mint">
        <SectionHeader title="오늘 도움이 될 회복 행동" star subtitle="비슷한 날에 자주 도움이 된 행동이에요" />
        <div className="recovery-rec">
          {MOCK_RECOVERY.map((r) => (
            <span className="recovery-rec__chip" key={r}>
              {r}
            </span>
          ))}
        </div>
      </GlassCard>
    </>
  )
}
