import type { EventCategory } from '../types'
import { EVENT_CATEGORY_LABEL } from './events'

/**
 * 커스텀 사건 입력 보조.
 * 이번 단계는 단순 규칙으로 factorGroup을 만든다(NLP/자동 병합 없음).
 * 비슷한 커스텀 요인 병합은 후속 단계에서 개선한다.
 */

/** 커스텀 사건에서 고를 수 있는 카테고리(기존 EventCategory에 맞춤). */
export const CUSTOM_EVENT_CATEGORIES: { code: EventCategory; label: string }[] = [
  { code: 'sleep', label: EVENT_CATEGORY_LABEL.sleep },
  { code: 'food', label: EVENT_CATEGORY_LABEL.food },
  { code: 'relationship', label: EVENT_CATEGORY_LABEL.relationship },
  { code: 'work', label: EVENT_CATEGORY_LABEL.work },
  { code: 'body', label: EVENT_CATEGORY_LABEL.body },
  { code: 'appearance', label: EVENT_CATEGORY_LABEL.appearance },
  { code: 'environment', label: EVENT_CATEGORY_LABEL.environment },
  { code: 'digital', label: EVENT_CATEGORY_LABEL.digital },
  { code: 'movement', label: EVENT_CATEGORY_LABEL.movement },
  { code: 'unknown', label: '기타' },
]

/** 라벨을 간단한 slug로 (영숫자/한글만 남기고 '_'). */
function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w가-힣]/g, '')
    .slice(0, 24)
}

/** custom_${category}_${slug} 형태의 factorGroup. slug가 비면 custom_${category}. */
export function makeCustomFactorGroup(category: EventCategory, label: string): string {
  const slug = slugify(label)
  return slug ? `custom_${category}_${slug}` : `custom_${category}`
}

/** 충돌 없는 커스텀 사건 코드. */
export function makeCustomEventCode(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}
