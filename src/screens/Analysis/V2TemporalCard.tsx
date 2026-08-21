import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getV2TemporalInsights, type V2TemporalInsights } from '../../data/services/v2TemporalAnalysisService'
import {
  morningEveningSentence,
  eventResponseSentence,
  laggedSentence,
  laggedAdjustmentNote,
  baselineShiftSentence,
  V2_CONF_LABEL,
} from './temporalVoice'

/**
 * "시간 순서가 확인된 패턴"(V2 temporal) 카드.
 * ⚠️ V1 탐색 패턴과 다른 계층 — 여기 결과는 실제 timestamp/lag 정렬을 거친 것만 온다.
 * ⚠️ engine 결과를 전부 뿌리지 않는다: 서비스가 품질 gate/selection을 통과시킨 것만 렌더.
 * 결과가 없으면(gate 미통과·자료 부족) 카드 자체를 숨긴다("패턴 없음"이라 말하지 않는다).
 */
export function V2TemporalCard() {
  const [ins, setIns] = useState<V2TemporalInsights | null>(null)

  useEffect(() => {
    let cancelled = false
    void getV2TemporalInsights().then((r) => {
      if (!cancelled) setIns(r)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ins || !ins.available) return null

  return (
    <GlassCard tint="sky">
      <SectionHeader title="시간 순서가 확인된 패턴" subtitle="기록된 시각·전후 순서를 맞춰 본 결과예요" star />

      {ins.lagged.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">시간 간격을 둔 흐름</h4>
          <ul className="tmp-list">
            {ins.lagged.map((l) => (
              <li className="tmp-item" key={l.key}>
                <p className="tmp-say">{laggedSentence(l)}</p>
                <p className="tmp-meta">
                  {l.result.lag > 0 ? `${l.result.lag}일 시차 · ` : '같은 날 · '}
                  기록 {l.result.n}회 · {laggedAdjustmentNote(l)} · 신뢰도 {V2_CONF_LABEL[l.result.confidence]}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ins.eventResponses.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">사건 이후 같은 날 변화</h4>
          <ul className="tmp-list">
            {ins.eventResponses.map((e) => (
              <li className="tmp-item" key={`${e.category}-${e.metric}`}>
                <p className="tmp-say">{eventResponseSentence(e)}</p>
                <p className="tmp-meta">
                  사건 {e.eventCount}회 · 전후 비교 {e.result.supportCount}회
                  {e.result.ci && ` · 95% 범위 ${e.result.ci.lo.toFixed(1)}~${e.result.ci.hi.toFixed(1)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ins.morningEvening.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">아침 → 저녁 변화</h4>
          <ul className="tmp-list">
            {ins.morningEvening.map((m) => (
              <li className="tmp-item" key={m.metric}>
                <p className="tmp-say">{morningEveningSentence(m)}</p>
                <p className="tmp-meta">
                  같은 날 아침·저녁 쌍 {m.summary.n}회
                  {m.summary.ci && ` · 95% 범위 ${m.summary.ci.lo.toFixed(1)}~${m.summary.ci.hi.toFixed(1)}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ins.baselineShifts.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">기준선 변화 후보</h4>
          <ul className="tmp-list">
            {ins.baselineShifts.map((b) => (
              <li className="tmp-item" key={b.metric}>
                <p className="tmp-say">{baselineShiftSentence(b)}</p>
                <p className="tmp-meta">확정이 아니라 확인해볼 후보예요.</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="state-hint">관찰된 association이에요. 원인을 확정하거나 진단하지 않아요.</p>
    </GlassCard>
  )
}
