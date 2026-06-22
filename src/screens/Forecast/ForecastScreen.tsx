import { GlassCard, SectionHeader, ForecastCard, PlanCard } from '../../design'
import { MOCK_WEEK_FLOW } from '../../data/mock'
import './forecast.css'

const TONE_BG: Record<string, { dot: string; ink: string }> = {
  mint: { dot: 'var(--mint-s)', ink: 'var(--mint-ink)' },
  sky: { dot: 'var(--sky-s)', ink: 'var(--sky-ink)' },
  lav: { dot: 'var(--lav-s)', ink: 'var(--lav-ink)' },
  coral: { dot: 'var(--coral-s)', ink: 'var(--coral-ink)' },
}

const MOCK_PREP = [
  { tag: '일정', text: '빡센 약속은 패스' },
  { tag: '식사', text: '따뜻한 거 위주' },
  { tag: '운동', text: '가벼운 스트레칭' },
  { tag: '관계', text: '무리한 모임은 보류' },
]

export function ForecastScreen() {
  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">내일 예보</h1>
        <p className="screen-head__sub">확정이 아니라 가능성이에요</p>
      </header>

      {/* 내일의 모드 — subLabel/가능성은 후속 단계에서 데이터로 생성 */}
      <ForecastCard
        modeName="회복 우선일"
        subLabel="배터리 5%"
        probability={68}
        reason="주기는 회복기, 수면은 적자 — 내일은 회복 우선일 가능성이 있어요"
        mascotMood="sleepy"
      />

      {/* 이번 주 흐름 */}
      <GlassCard>
        <SectionHeader title="이번 주 흐름" subtitle="가능성 기준이에요" />
        <div className="weekrow">
          {MOCK_WEEK_FLOW.map((w) => {
            const t = TONE_BG[w.tone]
            return (
              <div className="wd" key={w.day}>
                <span className="wd__day">{w.day}</span>
                <span className="wd__dot" style={{ background: t.dot }} />
                <span className="wd__w" style={{ color: t.ink }}>
                  {w.shortLabel}
                </span>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* 미리 챙길 것 (4줄 설계) */}
      <PlanCard
        title="미리 챙길 것"
        lines={MOCK_PREP}
        note="어디까지나 예보예요 — 우산은 내일의 내가 챙기기"
      />
    </>
  )
}
