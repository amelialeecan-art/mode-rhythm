import type { CSSProperties, ReactNode } from 'react'
import './mascot.css'

/** 모찌 캐릭터의 기분(표정). 화면별 분위기와 연결된다. */
export type MascotMood =
  | 'happy'
  | 'teary'
  | 'sleepy'
  | 'hungry'
  | 'focus'
  | 'confused'
  | 'calm'

/** 기분별 기본 그라데이션 (시안 사용값 기준). 필요시 prop으로 덮어쓴다. */
export const MASCOT_GRADIENTS: Record<MascotMood, string> = {
  happy: 'linear-gradient(150deg,#CDA8F2 0%, #F0A6CE 52%, #FFBC9E 100%)',
  teary: 'linear-gradient(155deg,#CBA9F4,#A985E8)',
  sleepy: 'linear-gradient(155deg,#A4E8C8,#5BC79E)',
  hungry: 'linear-gradient(155deg,#FFC29E,#FF9576)',
  focus: 'linear-gradient(155deg,#ACD0F6,#74A8EC)',
  confused: 'linear-gradient(155deg,#FFE2A0,#FFC96C)',
  calm: 'linear-gradient(155deg,#A2E2CB,#9FD3F2)',
}

const E = '#3D3552'

const eye = (x: number): ReactNode => (
  <g key={`e${x}`}>
    <ellipse cx={x} cy={51} rx={3.1} ry={4} fill={E} />
    <circle cx={x + 1.15} cy={49} r={1.1} fill="#fff" />
  </g>
)

const eyeBig = (x: number): ReactNode => (
  <g key={`eb${x}`}>
    <ellipse cx={x} cy={51} rx={3.6} ry={4.7} fill={E} />
    <circle cx={x + 1.3} cy={48.8} r={1.45} fill="#fff" />
    <circle cx={x - 1.2} cy={52.4} r={0.8} fill="#fff" opacity={0.7} />
  </g>
)

const blush = (o = 0.45): ReactNode => (
  <g key="blush">
    <ellipse cx={32} cy={57} rx={5.2} ry={3.1} fill="#F8A6B4" opacity={o} />
    <ellipse cx={68} cy={57} rx={5.2} ry={3.1} fill="#F8A6B4" opacity={o} />
  </g>
)

const smile = (
  <path
    key="sm"
    d="M46 59 Q50 61.6 54 59"
    stroke={E}
    strokeWidth={2.1}
    fill="none"
    strokeLinecap="round"
  />
)

/** 표정별 얼굴 SVG 조각 (viewBox 0 0 100 100). */
function faceFor(mood: MascotMood): ReactNode {
  switch (mood) {
    case 'happy':
      return [blush(), eye(41), eye(59), smile]
    case 'teary':
      return [
        blush(0.5),
        eyeBig(41),
        eyeBig(59),
        <path key="tear" d="M63.5 55 q-1.8 3.6 0 5.2 q1.8 -1.6 0 -5.2 Z" fill="#A7D8F2" />,
        <path
          key="mouth"
          d="M46.5 60 q1.8 -1.7 3.5 0 t3.5 0"
          stroke={E}
          strokeWidth={1.9}
          fill="none"
          strokeLinecap="round"
        />,
      ]
    case 'sleepy':
      return [
        blush(),
        <path key="l" d="M37 50.5 Q40.5 53.8 44 50.5" stroke={E} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
        <path key="r" d="M56 50.5 Q59.5 53.8 63 50.5" stroke={E} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
        <path key="m" d="M47.5 59.5 Q50 61.2 52.5 59.5" stroke={E} strokeWidth={1.9} fill="none" strokeLinecap="round" />,
        <text key="z1" x={67} y={40} fontSize={10} fontWeight={700} fill={E} opacity={0.5}>z</text>,
        <text key="z2" x={73} y={33} fontSize={7.5} fontWeight={700} fill={E} opacity={0.36}>z</text>,
      ]
    case 'hungry':
      return [
        blush(),
        eye(41),
        eye(59),
        <ellipse key="mo" cx={50} cy={59.8} rx={2.8} ry={2.3} fill={E} />,
        <path key="tongue" d="M48.2 60.2 Q50 62.1 51.8 60.2 Z" fill="#F58FA0" />,
        <path key="drool" d="M53 59.8 q.9 2.7 0 4 q-.9 -1.3 0 -4 Z" fill="#A7D8F2" opacity={0.8} />,
      ]
    case 'focus':
      return [
        blush(),
        eye(41),
        eye(59),
        smile,
        <path
          key="star"
          d="M70 14 l1.1 2.4 2.6 .4 -1.9 1.8 .45 2.6 -2.3-1.3 -2.3 1.3 .45-2.6 -1.9-1.8 2.6-.4 Z"
          fill="#FFCF6B"
        />,
      ]
    case 'confused':
      return [
        blush(),
        eye(41),
        <path key="r" d="M56 51 Q59.5 48.6 63 51" stroke={E} strokeWidth={2.2} fill="none" strokeLinecap="round" />,
        <path key="m" d="M46.5 60 q1.8 -1.7 3.5 0 t3.5 0" stroke={E} strokeWidth={1.9} fill="none" strokeLinecap="round" />,
        <text key="q" x={68} y={34} fontSize={14} fontWeight={700} fill="#8A7CA0">?</text>,
      ]
    case 'calm':
      return [
        blush(0.4),
        <path key="l" d="M38 51.5 Q41 49 44 51.5" stroke={E} strokeWidth={2.1} fill="none" strokeLinecap="round" />,
        <path key="r" d="M56 51.5 Q59 49 62 51.5" stroke={E} strokeWidth={2.1} fill="none" strokeLinecap="round" />,
        <path key="m" d="M46.5 59 Q50 61.4 53.5 59" stroke={E} strokeWidth={2} fill="none" strokeLinecap="round" />,
      ]
  }
}

export interface MascotProps {
  mood?: MascotMood
  /** 크기(px). CSS 변수 --s로 전달되어 그림자/애니메이션이 비례 조정된다. */
  size?: number
  /** 그라데이션 덮어쓰기. 없으면 기분별 기본값. */
  gradient?: string
  /** squish 애니메이션 시작 지연 (여러 캐릭터를 어긋나게). */
  delay?: string
  className?: string
  ariaLabel?: string
}

/**
 * 모찌 캐릭터. 둥근 말랑한 바디 + 표정 SVG.
 * 크기/그라데이션은 CSS 변수로 조절. reduced-motion에서 squish 정지.
 */
export function Mascot({ mood = 'happy', size = 80, gradient, delay, className, ariaLabel }: MascotProps) {
  const style = {
    '--s': `${size}px`,
    '--g': gradient ?? MASCOT_GRADIENTS[mood],
    '--d': delay ?? '0s',
  } as CSSProperties

  return (
    <div
      className={`mochi${className ? ` ${className}` : ''}`}
      style={style}
      role="img"
      aria-label={ariaLabel ?? `모드 캐릭터 (${mood})`}
    >
      <div className="mochi__body">
        <svg className="mochi__face" viewBox="0 0 100 100" preserveAspectRatio="none">
          {faceFor(mood)}
        </svg>
      </div>
    </div>
  )
}
