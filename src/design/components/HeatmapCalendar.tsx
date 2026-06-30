import './heatmap.css'

/** 캘린더 한 칸. */
export interface HeatmapCell {
  /** 선택 식별자(ISODate). 패딩칸은 없음. */
  id?: string
  /** 표시할 날짜 숫자. 패딩칸은 0/undefined 가능. */
  dayNumber?: number
  /** 0~4 색 단계. 미기록일은 undefined(연한 빈칸). */
  intensity?: number
  /** 짧은 라벨 (dayType 기반). 아이콘 대신 텍스트만. */
  label?: string
  today?: boolean
  /** 현재 월이 아닌 패딩칸(빈칸 렌더). */
  padding?: boolean
}

/** 렌즈별 색 ramp (옅음→짙음, 5단계). 디자인 톤 유지 + 사건 ramp 추가. */
export const LENS_RAMP: Record<string, string[]> = {
  overall: ['#F3E9F6', '#F2D4DF', '#ECAEBF', '#DD8AAE', '#BE6E9C'],
  emotion: ['#F2ECFB', '#DECFF4', '#C2ABE6', '#A284D2', '#8467BC'],
  appetite: ['#FCEEE5', '#F8D3BE', '#F2B197', '#E88E72', '#D26B4F'],
  sleep: ['#EAF1FA', '#CCDDF1', '#A2C0E6', '#6E97D4', '#4774B0'],
  body: ['#E6F3F0', '#C4E5DC', '#94D2C5', '#56B3A4', '#2E9183'],
  cycle: ['#FBEBF1', '#F4CCDB', '#E9A6C0', '#D67BA0', '#B95A82'],
  event: ['#FFF3D6', '#FFE0AE', '#FFC882', '#F7A86A', '#E07E4F'],
  recovery: ['#E6F4EC', '#C6E8D5', '#98D9B8', '#5DBE95', '#329C74'],
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DARK = '#3D3552'

export interface HeatmapCalendarProps {
  cells: HeatmapCell[]
  /** 활성 렌즈 키 (색 ramp 선택). */
  lens: string
  onSelect?: (id: string) => void
}

/**
 * 월간 캘린더 히트맵. 색 진함 + 짧은 라벨 중심 (작은 아이콘 금지).
 * 색은 렌즈 점수 기준, 라벨은 dayType 기준(렌즈 무관).
 */
export function HeatmapCalendar({ cells, lens, onSelect }: HeatmapCalendarProps) {
  const ramp = LENS_RAMP[lens] ?? LENS_RAMP.overall

  return (
    <div className="calcard">
      <div className="dow">
        {DOW.map((d, i) => (
          <span key={d} className={i === 0 ? 'dow__sun' : undefined}>
            {d}
          </span>
        ))}
      </div>
      <div className="grid">
        {cells.map((c, i) => {
          // 패딩칸: 빈 칸
          if (c.padding || c.dayNumber == null) return <div key={`pad-${i}`} className="cell cell--pad" />

          // 기록 없음: 아주 연한 빈칸 (날짜만, 클릭 가능)
          if (c.intensity === undefined) {
            return (
              <button
                key={c.id ?? i}
                className={`cell cell--empty${c.today ? ' cell--today' : ''}`}
                onClick={() => c.id && onSelect?.(c.id)}
              >
                <span className="cell__n">{c.dayNumber}</span>
              </button>
            )
          }

          const level = Math.max(0, Math.min(4, c.intensity))
          const bg = ramp[level]
          const txt = level >= 3 ? '#fff' : DARK
          return (
            <button
              key={c.id ?? i}
              className={`cell${c.today ? ' cell--today' : ''}`}
              style={{ background: bg }}
              onClick={() => c.id && onSelect?.(c.id)}
            >
              <span className="cell__n" style={{ color: txt }}>
                {c.dayNumber}
              </span>
              {c.label && (
                <span className="cell__w" style={{ color: txt }}>
                  {c.label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="scalebar">
        <span className="scalebar__t">옅음 · 낮음</span>
        <span className="scalebar__g" style={{ background: `linear-gradient(90deg,${ramp.join(',')})` }} />
        <span className="scalebar__t">짙음 · 높음</span>
      </div>
    </div>
  )
}
