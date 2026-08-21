import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getCycleAlignedInsights, type CycleAlignedInsights, type CycleAlignedEntry } from '../../data/services/longAnalysisService'
import { assertGuard } from '../../copy/tone'
import type { V2Confidence } from '../../engine/v2'

const CONF_LABEL: Partial<Record<V2Confidence, string>> = {
  tentative: '참고 수준',
  moderate: '보통',
  strong: '강함',
}

/** "월경 시작 7일 전 이내에는 craving이 평소보다 평균 2.1점 높게 기록됐어요. …" (단정 금지 가드 통과) */
function sentence(e: CycleAlignedEntry): string {
  const r = e.result
  const days = Math.abs(r.window.fromDay)
  const amount = Math.abs(r.baselineDifference).toFixed(1)
  const dir = r.baselineDifference >= 0 ? '높게' : '낮게'
  return assertGuard(
    `월경 시작 ${days}일 전 이내에는 ${e.label}이(가) 평소보다 평균 ${amount}점 ${dir} 기록됐어요. ` +
      `완료된 ${r.usableCycleCount}개 주기 중 ${r.sameDirectionCycleCount}개에서 같은 방향이었어요.`,
  )
}

function dataLine(e: CycleAlignedEntry): string {
  const r = e.result
  return `${r.usableCycleCount} cycles · ${r.observations} observations · coverage ${Math.round(r.coverageRate * 100)}%`
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
            <div className="ca-meta">
              <span className="ca-data">자료: {dataLine(e)}</span>
              <span className={`ca-conf ca-conf--${e.result.confidence}`}>
                신뢰도 {CONF_LABEL[e.result.confidence] ?? '참고'}
                {e.result.ci && ` · 95% 범위 ${e.result.ci.lo.toFixed(1)}~${e.result.ci.hi.toFixed(1)}`}
                {e.result.adjusted ? ' · 개인 baseline 보정' : ''}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="state-hint">이미 지나간 주기들의 사후 정렬이에요. 원인이라고 단정하지 않아요.</p>
    </GlassCard>
  )
}
