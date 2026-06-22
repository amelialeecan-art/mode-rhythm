import { GlassCard, SectionHeader, SlideGraphCards, MiniInsightCard } from '../../design'
import { MOCK_GRAPH_SLIDES } from '../../data/mock'
import './analysis.css'

// Phase 1 mock — 후속 단계에서 patternInsights 엔진 결과로 대체.
const MOCK_HABITUAL = [
  { name: '수면 부족', days: 12, pct: 80, color: 'linear-gradient(90deg,var(--lav-2),var(--lav))' },
  { name: '월경 전 구간', days: 6, pct: 45, color: 'linear-gradient(90deg,var(--coral-2),var(--coral))' },
  { name: '대인 스트레스', days: 5, pct: 36, color: 'linear-gradient(90deg,var(--sky-2),var(--sky))' },
]

export function AnalysisScreen() {
  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">분석</h1>
        <p className="screen-head__sub">패턴이 잡히는 중이에요</p>
      </header>

      <SlideGraphCards slides={MOCK_GRAPH_SLIDES} />

      {/* 상습 패턴 */}
      <GlassCard>
        <SectionHeader title="상습 패턴" subtitle="이번 달 자주 함께 나타난 것들" />
        <ul className="rep-list">
          {MOCK_HABITUAL.map((r) => (
            <li key={r.name}>
              <div className="rep-row__top">
                <span>{r.name}</span>
                <span className="rep-row__d">{r.days}일</span>
              </div>
              <div className="bar">
                <i style={{ width: `${r.pct}%`, background: r.color }} />
              </div>
            </li>
          ))}
        </ul>
      </GlassCard>

      {/* 겹쳐 나타나는 패턴 (공범 구조) */}
      <GlassCard tint="lav">
        <SectionHeader title="겹쳐 나타나는 패턴" />
        <div className="overlap">
          <div className="overlap__c overlap__c--a">
            수면
            <br />
            부족
          </div>
          <div className="overlap__c overlap__c--b">
            월경 전
            <br />
            구간
          </div>
        </div>
        <p className="overlap__body">
          수면 부족과 월경 전 구간이 함께 있을 때 식욕 변동이 더 크게 올라간 기록이 있어요.
          아직은 가능성 단계예요.
        </p>
      </GlassCard>

      {/* 나를 살린 것들 */}
      <MiniInsightCard
        title="나를 살린 것들"
        subtitle="비슷한 날에 자주 도움이 된 행동이에요"
        tint="mint"
        star
        chips={['산책', '샤워', '혼자 시간', '단백질 식사']}
      />

      {/* 설명되지 않은 날 */}
      <MiniInsightCard
        title="설명되지 않은 날"
        tint="yellow"
        body="현재 기록만으로 충분히 설명되지 않는 날도 있어요. 이유가 없는 날도 데이터예요 — 미제 사건으로 보관해 둘게요."
      />
    </>
  )
}
