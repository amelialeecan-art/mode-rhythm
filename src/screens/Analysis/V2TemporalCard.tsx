import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getV2TemporalInsights, type V2TemporalInsights } from '../../data/services/v2TemporalAnalysisService'
import { formatMonthDay, parseISODate } from '../../lib/date'
import { beforeAfterLine, confidenceWords, lagWord, lightAsideForLagged } from './friendlyCopy'
import {
  morningEveningSentence,
  eventResponseSentence,
  laggedSentence,
  laggedAdjustmentFriendly,
  baselineShiftSentence,
} from './temporalVoice'

/**
 * "시간 순서가 확인된 패턴"(V2 temporal) 카드.
 * 메인은 사람말 한 줄 + 평소→이때 실측 비교. 통계 수치(N·CI·lag·보정·신뢰도)는
 * "자세히 보기"에만 둔다(§36 2층 구조). engine 결과를 전부 뿌리지 않고 gate 통과분만.
 * 결과가 없으면 카드 자체를 숨긴다("패턴 없음"이라 말하지 않는다).
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
      <SectionHeader title="시간 순서가 확인된 것들" subtitle="기록된 시각·전후 순서를 맞춰 본 거야" star />

      {ins.lagged.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">시간 간격을 둔 흐름</h4>
          <ul className="tmp-list">
            {ins.lagged.map((l) => {
              const aside = lightAsideForLagged(l.key)
              return (
                <li className="tmp-item" key={l.key}>
                  <p className="tmp-say">{laggedSentence(l)}</p>
                  {aside && <p className="tmp-aside">{aside}</p>}
                  <details className="tmp-more">
                    <summary>자세히 보기</summary>
                    <p className="tmp-meta">
                      {l.result.lag > 0 ? `${lagWord(l.result.lag)}까지 비교 · ` : '같은 날 비교 · '}
                      기록 {l.result.n}회 · {laggedAdjustmentFriendly(l)} · {confidenceWords(l.result.confidence)}
                      {l.result.ci && ` (범위 ${l.result.ci.lo.toFixed(1)}~${l.result.ci.hi.toFixed(1)})`}
                    </p>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {ins.eventResponses.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">어떤 일이 있었던 뒤</h4>
          <ul className="tmp-list">
            {ins.eventResponses.map((e) => {
              const ba = beforeAfterLine(e.result.meanBefore, e.result.meanAfter, { beforeLabel: '그 전에는', afterLabel: '이후에는' })
              return (
                <li className="tmp-item" key={`${e.category}-${e.metric}`}>
                  <p className="tmp-say">{eventResponseSentence(e)}</p>
                  {ba && <p className="tmp-num">{ba}</p>}
                  <details className="tmp-more">
                    <summary>자세히 보기</summary>
                    <p className="tmp-meta">
                      비교한 건 {e.result.supportCount}번이야 (기록된 사건 {e.eventCount}회)
                      {e.result.ci && ` · 범위 ${e.result.ci.lo.toFixed(1)}~${e.result.ci.hi.toFixed(1)}`}
                    </p>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {ins.morningEvening.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">아침과 저녁 사이</h4>
          <ul className="tmp-list">
            {ins.morningEvening.map((m) => {
              const ba = beforeAfterLine(m.morningMean, m.eveningMean, { beforeLabel: '아침에는', afterLabel: '저녁에는' })
              return (
                <li className="tmp-item" key={m.metric}>
                  <p className="tmp-say">{morningEveningSentence(m)}</p>
                  {ba && <p className="tmp-num">{ba}</p>}
                  <details className="tmp-more">
                    <summary>자세히 보기</summary>
                    <p className="tmp-meta">
                      같은 날 아침·저녁 모두 기록한 날 {m.summary.n}일
                      {m.summary.ci && ` · 범위 ${m.summary.ci.lo.toFixed(1)}~${m.summary.ci.hi.toFixed(1)}`}
                    </p>
                  </details>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {ins.baselineShifts.length > 0 && (
        <div className="tmp-group">
          <h4 className="tmp-h">요즘 달라진 점</h4>
          <ul className="tmp-list">
            {ins.baselineShifts.map((b) => {
              const ba = beforeAfterLine(b.candidate.beforeMean, b.candidate.afterMean, { beforeLabel: '그 전에는', afterLabel: '그 뒤로는' })
              return (
                <li className="tmp-item" key={b.metric}>
                  <p className="tmp-say">{baselineShiftSentence(b)}</p>
                  {b.shiftDate && <p className="tmp-num">{formatMonthDay(parseISODate(b.shiftDate))} 전후야.</p>}
                  {ba && <p className="tmp-num">{ba}</p>}
                  <p className="tmp-meta">확실한 건 아니고, 한 번 살펴볼 만한 변화야.</p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="state-hint">기록된 순서로 함께 나타난 것들이야. 원인을 확정하거나 진단하진 않아.</p>
    </GlassCard>
  )
}
