import { FlowGraph } from './FlowGraph'
import './charts.css'

export interface GraphSlide {
  key: string
  title: string
  subtitle: string
  color: string
  data: number[]
}

export interface SlideGraphCardsProps {
  slides: GraphSlide[]
}

/** 가로 스냅 스크롤되는 슬라이드 카드형 그래프 묶음. */
export function SlideGraphCards({ slides }: SlideGraphCardsProps) {
  return (
    <div className="gscroll">
      {slides.map((s) => (
        <article className="graph-card" key={s.key}>
          <p className="graph-card__title">{s.title}</p>
          <p className="graph-card__sub">{s.subtitle}</p>
          <FlowGraph data={s.data} color={s.color} uid={s.key} />
        </article>
      ))}
    </div>
  )
}
