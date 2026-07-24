import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import {
  getAnalysisViewModel,
  type AnalysisViewModel,
  type FactorPatternCard,
  type ComboCard,
  type EpisodeCard,
  type EpisodeSection,
  type MergedSignal,
  type EarlyWarningCard,
  type RecoveryComparisonCard,
} from '../../data/services/patternAnalysisService'
import { RECOVERY_TIER_LABEL } from '../../engine'
import { formatMonthDay, parseISODate } from '../../lib/date'
import { factorPhrase, episodeTrigger, eventResponseSentence, flowDriverSentence, cumulativeExposureSentence, type VoiceStrength } from './analysisVoice'
import { suppressRedundantCumulative, strongRecoveryInsights } from '../resultHierarchy'
import { EventResponseChart } from './EventResponseChart'
import './analysis.css'

const METRIC_COLOR: Record<string, string> = {
  emotional: '#A985E8',
  appetite: '#FF9576',
  sleep: '#74A8EC',
  body: '#5BC79E',
  rhythm: '#46BBB0',
  cycle: '#E58BBE',
  event: '#9aa0b5',
}

function fmt(date: string): string {
  return formatMonthDay(parseISODate(date))
}

export function AnalysisScreen() {
  const [vm, setVm] = useState<AnalysisViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [recalcing, setRecalcing] = useState(false)

  const load = () => {
    setLoading(true)
    void getAnalysisViewModel().then((v) => {
      setVm(v)
      setLoading(false)
    })
  }

  useEffect(() => {
    let cancelled = false
    void getAnalysisViewModel().then((v) => {
      if (cancelled) return
      setVm(v)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const recalc = async () => {
    setRecalcing(true)
    await new Promise((r) => setTimeout(r, 0))
    load()
    setRecalcing(false)
  }

  const showComparison = !!vm && vm.validOutcomeDayCount >= 30

  // 장기 패턴: 약한 결과(evidence reference)는 기본 화면에서 숨김, 핵심 최대 3개.
  const voiced = (vm?.factorPatterns ?? []).map((f) => ({ f, ...factorPhrase(f) }))
  const coreFactors = voiced.filter((x) => x.strength !== 'weak').slice(0, 3)
  const coreSet = new Set(coreFactors.map((x) => x.f))
  const otherFactors = voiced.filter((x) => !coreSet.has(x.f))

  // 중복 억제: flowDrivers가 이미 말한 사건은 누적 노출에서 감춘다.
  const extraCumulative = vm ? suppressRedundantCumulative(vm.flowDrivers, vm.cumulativeExposures) : []
  // 실제 도움 된 회복 행동 = 대표 회복 카드(약한 tier·방어 메시지 제외).
  const strongRecs = vm ? strongRecoveryInsights(vm.recoveryEffects) : []

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">분석</h1>
      </header>

      {loading || !vm ? (
        <GlassCard>
          <p className="analysis-loading">패턴을 계산하는 중…</p>
        </GlassCard>
      ) : (
        <>
          {/* ===== 1. 흐름을 바꾼 누적 요인 (없으면 섹션 전체 숨김) ===== */}
          {vm.flowDrivers.length > 0 && (
            <GlassCard tint="coral">
              <SectionHeader title="흐름을 바꾼 누적 요인" star />
              <ul className="driver-list">
                {vm.flowDrivers.map((d) => (
                  <li className="driver-row" key={d.eventKey}>
                    {flowDriverSentence(d)}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* ===== 2. 누적 노출 차이 (flowDrivers와 겹치면 감춤 · 추가 정보일 때만) ===== */}
          {extraCumulative.length > 0 && (
            <GlassCard>
              <SectionHeader title="여러 날 이어졌을 때" />
              <ul className="driver-list">
                {extraCumulative.map((c) => (
                  <li className="driver-row" key={c.key}>
                    {cumulativeExposureSentence(c)}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* ===== 3. 반복되는 조건과 결과 (핵심 최대 3개) ===== */}
          {showComparison && coreFactors.length > 0 && (
            <GlassCard>
              <SectionHeader title="반복되는 조건과 결과" />
              <ul className="pat-list">
                {coreFactors.map(({ f, strength }) => (
                  <FactorRow key={f.factorGroup} f={f} strength={strength} />
                ))}
              </ul>
              {(otherFactors.length > 0 || vm.combos.length > 0) && (
                <details className="more">
                  <summary className="more__sum">다른 패턴 보기</summary>
                  <div className="more__body">
                    {otherFactors.length > 0 && (
                      <ul className="pat-list">
                        {otherFactors.map(({ f, strength }) => (
                          <FactorRow key={f.factorGroup} f={f} strength={strength} />
                        ))}
                      </ul>
                    )}
                    {vm.combos.map((c, i) => (
                      <ComboRow key={`${c.factorA}-${c.factorB}-${i}`} c={c} />
                    ))}
                  </div>
                </details>
              )}
            </GlassCard>
          )}

          {/* ===== 4. 실제 도움이 된 회복 행동 (대표 회복 카드 · 강한 결과만) ===== */}
          {strongRecs.length > 0 && (
            <GlassCard tint="mint">
              <SectionHeader title="실제 도움이 된 회복 행동" star />
              <ul className="pat-list">
                {strongRecs.map((r) => (
                  <li className="pat" key={r.actionCode}>
                    <div className="pat__head">
                      <span className="pat__name">{r.actionLabel}</span>
                      <span className={`pat__tier rectier--${r.confidenceTier}`}>{RECOVERY_TIER_LABEL[r.confidenceTier]}</span>
                    </div>
                    <p className="pat__say">{r.message}</p>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* ===== 5. 상태 전이·이어진 변화 (힘들었던 흐름 · 없으면 숨김) ===== */}
          {vm.episodes.length > 0 && (
            <GlassCard tint="coral">
              <SectionHeader title="힘들었던 흐름" />
              <div className="ep-list">
                <EpisodeRow ep={vm.episodes[0]} />
                {vm.episodes.length > 1 && (
                  <details className="ep-older">
                    <summary className="ep-older__sum">이전 힘들었던 날 {vm.episodes.length - 1}개 보기</summary>
                    <div className="ep-older__body">
                      {vm.episodes.slice(1).map((ep) => (
                        <EpisodeRow key={ep.startDate} ep={ep} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </GlassCard>
          )}

          {/* 조기경보·비슷한 강도 회복 경로: 근거가 충분할 때만(약하면 카드 자체 숨김) */}
          {vm.earlyWarning && vm.earlyWarning.eligible && <EarlyWarningCardView ew={vm.earlyWarning} />}
          {vm.recoveryComparison && vm.recoveryComparison.enoughSample && (
            <RecoveryComparisonCardView rc={vm.recoveryComparison} shownActions={strongRecs} />
          )}

          {/* ===== 6. 그 밖의 기록 (초기 빈도 · 미제) — 결과 있을 때만 노출 ===== */}
          {((!showComparison && vm.eventFrequency.length > 0) || vm.unexplained.length > 0) && (
            <details className="more more--block">
              <summary className="more__sum">그 밖의 기록</summary>
              <div className="more__body">
                {!showComparison && vm.eventFrequency.length > 0 && (
                  <GlassCard>
                    <SectionHeader title="자주 기록한 사건" />
                    <div className="recfreq">
                      {vm.eventFrequency.map((e) => (
                        <span className="recfreq__chip" key={e.label}>
                          {e.label} {e.count}일
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}

                {vm.unexplained.length > 0 && (
                  <GlassCard tint="yellow">
                    <SectionHeader title="설명되지 않은 날" />
                    <div className="unexplained">
                      {vm.unexplained.map((u) => (
                        <span className="unexplained__chip" key={u.date}>
                          {fmt(u.date)}
                        </span>
                      ))}
                    </div>
                  </GlassCard>
                )}
              </div>
            </details>
          )}
        </>
      )}

      <button className="analysis-recalc" onClick={recalc} disabled={recalcing || loading}>
        {recalcing ? '계산 중…' : '다시 계산'}
      </button>
    </>
  )
}

/** 조기경보 백테스트 카드(3문장). eligible일 때만 렌더된다. 내부 표본 수·추정 노출 없음. */
function EarlyWarningCardView({ ew }: { ew: EarlyWarningCard }) {
  return (
    <GlassCard tint="sky">
      <SectionHeader title="미리 알아차릴 수 있었을까?" />
      <div className="ew-lines">
        <p className="ew-line">{ew.prevNightSentence}</p>
        <p className="ew-line">{ew.morningSentence}</p>
        <p className="ew-line ew-line--balance">{ew.balanceSentence}</p>
      </div>
    </GlassCard>
  )
}

/** 비슷한 강도로 힘들었던 날의 회복 경로(회복까지 걸린 시간 중심). enoughSample일 때만 렌더된다.
 *  대표 회복 카드(shownActions)가 이미 다룬 행동은 여기서 반복하지 않는다. */
function RecoveryComparisonCardView({ rc, shownActions }: { rc: RecoveryComparisonCard; shownActions: { actionCode: string }[] }) {
  const shown = new Set(shownActions.map((a) => a.actionCode))
  const positive = rc.positiveActions.filter((a) => !shown.has(a.actionCode))
  const negative = rc.negativeActions.filter((a) => !shown.has(a.actionCode))
  const hasDetail = positive.length > 0 || negative.length > 0
  return (
    <GlassCard tint="mint">
      <SectionHeader title="비슷한 강도로 힘들었던 날의 회복" />
      <p className="rc-line rc-line--head">{rc.headlineSentence}</p>
      <div className="rc-lines">
        {rc.durationSentence && <p className="rc-line">{rc.durationSentence}</p>}
        {hasDetail && (
          <details className="rc-more">
            <summary className="rc-more-sum">함께 기록된 행동 보기</summary>
            <div className="rc-more-body">
              {positive.length > 0 && (
                <div className="rc-tally">
                  <span className="rc-tally__head rc-tally__head--pos">도움이 됐다고 적음</span>
                  {positive.map((a) => (
                    <div className="rc-tally__row" key={`p-${a.actionCode}`}>
                      <span>{a.actionLabel}</span>
                    </div>
                  ))}
                </div>
              )}
              {negative.length > 0 && (
                <div className="rc-tally">
                  <span className="rc-tally__head rc-tally__head--neg">안 맞았다고 적음</span>
                  {negative.map((a) => (
                    <div className="rc-tally__row" key={`n-${a.actionCode}`}>
                      <span>{a.actionLabel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </GlassCard>
  )
}

/** 에피소드 카드: 트리거 한 줄 + 요약 + 시간 순서 칩. 나머지는 접힘. */
function EpisodeRow({ ep }: { ep: EpisodeCard }) {
  const precursors = [...ep.earlyChanges.items, ...ep.dayBeforeNew.items].map((s) => s.label)
  const afters = ep.afterBehaviors.items.map((s) => s.label)
  const trigger = episodeTrigger({ precursors, afters })
  const hasCollapsed = ep.sameDay.length > 0 || ep.background.length > 0 || ep.allDetail.length > 0
  const noSignals =
    ep.earlyChanges.items.length === 0 && ep.dayBeforeNew.items.length === 0 && ep.afterBehaviors.items.length === 0
  return (
    <div className="ep">
      <div className="ep__top">
        <div className="ep__title">
          <span className={`ep__sev ep__sev--${ep.peakFunctionLevel ?? 'est'}`}>{ep.severityLabel}</span>
          <span className="ep__range">{ep.dateLabel}</span>
        </div>
        <span className={`ep__conf ep__conf--${ep.confidence}`}>{ep.confidenceLabel}</span>
      </div>

      <div className="ep__meta">
        <span className={`ep__status ep__status--${ep.status}`}>{ep.statusLabel}</span>
        <span>{ep.lengthDays}일 지속</span>
        {ep.cyclePosition && (
          <span>
            · {ep.cyclePosition.phaseLabel}
            {ep.cyclePosition.detail ? ` (${ep.cyclePosition.detail})` : ''}
          </span>
        )}
      </div>

      {trigger && <p className="ep__trigger">{trigger}</p>}

      <div className="ep__summary">
        {ep.summary.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>

      <SignalSection title="먼저 보인 변화" section={ep.earlyChanges} tone="lead" />
      <SignalSection title="전날 추가된 신호" section={ep.dayBeforeNew} tone="warn" />
      <SignalSection title="나빠진 뒤 행동" section={ep.afterBehaviors} tone="after" />

      {noSignals && <p className="ep__empty">이 구간엔 앞뒤로 함께 기록된 신호가 뚜렷하지 않아요.</p>}

      {hasCollapsed && (
        <details className="ep__more">
          <summary className="ep__more-sum">전체 기록 보기</summary>
          <div className="ep__more-body">
            {ep.sameDay.length > 0 && (
              <div className="ep__bucket">
                <span className="ep__bhead ep__bhead--same">같은 날 함께 기록됨</span>
                <ChipRow items={ep.sameDay} />
              </div>
            )}
            {ep.background.length > 0 && (
              <div className="ep__bucket">
                <span className="ep__bhead ep__bhead--bg">배경 조건</span>
                <ChipRow items={ep.background} />
              </div>
            )}
            {ep.allDetail.map((b) => (
              <div className="ep__bucket" key={b.title}>
                <span className="ep__bhead ep__bhead--detail">{b.title}</span>
                <div className="ep__sigs">
                  {b.items.map((it, i) => (
                    <span className="ep__sig" key={`${it.label}-${i}`}>
                      {it.label}
                      {it.timing && <em className="ep__lag">{it.timing}</em>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function SignalSection({ title, section, tone }: { title: string; section: EpisodeSection; tone: string }) {
  if (section.items.length === 0) return null
  return (
    <div className="ep__bucket">
      <span className={`ep__bhead ep__bhead--${tone}`}>{title}</span>
      <ChipRow items={section.items} />
      {section.overflow > 0 && <span className="ep__overflow">외 {section.overflow}개</span>}
    </div>
  )
}

function ChipRow({ items }: { items: MergedSignal[] }) {
  return (
    <div className="ep__sigs">
      {items.map((s, i) => (
        <span className="ep__sig" key={`${s.factorGroup}-${i}`}>
          {s.label}
          {s.detail && <em className="ep__lag">{s.detail}</em>}
        </span>
      ))}
    </div>
  )
}

/** 요인 패턴: 제목 + 자연어 한 문장 + 흐름 그림(내부 점수·표본 수·evidence 배지는 노출하지 않음). */
function FactorRow({ f, strength }: { f: FactorPatternCard; strength: VoiceStrength }) {
  void strength
  const { text } = factorPhrase(f)
  return (
    <li className="pat">
      <div className="pat__head">
        <span className="pat__name">{f.title}</span>
      </div>
      <p className="pat__say">{text}</p>

      {f.response.eligible && (
        <details className="pat__flow">
          <summary>흐름 보기</summary>
          <div className="pat__flow-body">
            <p className="pat__flow-say">
              {eventResponseSentence({ title: f.title, metric: f.metric, points: f.response.points, baseline: f.response.baseline })}
            </p>
            <EventResponseChart points={f.response.points} baseline={f.response.baseline} color={METRIC_COLOR[f.metric] ?? '#A985E8'} />
          </div>
        </details>
      )}
    </li>
  )
}

/** combo: 두 기록이 같은 날 겹친 경우. 내부 숫자는 노출하지 않는다. */
function ComboRow({ c }: { c: ComboCard }) {
  return (
    <li className="pat">
      <div className="pat__head">
        <span className="pat__name">{c.titleA} + {c.titleB}</span>
      </div>
      <p className="pat__say">둘이 겹친 날 {c.metricLabel.replace(/ 정도$/, '')}가 유독 더 힘들었어요.</p>
    </li>
  )
}
