import { GlassCard } from './GlassCard'
import { SectionHeader } from './SectionHeader'
import './components.css'

export interface PlanLine {
  /** 일정 / 식사 / 운동 / 관계 */
  tag: string
  text: string
}

export interface PlanCardProps {
  title?: string
  subtitle?: string
  lines: PlanLine[]
  /** 하단 안내 문구(예보의 "어디까지나 예보" 등) */
  note?: string
}

const TAG_CLASS: Record<string, string> = {
  일정: 'c1',
  식사: 'c2',
  운동: 'c3',
  관계: 'c4',
}

/** 오늘/내일의 4줄 설계 카드 (일정·식사·운동·관계). */
export function PlanCard({ title = '오늘의 4줄 설계', subtitle, lines, note }: PlanCardProps) {
  return (
    <GlassCard>
      <SectionHeader title={title} subtitle={subtitle} />
      <ul className="plan">
        {lines.map((l) => (
          <li className="plan__row" key={l.tag}>
            <span className={`plan__tag ${TAG_CLASS[l.tag] ?? 'c1'}`}>{l.tag}</span>
            <span className="plan__text">{l.text}</span>
          </li>
        ))}
      </ul>
      {note && <p className="plan__note">{note}</p>}
    </GlassCard>
  )
}
