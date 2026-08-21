import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getCycleAlignedInsights, type CycleAlignedInsights, type CycleAlignedEntry } from '../../data/services/longAnalysisService'
import { assertGuard } from '../../copy/tone'
import { cycleWindowPhrase, repetitionPhrase, confidenceWords } from './friendlyCopy'

/** "생리하기 일주일 전쯤에는 음식이 당기는 정도가 평소보다 더 높았어요." (사람말 · 단정 금지) */
function sentence(e: CycleAlignedEntry): string {
  const r = e.result
  const dir = r.baselineDifference >= 0 ? '더 높았어요' : '더 낮았어요'
  return assertGuard(`${cycleWindowPhrase(r.window.fromDay)} ${e.label}이(가) 평소보다 ${dir}.`)
}

/** 평소 대비 차이(실측) + 반복을 사람말로. "같은 방향" 같은 표현을 쓰지 않는다. */
function numLine(e: CycleAlignedEntry): string {
  const r = e.result
  const amount = Math.abs(r.baselineDifference).toFixed(1)
  return `평소보다 ${amount}점쯤 차이가 났고, ${repetitionPhrase(r.sameDirectionCycleCount, r.usableCycleCount)}`
}

/** 자세히 보기용 — 숫자·범위·보정을 사람말 라벨로. */
function detailLine(e: CycleAlignedEntry): string {
  const r = e.result
  const base = `완료된 주기 ${r.usableCycleCount}개 · 관찰 ${r.observations}회 · 기록 비율 ${Math.round(r.coverageRate * 100)}%`
  const ci = r.ci ? ` · 범위 ${r.ci.lo.toFixed(1)}~${r.ci.hi.toFixed(1)}` : ''
  const adj = r.adjusted ? ' · 개인 평소 수준 대비로 봤어요' : ''
  return `${base}${ci}${adj}`
}

/**
 * Cycle-aligned retrospective 카드. 완료된 3+ 주기가 있을 때만.
 * 상관계수 하나가 아니라 효과 크기 + N + 반복성 + 불확실성 + 보정 + confidence를 함께 보여준다.
 */
export function CycleAlignedCard() {
  const [data, setData] = useState<CycleAlignedInsights | null>(null)

  useEffect(() => {
    let cancelled = false
    void getCycleAlignedInsights().then((d) => {
      if (!cancelled) setData(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return null

  // 완료 주기 부족 → 조용히 숨김(카드 자체 미노출)
  if (data.completedCycles < data.minCyclesRequired) return null

  // 보고할 만한 것: status ok + confidence tentative 이상.
  const shown = data.entries
    .filter((e) => e.result.status === 'ok' && e.result.confidence !== 'insufficient' && e.result.confidence !== 'exploratory')
    .sort((a, b) => Math.abs(b.result.effectSize) - Math.abs(a.result.effectSize))
    .slice(0, 5)

  if (shown.length === 0) return null

  return (
    <GlassCard tint="lav">
      <SectionHeader title="주기와 함께 반복된 변화" subtitle={`완료된 ${data.completedCycles}개 주기를 겹쳐 본 결과`} />
      {data.strongerWithMoreCycles && (
        <p className="state-hint" style={{ marginTop: 4 }}>4~6개 주기가 쌓이면 더 믿을 만한 자료가 돼요.</p>
      )}
      <ul className="ca-list">
        {shown.map((e) => (
          <li className="ca-item" key={e.metric}>
            <p className="ca-say">{sentence(e)}</p>
            <p className="tmp-num">{numLine(e)}</p>
            <details className="tmp-more">
              <summary>자세히 보기</summary>
              <p className="tmp-meta">{confidenceWords(e.result.confidence)} {detailLine(e)}</p>
            </details>
          </li>
        ))}
      </ul>
      <p className="state-hint">이미 지나간 주기들을 겹쳐 본 거예요. 원인이라고 단정하지 않아요.</p>
    </GlassCard>
  )
}
