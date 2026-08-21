import { Chip, ChipGroup } from '../../../design'
import type { ChipTone } from '../../../design'
import type { TriBoolean } from '../../../data/modelsV2'

interface TriChoiceProps {
  label: string
  value: TriBoolean | undefined
  onChange: (v: TriBoolean) => void
  tone?: ChipTone
}

/**
 * 예 / 아니오 / 모름 3분 선택. 다시 누르면 미입력(null)로.
 * ⚠️ 미입력을 false로 처리하지 않는다 — 세 상태를 명확히 구분한다.
 *   value: true(예) / false(아니오) / 'unknown'(모름) / null·undefined(미입력)
 */
export function TriChoice({ label, value, onChange, tone = 'coral' }: TriChoiceProps) {
  const pick = (v: TriBoolean) => onChange(value === v ? null : v)
  return (
    <div className="tri">
      <p className="event-group__label">{label}</p>
      <ChipGroup label={label}>
        <Chip label="예" tone={tone} selected={value === true} onToggle={() => pick(true)} />
        <Chip label="아니오" tone={tone} selected={value === false} onToggle={() => pick(false)} />
        <Chip label="모름" tone="neutral" selected={value === 'unknown'} onToggle={() => pick('unknown')} />
      </ChipGroup>
    </div>
  )
}
