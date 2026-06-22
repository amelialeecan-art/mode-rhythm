import { Mascot, type MascotMood } from '../mascot/Mascot'
import './components.css'

export interface ModeHeroCardProps {
  /** 모드 이름 (예: "감정 민감일"). 명세 표준명 우선. */
  modeName: string
  /**
   * 동적 괄호 보조 문구 (예: "해석 보류 구간").
   * 주의: 후속 단계에서 점수/상황으로 동적 생성된다. 절대 고정값으로 하드코딩하지 말 것.
   */
  subLabel: string
  /** 모드 설명 한두 줄. 단정하지 않는 톤. */
  body: string
  mascotMood?: MascotMood
  eyebrow?: string
}

/**
 * 오늘의 모드 히어로 카드 (그라데이션 헤더 + 모찌 + 모드명 + 보조문구).
 * subLabel은 데이터 기반 동적 문구를 받기 위한 자리 — 고정 금지.
 */
export function ModeHeroCard({
  modeName,
  subLabel,
  body,
  mascotMood = 'teary',
  eyebrow = '오늘의 모드',
}: ModeHeroCardProps) {
  return (
    <article className="mode-hero">
      <div className="mode-hero__head">
        <div>
          <p className="mode-hero__eyebrow">{eyebrow}</p>
          <h2 className="mode-hero__title">{modeName}</h2>
          <span className="mode-hero__paren">{subLabel}</span>
        </div>
        <Mascot mood={mascotMood} size={74} />
      </div>
      <p className="mode-hero__body">{body}</p>
    </article>
  )
}
