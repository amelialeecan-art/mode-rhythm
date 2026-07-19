import type { EventResponsePoint } from '../../engine'

const W = 300
const H = 118
const PX = 14
const PY = 12
const AXIS = 18 // x축 라벨 영역

function relLabel(rel: number): string {
  if (rel === 0) return '당일'
  return rel < 0 ? `${-rel}일 전` : `${rel}일 후`
}

/**
 * 사건 전후 변화 미니 그래프. 사건선(선택 metric) + 평소 기준선 두 개만.
 * x축은 상대 날짜, 0일은 세로 기준선. y축 숫자는 표시하지 않음(근거 보기에만).
 * 기존 SVG만 사용, viewBox로 모바일 폭에 맞춤(가로 스크롤 없음).
 */
export function EventResponseChart({ points, baseline, color }: { points: EventResponsePoint[]; baseline: number; color: string }) {
  const rels = points.map((p) => p.rel)
  const minRel = Math.min(...rels)
  const maxRel = Math.max(...rels)
  const span = Math.max(maxRel - minRel, 1)
  const x = (rel: number) => PX + ((rel - minRel) / span) * (W - 2 * PX)
  const y = (v: number) => PY + (1 - v / 100) * (H - AXIS - 2 * PY)

  // 사건선: 값이 있는 점만 연결(결측은 끊음)
  const segs: { rel: number; v: number }[][] = []
  let cur: { rel: number; v: number }[] = []
  for (const p of points) {
    if (p.mean === undefined) {
      if (cur.length) segs.push(cur)
      cur = []
    } else cur.push({ rel: p.rel, v: p.mean })
  }
  if (cur.length) segs.push(cur)

  const ticks = [minRel, 0, maxRel].filter((v, i, a) => a.indexOf(v) === i && v >= minRel && v <= maxRel)

  return (
    <svg className="er-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="사건 전후 변화 그래프">
      {/* 평소 기준선 */}
      <line x1={PX} y1={y(baseline)} x2={W - PX} y2={y(baseline)} stroke="rgba(120,90,180,.35)" strokeWidth={1} strokeDasharray="4 4" />
      <text x={W - PX} y={y(baseline) - 4} textAnchor="end" className="er-baseline-t">평소</text>

      {/* 0일 세로 기준선 */}
      {0 >= minRel && 0 <= maxRel && (
        <line x1={x(0)} y1={PY} x2={x(0)} y2={H - AXIS - PY} stroke="#43317A" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.6} />
      )}

      {/* 사건선 */}
      {segs.map((seg, si) =>
        seg.length === 1 ? (
          <circle key={si} cx={x(seg[0].rel)} cy={y(seg[0].v)} r={2.8} fill={color} />
        ) : (
          <polyline
            key={si}
            points={seg.map((p) => `${x(p.rel)},${y(p.v)}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
      {points.map((p) => (p.mean !== undefined ? <circle key={p.rel} cx={x(p.rel)} cy={y(p.mean)} r={2.4} fill={color} /> : null))}

      {/* x축 라벨(상대 날짜만, 최소한) */}
      {ticks.map((rel) => (
        <text key={rel} x={x(rel)} y={H - 4} textAnchor="middle" className="er-x-t">
          {relLabel(rel)}
        </text>
      ))}
    </svg>
  )
}
