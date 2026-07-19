import type { CyclePoint } from '../../engine'

const W = 320
const H = 150
const PX = 14
const PY = 12
const AXIS = 18

function relLabel(rel: number): string {
  if (rel === 0) return '생리 시작'
  return rel < 0 ? `${-rel}일 전` : `${rel}일 후`
}

function segments(points: CyclePoint[]): { rel: number; v: number }[][] {
  const segs: { rel: number; v: number }[][] = []
  let cur: { rel: number; v: number }[] = []
  for (const p of points) {
    if (p.mean === undefined) {
      if (cur.length) segs.push(cur)
      cur = []
    } else cur.push({ rel: p.rel, v: p.mean })
  }
  if (cur.length) segs.push(cur)
  return segs
}

/**
 * 생리주기 비교 그래프. 최근 주기(굵은 선) + 이전 3주기 평균(흐린 선) 두 개만.
 * 0일(생리 시작) 세로 기준선 + 생리 중 배경. x축은 상대 주기일만.
 * 기존 SVG만 사용, viewBox로 모바일 폭에 맞춤(가로 스크롤 없음).
 */
export function CycleCompareChart({
  recent,
  previous,
  color,
  relMin,
  relMax,
  periodLen,
}: {
  recent: CyclePoint[]
  previous: CyclePoint[]
  color: string
  relMin: number
  relMax: number
  periodLen: number
}) {
  const span = Math.max(relMax - relMin, 1)
  const x = (rel: number) => PX + ((rel - relMin) / span) * (W - 2 * PX)
  const y = (v: number) => PY + (1 - v / 100) * (H - AXIS - 2 * PY)
  const periodEnd = Math.min(periodLen - 1, relMax)
  const ticks = [relMin, -7, 0, relMax].filter((v, i, a) => a.indexOf(v) === i && v >= relMin && v <= relMax)

  const line = (points: CyclePoint[], stroke: string, width: number, opacity: number) =>
    segments(points).map((seg, si) =>
      seg.length === 1 ? (
        <circle key={si} cx={x(seg[0].rel)} cy={y(seg[0].v)} r={2.6} fill={stroke} opacity={opacity} />
      ) : (
        <polyline
          key={si}
          points={seg.map((p) => `${x(p.rel)},${y(p.v)}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      ),
    )

  return (
    <svg className="cc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="생리주기 비교 그래프">
      {/* 생리 중 배경 */}
      <rect x={x(0)} y={PY} width={Math.max(x(periodEnd) - x(0), 3)} height={H - AXIS - 2 * PY} fill="#E58BBE" opacity={0.12} />
      {/* 0일 세로 기준선 */}
      <line x1={x(0)} y1={PY} x2={x(0)} y2={H - AXIS - PY} stroke="#E58BBE" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.8} />

      {/* 이전 3주기 평균(흐린 선) */}
      {line(previous, 'var(--ink-3, #9aa0b5)', 1.6, 0.55)}
      {/* 최근 주기(굵은 선) */}
      {line(recent, color, 2.8, 1)}

      {/* x축 라벨 */}
      {ticks.map((rel) => (
        <text key={rel} x={x(rel)} y={H - 4} textAnchor="middle" className="cc-x-t">
          {relLabel(rel)}
        </text>
      ))}
    </svg>
  )
}
