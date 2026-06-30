import { useEffect, useRef, useState } from 'react'
import './charts.css'

const W = 320
const H = 150
const PX = 16
const PY = 22

interface Pt {
  x: number
  y: number
}

/** Catmull-Rom 풍 부드러운 spline path (시안 spline() 포팅). */
function spline(p: Pt[]): string {
  let s = `M ${p[0].x} ${p[0].y}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    s += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`
  }
  return s
}

export interface FlowGraphProps {
  /** 0~1 정규화된 mock 값 배열. (실제 데이터 계산은 후속 단계 엔진에서) */
  data: number[]
  color: string
  uid: string
}

/** 부드러운 선그래프 + area fill + 마지막 점 강조. 외부 차트 라이브러리 미사용. */
export function FlowGraph({ data, color, uid }: FlowGraphProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true)
            io.disconnect()
          }
        })
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const n = data.length
  const pts: Pt[] = data.map((v, i) => ({
    x: +(PX + (i * (W - 2 * PX)) / (n - 1)).toFixed(1),
    y: +(PY + (1 - v) * (H - 2 * PY)).toFixed(1),
  }))
  const line = spline(pts)
  const area = `${line} L ${pts[n - 1].x} ${H} L ${pts[0].x} ${H} Z`
  const last = pts[n - 1]
  const gid = `flow-${uid}`

  return (
    <svg ref={ref} className={`flow${shown ? ' flow--in' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="흐름 그래프">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.3" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="flow__area" d={area} fill={`url(#${gid})`} />
      <path
        className="flow__line"
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
      {pts.map((p, i) => (
        <circle key={i} className="flow__smdot" cx={p.x} cy={p.y} r={2.3} fill={color} />
      ))}
      <circle className="flow__ping" cx={last.x} cy={last.y} r={5} fill="none" stroke={color} strokeWidth={2} />
      <circle className="flow__dot" cx={last.x} cy={last.y} r={4.4} fill={color} />
      <circle className="flow__dot" cx={last.x} cy={last.y} r={1.7} fill="#fff" />
    </svg>
  )
}
