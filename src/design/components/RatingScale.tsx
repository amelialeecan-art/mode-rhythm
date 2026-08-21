import { useRef, type KeyboardEvent } from 'react'
import type { ChipTone } from './Chip'
import type { RatingValue } from '../../data/modelsV2'
import './ratingScale.css'

export interface RatingScaleProps {
  /** 질문 텍스트 = 접근성 그룹 라벨. */
  label: string
  /** 현재 값. null = 미선택(미측정). number(0~10) 또는 'unknown'(모름). */
  value: RatingValue
  onChange: (value: RatingValue) => void
  /** 0 쪽/10 쪽 양극 짧은 설명. */
  lowLabel?: string
  highLabel?: string
  tone?: ChipTone
}

// 0~10 눈금 + '모름'을 하나의 radiogroup 옵션열로 다룬다(roving tabindex).
const NUMBERS = Array.from({ length: 11 }, (_, i) => i)
type Option = number | 'unknown'
const OPTIONS: Option[] = [...NUMBERS, 'unknown']

function optionEquals(value: RatingValue, opt: Option): boolean {
  return value === opt
}

/**
 * 0~10 정수 rating 입력.
 * - 버튼/터치 기반(자유 텍스트 아님), 작은 화면에서 사용 가능.
 * - 0 = "전혀 없음", 10 = "매우 강함"(양극 라벨로 표시).
 * - '모름'(unknown) 별도 선택 가능.
 * - 선택한 값을 다시 누르면 미선택(null)으로 되돌아간다("지우기" 버튼도 제공).
 * - radiogroup + roving tabindex로 키보드/접근성 유지.
 * ⚠️ 미선택은 null이며 저장 시 0으로 바뀌지 않는다(호출부 정책).
 */
export function RatingScale({ label, value, onChange, lowLabel = '없음', highLabel = '매우 강함', tone = 'lav' }: RatingScaleProps) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = OPTIONS.findIndex((o) => optionEquals(value, o))
  // 포커스 진입 지점: 선택값이 있으면 그 옵션, 없으면 첫 옵션(0).
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : 0

  const choose = (opt: Option) => {
    // 같은 값을 다시 누르면 미선택(null)로.
    onChange(optionEquals(value, opt) ? null : opt)
  }

  const focusAt = (i: number) => {
    const clamped = Math.max(0, Math.min(OPTIONS.length - 1, i))
    btnRefs.current[clamped]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        focusAt(index + 1)
        onChange(OPTIONS[Math.min(OPTIONS.length - 1, index + 1)])
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusAt(index - 1)
        onChange(OPTIONS[Math.max(0, index - 1)])
        break
      case 'Home':
        e.preventDefault()
        focusAt(0)
        onChange(OPTIONS[0])
        break
      case 'End':
        e.preventDefault()
        focusAt(OPTIONS.length - 1)
        onChange(OPTIONS[OPTIONS.length - 1])
        break
      // Space/Enter는 기본 click으로 처리(선택/해제 토글).
      default:
        break
    }
  }

  return (
    <div className={`rating rating--${tone}`}>
      <div className="rating__head">
        <span className="rating__label">{label}</span>
        {value !== null && (
          <button type="button" className="rating__clear" onClick={() => onChange(null)}>
            지우기
          </button>
        )}
      </div>
      {/* 같은 metric이 아침/저녁 카드에 동시에 렌더될 수 있어 id 대신 aria-label 사용(중복 id 방지). */}
      <div className="rating__scale" role="radiogroup" aria-label={label}>
        {OPTIONS.map((opt, i) => {
          const checked = optionEquals(value, opt)
          const isUnknown = opt === 'unknown'
          const aria =
            opt === 0 ? '0, 전혀 없음' : opt === 10 ? '10, 매우 강함' : isUnknown ? '모름' : String(opt)
          return (
            <button
              key={String(opt)}
              type="button"
              ref={(el) => {
                btnRefs.current[i] = el
              }}
              role="radio"
              aria-checked={checked}
              aria-label={aria}
              tabIndex={i === rovingIndex ? 0 : -1}
              className={`rating__opt${isUnknown ? ' rating__opt--unknown' : ''}${checked ? ' rating__opt--on' : ''}`}
              onClick={() => choose(opt)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {isUnknown ? '모름' : opt}
            </button>
          )
        })}
      </div>
      <div className="rating__ends" aria-hidden="true">
        <span>{`0 ${lowLabel}`}</span>
        <span>{`10 ${highLabel}`}</span>
      </div>
    </div>
  )
}
