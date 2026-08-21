import { useRef, useState } from 'react'
import './charts.css'

const W = 320
const H = 212
const PX = 14
const PY_TOP = 16
const PY_BOTTOM = 30 // 하단 날짜 눈금 자리

export type RhythmPhase = 'period' | 'premenstrual' | 'ovulation'

export interface RhythmSeries {
  key: string
  /** 범례·툴팁용 한글 이름. */
  label: string
  color: string
  /** 중립 지표(식욕)면 true — 좋고 나쁨을 강제하지 않음(툴팁 표기용). */
  neutral?: boolean
  /** 그릴 위치용 표시값 0~100(방향 통일됨). undefined는 기록 없음(선 끊김). */
  values: (number | undefined)[]
  /** 툴팁에 보여줄 원본 값 0~100(방향 그대로). undefined는 기록 없음. */
  raw: (number | undefined)[]
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
  /** 슬롯별 툴팁 날짜 라벨(길이 = count). 없으면 툴팁 비활성. */
  tooltipDates?: string[]
  /** 중앙 기준선 라벨(예: '평소'). */
  baselineLabel?: string
  /** 위=편안 / 아래=힘듦 방향 라벨 표시. */
  showDirection?: boolean
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
 * - 끊긴 구간(기록 없음)은 선을 잇지 않는다(0으로 채우지 않음).
 * - 하단에 날짜 눈금, 가운데 '평소' 기준선, 오늘 기준선.
 * - 포인터를 올리면 그 날짜의 원본 값을 툴팁으로 보여준다(외부 라이브러리 미사용).
 */
export function RhythmChart({
  count,
  series,
  phases,
  todayIndex,
  xTicks,
  tooltipDates,
  baselineLabel,
  showDirection,
}: RhythmChartProps) {
  const n = Math.max(count, 1)
  const plotBottom = H - PY_BOTTOM
  const x = (i: number) => (n > 1 ? PX + (i * (W - 2 * PX)) / (n - 1) : W / 2)
  const y = (v: number) => PY_TOP + (1 - v / 100) * (plotBottom - PY_TOP)
  const cell = n > 1 ? (W - 2 * PX) / (n - 1) : W - 2 * PX

  const wrapRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const nearestIndex = (clientX: number): number | null => {
    const el = wrapRef.current
    if (!el || n <= 1) return n === 1 ? 0 : null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return null
    const vbX = ((clientX - rect.left) / rect.width) * W
    const i = Math.round((vbX - PX) / ((W - 2 * PX) / (n - 1)))
    return Math.max(0, Math.min(n - 1, i))
  }

  const onMove = (e: React.PointerEvent) => setActive(nearestIndex(e.clientX))
  const onLeave = () => setActive(null)

  // 활성 인덱스에 실제로 값이 있는 시리즈만 툴팁에 표시.
  const activeRows =
    active !== null
      ? series
          .map((s) => ({ label: s.label, color: s.color, raw: s.raw[active] }))
          .filter((r) => r.raw !== undefined)
      : []
  const tipDate = active !== null && tooltipDates ? tooltipDates[active] : undefined
  const showTip = active !== null && activeRows.length > 0 && tipDate !== undefined
  const tipLeftPct = active !== null ? (x(active) / W) * 100 : 0

  return (
    <div
      className="rhythm-wrap"
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={onLeave}
    >
      <svg className="rhythm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="리듬 변화 그래프">
        {/* 주기 오버레이 띠 */}
        {phases.map((p, i) =>
          p ? (
            <rect
              key={`ph-${i}`}
              x={x(i) - cell / 2}
              y={PY_TOP}
              width={cell}
              height={plotBottom - PY_TOP}
              fill={PHASE_COLOR[p]}
              opacity={0.14}
            />
          ) : null,
        )}

        {/* 중앙 기준선 (평소 = 50) */}
        <line x1={PX} y1={y(50)} x2={W - PX} y2={y(50)} stroke="rgba(120,90,180,.16)" strokeWidth={1} strokeDasharray="3 4" />
        {baselineLabel && (
          <text x={W - PX} y={y(50) - 3} textAnchor="end" className="rhythm-baseline-t">
            {baselineLabel}
          </text>
        )}

        {/* 방향 라벨 (위=편안 / 아래=힘듦) */}
        {showDirection && (
          <>
            <text x={PX} y={PY_TOP + 2} className="rhythm-dir-t">
              ↑ 편안
            </text>
            <text x={PX} y={plotBottom - 2} className="rhythm-dir-t">
              ↓ 힘듦
            </text>
          </>
        )}

        {/* 활성 세로선(크로스헤어) */}
        {active !== null && (
          <line x1={x(active)} y1={PY_TOP} x2={x(active)} y2={plotBottom} stroke="rgba(67,49,122,.28)" strokeWidth={1} />
        )}

        {/* 오늘 기준선 */}
        {todayIndex >= 0 && (
          <line x1={x(todayIndex)} y1={PY_TOP - 4} x2={x(todayIndex)} y2={plotBottom + 4} stroke="#43317A" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
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
              {/* 활성 지점의 점 강조 */}
              {active !== null && s.values[active] !== undefined && (
                <circle cx={x(active)} cy={y(s.values[active]!)} r={3.4} fill="#fff" stroke={s.color} strokeWidth={2} />
              )}
            </g>
          )
        })}

        {/* 하단 x축 날짜 눈금 */}
        {xTicks.map((t) => (
          <text key={`xt-${t.index}`} x={x(t.index)} y={H - 10} textAnchor="middle" className="rhythm-x-t">
            {t.label}
          </text>
        ))}
      </svg>

      {showTip && (
        <div className="rhythm-tip" style={{ left: `${tipLeftPct}%` }} role="tooltip">
          <div className="rhythm-tip__date">{tipDate}</div>
          {activeRows.map((r) => (
            <div className="rhythm-tip__row" key={r.label}>
              <span className="rhythm-tip__dot" style={{ background: r.color }} />
              <span className="rhythm-tip__name">{r.label}</span>
              <span className="rhythm-tip__val">{r.raw}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
