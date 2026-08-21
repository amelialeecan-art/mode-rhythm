import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getDataQualitySummary, type DataQualitySummary } from '../../data/services/dataQualityService'

/**
 * 분석 화면 상단 "기록 상태(데이터 품질/coverage)" 카드.
 * 통계표를 처음부터 넣지 않고, 분석 가능성을 정직하게 보여준다.
 * 분석 불가일 때 "패턴 없음"이 아니라 "비교 가능한 기록이 아직 부족해"라고 말한다.
 */
export function DataQualityCard() {
  const [summary, setSummary] = useState<DataQualitySummary | null>(null)

  useEffect(() => {
    let cancelled = false
    void getDataQualitySummary().then((s) => {
      if (!cancelled) setSummary(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!summary) return null
  const pct = (r: number) => `${Math.round(r * 100)}%`

  return (
    <GlassCard>
      <SectionHeader title="기록 상태" subtitle={`최근 ${summary.rangeDays}일 기준`} />
      <div className="dq-grid">
        <div className="dq-stat">
          <span className="dq-num">{summary.analyzableStateCount}회</span>
          <span className="dq-label">분석 가능한 기록</span>
        </div>
        <div className="dq-stat">
          <span className="dq-num">{pct(summary.morningCoverageRate)}</span>
          <span className="dq-label">아침 기록</span>
        </div>
        <div className="dq-stat">
          <span className="dq-num">{pct(summary.eveningCoverageRate)}</span>
          <span className="dq-label">저녁 기록</span>
        </div>
        <div className="dq-stat">
          <span className="dq-num">{summary.mealPreStateCount}회</span>
          <span className="dq-label">식사 전 상태</span>
        </div>
      </div>
      <p className="dq-hint">
        {summary.anyMetricReady
          ? '패턴을 비교할 만큼 기록이 모이고 있어.'
          : '비교할 기록이 아직 부족해. 조금 더 쌓이면 패턴을 비교해볼 수 있어.'}
      </p>
    </GlassCard>
  )
}
