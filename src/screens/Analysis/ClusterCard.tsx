import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getStateClusters } from '../../data/services/longAnalysisService'
import type { ClusterResult } from '../../engine/v2'

/**
 * 상태 군집 카드. 충분+안정할 때만 노출한다.
 * 표시명은 centroid에서 유도한 descriptive label이며 진단명이 아니다.
 * 안정성이 낮거나 자료가 부족하면 카드 자체를 숨긴다.
 */
export function ClusterCard() {
  const [res, setRes] = useState<ClusterResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void getStateClusters().then((r) => {
      if (!cancelled) setRes(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 미가용(자료 부족/불안정/낮은 실루엣)이면 노출하지 않는다.
  if (!res || !res.available || !res.clusters) return null

  const sorted = [...res.clusters].sort((a, b) => b.size - a.size)

  return (
    <GlassCard>
      <SectionHeader title="자주 나타난 하루 유형" subtitle={`${res.usableDays}일 기록에서 찾은 ${res.k}가지 패턴`} />
      <ul className="cl-list">
        {sorted.map((c, i) => (
          <li className="cl-item" key={i}>
            <span className="cl-label">{c.label}</span>
            <span className="cl-share">{Math.round(c.share * 100)}%</span>
          </li>
        ))}
      </ul>
      <p className="state-hint">기록된 상태에서 비슷한 날끼리 묶은 거야. 진단이 아니라 설명용 이름이야.</p>
    </GlassCard>
  )
}
