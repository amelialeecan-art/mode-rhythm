import { GlassCard, type GlassTint } from './GlassCard'
import { SectionHeader } from './SectionHeader'
import './components.css'

export interface MiniInsightCardProps {
  title: string
  subtitle?: string
  body?: string
  /** 작은 칩 형태의 키워드들 (예: 회복 행동). */
  chips?: string[]
  tint?: GlassTint
  star?: boolean
}

/** 분석 화면의 작은 인사이트 카드 (상습 패턴/나를 살린 것들/설명되지 않은 날 등). */
export function MiniInsightCard({ title, subtitle, body, chips, tint = 'plain', star }: MiniInsightCardProps) {
  return (
    <GlassCard tint={tint}>
      <SectionHeader title={title} subtitle={subtitle} star={star} />
      {body && <p className="mini-insight__body">{body}</p>}
      {chips && chips.length > 0 && (
        <div className="mini-insight__chips">
          {chips.map((c) => (
            <span className="mini-insight__chip" key={c}>
              {c}
            </span>
          ))}
        </div>
      )}
    </GlassCard>
  )
}
