import './heatmap.css'

/** 캘린더 한 칸. intensity는 0~4 (옅음→짙음). label은 'all' 렌즈에서만 표시. */
export interface HeatmapDay {
  /** 1~31. null이면 빈 칸(자리맞춤). */
  day: number | null
  /** 0~4 색 단계. 미기록일은 undefined. */
  intensity?: number
  /** 짧은 라벨 (안정/예민/식욕/회복/집중/미제). 아이콘 대신 텍스트만. */
  label?: string
  today?: boolean
}

/** 렌즈별 색 ramp (옅음→짙음). 시안 RAMP 포팅. */
export const LENS_RAMP: Record<string, string[]> = {
  all: ['#F3E9F6', '#F2D4DF', '#ECAEBF', '#DD8AAE', '#BE6E9C'],
  감정: ['#F2ECFB', '#DECFF4', '#C2ABE6', '#A284D2', '#8467BC'],
  식욕: ['#FCEEE5', '#F8D3BE', '#F2B197', '#E88E72', '#D26B4F'],
  수면: ['#EAF1FA', '#CCDDF1', '#A2C0E6', '#6E97D4', '#4774B0'],
  몸: ['#E6F3F0', '#C4E5DC', '#94D2C5', '#56B3A4', '#2E9183'],
  주기: ['#FBEBF1', '#F4CCDB', '#E9A6C0', '#D67BA0', '#B95A82'],
  회복: ['#E6F4EC', '#C6E8D5', '#98D9B8', '#5DBE95', '#329C74'],
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const DARK = '#3D3552'

export interface HeatmapCalendarProps {
  /** 7의 배수가 되도록 앞쪽 빈 칸 포함한 날짜 배열. */
  days: HeatmapDay[]
  /** 활성 렌즈 키. 'all'이면 라벨까지 표시, 그 외엔 색 진함만. */
  lens: string
  onSelectDay?: (day: number) => void
}

/**
 * 월간 캘린더 히트맵. 색 진함 + 짧은 라벨 중심 (작은 아이콘 금지).
 * 렌즈에 따라 색 ramp가 바뀐다.
 */
export function HeatmapCalendar({ days, lens, onSelectDay }: HeatmapCalendarProps) {
  const ramp = LENS_RAMP[lens] ?? LENS_RAMP.all
  const showWord = lens === 'all'

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
        {days.map((d, i) => {
          if (d.day === null) return <div key={`b${i}`} />
          if (d.intensity === undefined) {
            return (
              <div key={d.day} className="cell cell--empty">
                <span className="cell__n">{d.day}</span>
              </div>
            )
          }
          const bg = ramp[d.intensity]
          const txt = d.intensity >= 3 ? '#fff' : DARK
          return (
            <button
              key={d.day}
              className={`cell${d.today ? ' cell--today' : ''}`}
              style={{ background: bg }}
              onClick={() => onSelectDay?.(d.day as number)}
            >
              <span className="cell__n" style={{ color: txt }}>
                {d.day}
              </span>
              {showWord && d.label && (
                <span className="cell__w" style={{ color: txt }}>
                  {d.label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="scalebar">
        <span className="scalebar__t">옅음 · 좋음</span>
        <span
          className="scalebar__g"
          style={{ background: `linear-gradient(90deg,${ramp.join(',')})` }}
        />
        <span className="scalebar__t">짙음 · 힘듦</span>
      </div>
      <p className="callegend">
        짙은 칸이 많을수록 힘든 시기 · 렌즈를 누르면 그 항목 기준으로 색이 바뀌어요
      </p>
    </div>
  )
}
