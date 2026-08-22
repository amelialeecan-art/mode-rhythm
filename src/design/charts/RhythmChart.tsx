import { useRef } from 'react'
import './charts.css'

const W = 320
const H = 200
const PX = 14
const PY_TOP = 14
const PY_BOTTOM = 28 // 하단 날짜 눈금 자리

export type RhythmPhase = 'period' | 'premenstrual' | 'ovulation'

export interface RhythmSeries {
  key: string
  color: string
  /** 그릴 위치용 표시값 0~100. undefined는 기록 없음(선 끊김). */
  values: (number | undefined)[]
}

export interface RhythmXTick {
  index: number
  label: string
}

export interface RhythmChartProps {
  /** x축 슬롯 수(= 날짜 수). */
  count: number
  series: RhythmSeries[]
  /** 날짜별 주기 구간(없으면 null). 길이 = count. */
  phases: (RhythmPhase | null)[]
  /** today 인덱스(-1이면 표시 안 함). */
  todayIndex: number
  /** 하단 x축 날짜 눈금(균등 간격). */
  xTicks: RhythmXTick[]
  /** 선택된(탭한) 슬롯 인덱스. null이면 없음. */
  selectedIndex: number | null
  /** 슬롯을 탭하면 그 인덱스를 알린다(모바일: 탭하면 유지). */
  onSelect: (index: number) => void
}

const PHASE_COLOR: Record<RhythmPhase, string> = {
  period: '#E58BBE',
  premenstrual: '#FF9576',
  ovulation: '#74A8EC',
}

interface Pt {
  x: number
  y: number
}

function spline(p: Pt[]): string {
  if (p.length === 1) return ''
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

/**
 * 여러 지표를 같은 날짜축 위에 겹쳐 그리는 선그래프.
 * - 설명이 필요 없게, 선만 보이게 한다(기준선·방향 라벨 없음).
 * - 끊긴 구간(기록 없음)은 선을 잇지 않는다(0으로 채우지 않음).
 * - 하단 날짜 눈금 + 오늘 기준선 + 주기 오버레이 띠.
 * - 모바일: 그래프를 탭하면 가장 가까운 날짜가 선택되어 유지된다(hover 아님).
 * - 물리적 크기는 기간과 무관하게 고정(viewBox 고정, width 100%). 기간이 바뀌면
 *   슬롯 간격·눈금 밀도만 달라진다.
 */
export function RhythmChart({ count, series, phases, todayIndex, xTicks, selectedIndex, onSelect }: RhythmChartProps) {
  const n = Math.max(count, 1)
  const plotBottom = H - PY_BOTTOM
  const x = (i: number) => (n > 1 ? PX + (i * (W - 2 * PX)) / (n - 1) : W / 2)
  const y = (v: number) => PY_TOP + (1 - v / 100) * (plotBottom - PY_TOP)
  const cell = n > 1 ? (W - 2 * PX) / (n - 1) : W - 2 * PX

  const svgRef = useRef<SVGSVGElement>(null)

  const nearestIndex = (clientX: number): number | null => {
    const el = svgRef.current
    if (!el || n <= 1) return n === 1 ? 0 : null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return null
    const vbX = ((clientX - rect.left) / rect.width) * W
    const i = Math.round((vbX - PX) / ((W - 2 * PX) / (n - 1)))
    return Math.max(0, Math.min(n - 1, i))
  }
  const onTap = (e: React.PointerEvent) => {
    const i = nearestIndex(e.clientX)
    if (i !== null) onSelect(i)
  }

  return (
    <svg
      className="rhythm"
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="리듬 변화 그래프 — 탭하면 그날을 볼 수 있어"
      onPointerDown={onTap}
    >
      {/* 주기 오버레이 띠 */}
      {phases.map((p, i) =>
        p ? (
          <rect key={`ph-${i}`} x={x(i) - cell / 2} y={PY_TOP} width={cell} height={plotBottom - PY_TOP} fill={PHASE_COLOR[p]} opacity={0.14} />
        ) : null,
      )}

      {/* 선택된 날짜 세로 마커 (그래프를 가리지 않게 얇게) */}
      {selectedIndex !== null && selectedIndex >= 0 && (
        <line x1={x(selectedIndex)} y1={PY_TOP} x2={x(selectedIndex)} y2={plotBottom} stroke="rgba(67,49,122,.4)" strokeWidth={1.4} />
      )}

      {/* 오늘 기준선 */}
      {todayIndex >= 0 && (
        <line x1={x(todayIndex)} y1={PY_TOP - 4} x2={x(todayIndex)} y2={plotBottom + 4} stroke="#43317A" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.55} />
      )}

      {/* 각 시리즈: 끊긴 구간을 segment로 나눠 그림 */}
      {series.map((s) => {
        const segs: Pt[][] = []
        let cur: Pt[] = []
        s.values.forEach((v, i) => {
          if (v === undefined) {
            if (cur.length) segs.push(cur)
            cur = []
          } else {
            cur.push({ x: x(i), y: y(v) })
          }
        })
        if (cur.length) segs.push(cur)

        return (
          <g key={s.key}>
            {segs.map((seg, si) =>
              seg.length === 1 ? (
                <circle key={`d-${si}`} cx={seg[0].x} cy={seg[0].y} r={2.6} fill={s.color} />
              ) : (
                <path key={`p-${si}`} d={spline(seg)} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              ),
            )}
            {/* 선택 지점 강조 */}
            {selectedIndex !== null && selectedIndex >= 0 && s.values[selectedIndex] !== undefined && (
              <circle cx={x(selectedIndex)} cy={y(s.values[selectedIndex]!)} r={3.4} fill="#fff" stroke={s.color} strokeWidth={2} />
            )}
          </g>
        )
      })}

      {/* 하단 x축 날짜 눈금 */}
      {xTicks.map((t) => (
        <text key={`xt-${t.index}`} x={x(t.index)} y={H - 9} textAnchor="middle" className="rhythm-x-t">
          {t.label}
        </text>
      ))}
    </svg>
  )
}
