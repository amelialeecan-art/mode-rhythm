import { Mascot, type MascotMood } from '../mascot/Mascot'
import './components.css'

export interface ForecastCardProps {
  /** 내일의 모드 (예: "회복 우선일"). */
  modeName: string
  /** 동적 보조 문구 (예: "배터리 5%"). 후속 단계에서 데이터로 생성. */
  subLabel: string
  /** 이 모드가 올 가능성 (%). 확정이 아니라 가능성으로만 표현. */
  probability: number
  /** 가능성에 대한 근거 한 줄 (단정 금지). */
  reason: string
  mascotMood?: MascotMood
}

/**
 * 내일 예보 카드. 핵심 규칙: "~입니다" 금지, "가능성이 있어요" 톤.
 * probability는 미터로 시각화.
 */
export function ForecastCard({
  modeName,
  subLabel,
  probability,
  reason,
  mascotMood = 'sleepy',
}: ForecastCardProps) {
  const pct = Math.max(0, Math.min(100, Math.round(probability)))
  return (
    <article className="forecast-card">
      <div className="forecast-card__sky">
        <span className="forecast-card__stamp">예보</span>
        <p className="forecast-card__eyebrow">내일의 모드 · 예보</p>
        <Mascot mood={mascotMood} size={84} className="forecast-card__mascot" />
        <h3 className="forecast-card__title">{modeName}</h3>
        <span className="forecast-card__paren">{subLabel}</span>
      </div>
      <div className="forecast-card__body">
        <div className="forecast-card__meter-row">
          <span>이 모드가 올 가능성</span>
          <b>{pct}%</b>
        </div>
        <div className="forecast-card__meter-track">
          <div className="forecast-card__meter-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="forecast-card__reason">{reason}</p>
      </div>
    </article>
  )
}
