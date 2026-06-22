import type { CSSProperties, ReactNode } from 'react'
import './components.css'

export type GlassTint = 'plain' | 'lav' | 'mint' | 'yellow' | 'coral' | 'sky'

export interface GlassCardProps {
  children: ReactNode
  tint?: GlassTint
  className?: string
  style?: CSSProperties
}

/** 둥근 글래스모피즘 카드. MODE의 기본 컨테이너. */
export function GlassCard({ children, tint = 'plain', className, style }: GlassCardProps) {
  return (
    <section className={`glass-card glass-card--${tint}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </section>
  )
}
