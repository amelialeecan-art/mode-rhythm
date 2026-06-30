import './components.css'

export interface LensOption {
  key: string
  label: string
}

export interface LensTabsProps {
  options: LensOption[]
  active: string
  onChange: (key: string) => void
}

/** 캘린더/분석의 렌즈 전환 알약 탭 (전체·감정·식욕·수면·몸·주기·회복). */
export function LensTabs({ options, active, onChange }: LensTabsProps) {
  return (
    <div className="lens" role="tablist" aria-label="렌즈">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={o.key === active}
          className={`lens__pill${o.key === active ? ' lens__pill--on' : ''}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
