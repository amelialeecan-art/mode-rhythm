import { describe, expect, it } from 'vitest'
import { buildCheckpoint } from './checkpoint'
import type { CheckpointSignals } from '../../data/services/rhythmForecastService'

const sig = (p: Partial<CheckpointSignals> = {}): CheckpointSignals => ({
  cycleNear: false,
  worsened: { sleep: false, emotional: false, appetite: false, body: false },
  scheduleAhead: false,
  priorCombo: false,
  ...p,
})

describe('buildCheckpoint — 조건부 카드', () => {
  it('모두 안정이면 null (섹션 미표시)', () => {
    expect(buildCheckpoint(sig())).toBeNull()
  })

  it('월경 전 + 수면 악화 조합 문장', () => {
    const c = buildCheckpoint(sig({ cycleNear: true, worsened: { sleep: true, emotional: false, appetite: false, body: false } }))
    expect(c).not.toBeNull()
    expect(c!.sentences[0]).toBe('생리 예정일이 가까워지고 최근 수면도 흔들렸어요. 멘탈이 같이 터지는지 이틀 정도 봐요.')
  })

  it('월경 전 단독 → 정병 타이밍', () => {
    const c = buildCheckpoint(sig({ cycleNear: true }))
    expect(c!.sentences[0]).toContain('정병 모드가 오기 쉬운 타이밍')
  })

  it('일정 압박 + 최근 악화 + 과거 조합 → 멘헤라 조합', () => {
    const c = buildCheckpoint(
      sig({ scheduleAhead: true, priorCombo: true, worsened: { sleep: true, emotional: false, appetite: false, body: false } }),
    )
    expect(c!.sentences[0]).toBe('최근 수면과 다가오는 일정 압박이 겹쳤어요. 예전에 멘헤라 모드가 왔던 조합이에요.')
  })

  it('일정 압박 + 악화지만 과거 조합 없음 → 부드러운 표현', () => {
    const c = buildCheckpoint(
      sig({ scheduleAhead: true, priorCombo: false, worsened: { sleep: true, emotional: false, appetite: false, body: false } }),
    )
    expect(c!.sentences[0]).toContain('일정 부담이 겹쳤어요')
    expect(c!.sentences[0]).not.toContain('멘헤라')
  })

  it('일정만 있고 악화 없음 → 컨디션 비슷 안내', () => {
    const c = buildCheckpoint(sig({ scheduleAhead: true }))
    expect(c!.sentences[0]).toBe('다가오는 일정 부담이 있지만 최근 컨디션은 평소와 비슷해요.')
  })

  it('최근 악화만 — 최대 2개 신호까지', () => {
    const c = buildCheckpoint(
      sig({ worsened: { sleep: true, emotional: true, appetite: true, body: true } }),
    )
    // 4개가 켜져도 문장에는 2개(수면·감정)만 언급
    expect(c!.sentences[0]).toBe('최근 수면과 감정이 같이 흔들렸어요. 이어지는지 며칠 지켜봐요.')
    expect(c!.sentences[0]).not.toContain('식욕')
    expect(c!.sentences[0]).not.toContain('몸')
  })

  it('카드는 항상 한 개, 문장은 1~2개', () => {
    const c = buildCheckpoint(sig({ cycleNear: true, worsened: { sleep: true, emotional: true, appetite: false, body: false } }))
    expect(c!.sentences.length).toBeLessThanOrEqual(2)
  })

  it('내부 점수·확률·참고도 숫자를 노출하지 않음', () => {
    const c = buildCheckpoint(sig({ cycleNear: true, worsened: { sleep: true, emotional: false, appetite: false, body: false } }))
    expect(c!.sentences[0]).not.toMatch(/\d|참고도|확률|점/)
  })
})
