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
import { factorPhrase, episodeTrigger, eventResponseSentence, flowDriverSentence, type VoiceStrength } from './analysisVoice'
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

  // 제목 아래 메타 한 줄 (저장일=비교가능일이면 하나로)
  const meta =
    vm && vm.savedDayCount === vm.validOutcomeDayCount
      ? `${vm.validOutcomeDayCount}일 기록`
      : vm
        ? `저장 ${vm.savedDayCount}일 · 비교 가능 ${vm.validOutcomeDayCount}일`
        : ''

  // 장기 패턴: 약한 결과(evidence reference)는 기본 화면에서 숨김, 핵심 최대 3개.
  const voiced = (vm?.factorPatterns ?? []).map((f) => ({ f, ...factorPhrase(f) }))
  const coreFactors = voiced.filter((x) => x.strength !== 'weak').slice(0, 3)
  const coreSet = new Set(coreFactors.map((x) => x.f))
  const otherFactors = voiced.filter((x) => !coreSet.has(x.f))

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">분석</h1>
        {meta && <p className="analysis-meta">{meta}</p>}
      </header>

      {loading || !vm ? (
        <GlassCard>
          <p className="analysis-loading">패턴을 계산하는 중…</p>
        </GlassCard>
      ) : (
        <>
          {/* ===== 최근 힘들었던 날 (핵심) ===== */}
          <GlassCard tint="coral">
            <SectionHeader title="최근 힘들었던 날" star />
            {vm.episodes.length === 0 ? (
              <p className="analysis-empty">
                아직 묶을 흐름이 없어요. ‘오늘 일상 기능’을 3·4로 기록한 날이 생기면 여기 정리해줄게요.
              </p>
            ) : (
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
            )}
          </GlassCard>

          {/* ===== 미리 알아차릴 수 있었을까? ===== */}
          {vm.earlyWarning && <EarlyWarningCardView ew={vm.earlyWarning} />}

          {/* ===== 비슷한 강도로 힘들었던 날의 회복 ===== */}
          {vm.recoveryComparison && <RecoveryComparisonCardView rc={vm.recoveryComparison} />}

          {/* ===== 자주 반복되는 패턴 (핵심 최대 3개) ===== */}
          {showComparison && coreFactors.length > 0 && (
            <GlassCard>
              <SectionHeader title="자주 반복되는 패턴" />
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

          {/* ===== 흐름을 바꾼 누적 요인 (최대 2개, 없으면 섹션 숨김) ===== */}
          {vm.flowDrivers.length > 0 && (
            <GlassCard>
              <SectionHeader title="흐름을 바꾼 누적 요인" />
              <ul className="driver-list">
                {vm.flowDrivers.map((d) => (
                  <li className="driver-row" key={d.eventKey}>
                    {flowDriverSentence(d)}
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* ===== 그 밖의 기록 (회복 후보 · 미제 · 초기 빈도) ===== */}
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

              <GlassCard tint="mint">
                <SectionHeader title="나를 살린 것들" star />
                {vm.recoveryEffects.length > 0 ? (
                  <ul className="pat-list">
                    {vm.recoveryEffects.map((r) => (
                      <li className="pat" key={r.actionCode}>
                        <div className="pat__head">
                          <span className="pat__name">{r.actionLabel}</span>
                          <span className={`pat__tier rectier--${r.confidenceTier}`}>{RECOVERY_TIER_LABEL[r.confidenceTier]}</span>
                        </div>
                        <p className="pat__say">{r.message}</p>
                        <details className="pat__more">
                          <summary>근거 보기</summary>
                          <div className="pat__nums">
                            <span>회복 후보 {r.combinedScore} · {r.supportCount}회 기록</span>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : vm.recoveryFrequency.length > 0 ? (
                  <>
                    <p className="analysis-empty">뭐 했더니 나아졌는지 몇 번 더 남기면 개인 회복템이 보여요.</p>
                    <div className="recfreq">
                      {vm.recoveryFrequency.map((r) => (
                        <span className="recfreq__chip" key={r.label}>
                          {r.label} {r.count}회
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="analysis-empty">뭐 했더니 나아졌는지 기록하면 개인 회복템을 찾아줄게요.</p>
                )}
              </GlassCard>

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
        </>
      )}

      <button className="analysis-recalc" onClick={recalc} disabled={recalcing || loading}>
        {recalcing ? '계산 중…' : '다시 계산'}
      </button>
    </>
  )
}

/** 조기경보 백테스트 카드. 기본 3문장 + "계산 근거 보기" 접힘. */
function EarlyWarningCardView({ ew }: { ew: EarlyWarningCard }) {
  return (
    <GlassCard tint="sky">
      <SectionHeader title="미리 알아차릴 수 있었을까?" />
      {!ew.eligible ? (
        <p className="analysis-body">{ew.gatingSentence}</p>
      ) : (
        <>
          <div className="ew-lines">
            <p className="ew-line">{ew.prevNightSentence}</p>
            <p className="ew-line">{ew.morningSentence}</p>
            <p className="ew-line ew-line--balance">{ew.balanceSentence}</p>
          </div>
          <details className="ew-more">
            <summary className="ew-more-sum">계산 근거 보기</summary>
            <div className="ew-more-body">
              <MatrixTable title="전날 밤 (D-1까지)" cm={ew.prevNight} />
              <MatrixTable title="당일 아침 (지난밤 수면 포함)" cm={ew.morning} />
              {ew.estimatedExcludedCount > 0 && (
                <p className="ew-note">추정만으로 잡힌 구간 {ew.estimatedExcludedCount}개는 핵심 표본에서 제외했어요.</p>
              )}
              {ew.signalLabelsUsed.length > 0 && <p className="ew-note">사용된 신호: {ew.signalLabelsUsed.join(', ')}</p>}
            </div>
          </details>
        </>
      )}
    </GlassCard>
  )
}

function MatrixTable({ title, cm }: { title: string; cm: EarlyWarningCard['prevNight'] }) {
  return (
    <div className="ew-matrix">
      <span className="ew-matrix__title">{title}</span>
      <div className="ew-grid">
        <span>힘들었던 날 · 신호 있었음</span>
        <b>{cm.hit}</b>
        <span>힘들었던 날 · 신호 놓침</span>
        <b>{cm.miss}</b>
        <span>괜찮았는데 신호 있었음</span>
        <b>{cm.falseAlarm}</b>
        <span>괜찮았고 신호도 없었음</span>
        <b>{cm.correctRejection}</b>
      </div>
    </div>
  )
}

/** 비슷한 강도로 힘들었던 날의 회복 카드. */
function RecoveryComparisonCardView({ rc }: { rc: RecoveryComparisonCard }) {
  const hasDetail = rc.positiveActions.length > 0 || rc.negativeActions.length > 0
  return (
    <GlassCard tint="mint">
      <SectionHeader title="비슷한 강도로 힘들었던 날의 회복" />
      <p className="rc-line rc-line--head">{rc.headlineSentence}</p>
      {!rc.enoughSample ? (
        <p className="rc-line rc-line--muted">{rc.gatingSentence}</p>
      ) : (
        <div className="rc-lines">
          {rc.durationSentence && <p className="rc-line">{rc.durationSentence}</p>}
          {rc.positiveSentence && <p className="rc-line">{rc.positiveSentence}</p>}
          {rc.negativeSentence && <p className="rc-line rc-line--muted">{rc.negativeSentence}</p>}
          {hasDetail && (
            <details className="rc-more">
              <summary className="rc-more-sum">함께 기록된 행동 보기</summary>
              <div className="rc-more-body">
                {rc.positiveActions.length > 0 && (
                  <div className="rc-tally">
                    <span className="rc-tally__head rc-tally__head--pos">도움이 됐다고 적음</span>
                    {rc.positiveActions.map((a) => (
                      <div className="rc-tally__row" key={`p-${a.actionCode}`}>
                        <span>{a.actionLabel}</span>
                        <b>{a.episodeCount}번</b>
                      </div>
                    ))}
                  </div>
                )}
                {rc.negativeActions.length > 0 && (
                  <div className="rc-tally">
                    <span className="rc-tally__head rc-tally__head--neg">안 맞았다고 적음</span>
                    {rc.negativeActions.map((a) => (
                      <div className="rc-tally__row" key={`n-${a.actionCode}`}>
                        <span>{a.actionLabel}</span>
                        <b>{a.episodeCount}번</b>
                      </div>
                    ))}
                  </div>
                )}
                <p className="rc-note">기능 저하 강도를 기준으로, 회복 구간에 함께 기록된 횟수예요.</p>
              </div>
            </details>
          )}
        </div>
      )}
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

/** 요인 패턴: 제목 + 자연어 한 문장. 숫자는 "근거 보기" 안에만. */
function FactorRow({ f, strength }: { f: FactorPatternCard; strength: VoiceStrength }) {
  const { text } = factorPhrase(f)
  return (
    <li className="pat">
      <div className="pat__head">
        <span className="pat__name">{f.title}</span>
        <span className={`pat__str pat__str--${strength}`}>{f.evidenceLabel}</span>
      </div>
      <p className="pat__say">{text}</p>

      <details className="pat__flow">
        <summary>흐름 보기</summary>
        {f.response.eligible ? (
          <div className="pat__flow-body">
            <p className="pat__flow-say">
              {eventResponseSentence({ title: f.title, metric: f.metric, points: f.response.points, baseline: f.response.baseline })}
            </p>
            <EventResponseChart points={f.response.points} baseline={f.response.baseline} color={METRIC_COLOR[f.metric] ?? '#A985E8'} />
            <details className="pat__more">
              <summary>근거 보기</summary>
              <div className="pat__nums">
                <span>평소 기준선 {f.response.baseline} · 노출 {f.response.exposures}회</span>
                {f.response.points.map((p) => (
                  <span key={p.rel}>
                    {p.rel === 0 ? '당일' : p.rel < 0 ? `${-p.rel}일 전` : `${p.rel}일 후`}: {p.mean ?? '—'} (기록 {p.n}일)
                  </span>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <p className="pat__flow-empty">아직 흐름을 그릴 만큼 반복 기록이 없어요.</p>
        )}
      </details>

      <details className="pat__more">
        <summary>근거 보기</summary>
        <div className="pat__nums">
          <span>{f.metricLabel} · {f.windowPhrase}</span>
          <span>평균 차이 +{f.effectSize}점</span>
          <span>있는 날 {f.supportCount}일(평균 {f.withFactorMean}) · 없는 날 {f.comparisonCount}일(평균 {f.withoutFactorMean})</span>
        </div>
      </details>
    </li>
  )
}

/** combo: 두 기록이 같은 날 겹친 경우. 숫자는 근거 안에. */
function ComboRow({ c }: { c: ComboCard }) {
  return (
    <li className="pat">
      <div className="pat__head">
        <span className="pat__name">{c.titleA} + {c.titleB}</span>
      </div>
      <p className="pat__say">둘이 겹친 날 {c.metricLabel.replace(/ 정도$/, '')}가 유독 더 힘들었어요.</p>
      <details className="pat__more">
        <summary>근거 보기</summary>
        <div className="pat__nums">
          <span>함께 있던 날 {c.supportCount}일 · 한쪽만 {c.comparisonCount}일</span>
          <span>평균 차이 +{c.comboEffect}점</span>
        </div>
      </details>
    </li>
  )
}
