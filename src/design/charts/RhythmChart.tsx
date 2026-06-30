import './charts.css'

const W = 320
const H = 184
const PX = 12
const PY = 14

export type RhythmPhase = 'period' | 'premenstrual' | 'ovulation'

export interface RhythmSeries {
  key: string
  color: string
  /** 0~100 값 배열. undefined는 기록 없음(선 끊김). */
  values: (number | undefined)[]
}

export interface RhythmChartProps {
  /** x축 슬롯 수(= 날짜 수). */
  count: number
  series: RhythmSeries[]
  /** 날짜별 주기 구간(없으면 null). 길이 = count. */
  phases: (RhythmPhase | null)[]
  /** today 인덱스(-1이면 표시 안 함). */
  todayIndex: number
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

/** 다중 선그래프 + 주기 오버레이 + 오늘 기준선. 외부 라이브러리 미사용. */
export function RhythmChart({ count, series, phases, todayIndex }: RhythmChartProps) {
  const n = Math.max(count, 1)
  const x = (i: number) => (n > 1 ? PX + (i * (W - 2 * PX)) / (n - 1) : W / 2)
  const y = (v: number) => PY + (1 - v / 100) * (H - 2 * PY)
  const cell = n > 1 ? (W - 2 * PX) / (n - 1) : W - 2 * PX

  return (
    <svg className="rhythm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="리듬 변화 그래프">
      {/* 주기 오버레이 띠 */}
      {phases.map((p, i) =>
        p ? (
          <rect
            key={`ph-${i}`}
            x={x(i) - cell / 2}
            y={PY}
            width={cell}
            height={H - 2 * PY}
            fill={PHASE_COLOR[p]}
            opacity={0.14}
          />
        ) : null,
      )}

      {/* 중앙 기준선 (50) */}
      <line x1={PX} y1={y(50)} x2={W - PX} y2={y(50)} stroke="rgba(120,90,180,.16)" strokeWidth={1} strokeDasharray="3 4" />

      {/* 오늘 기준선 */}
      {todayIndex >= 0 && (
        <line x1={x(todayIndex)} y1={PY - 4} x2={x(todayIndex)} y2={H - PY + 4} stroke="#43317A" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
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
          </g>
        )
      })}
    </svg>
  )
}
