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
import { useToneMode } from '../../lib/useToneMode'
import { getToneCopy } from '../../copy/tone'
import './analysis.css'

// 하단 고정 안내 — 인과/진단이 아님을 반복해서 명시.
const FACTOR_FOOTNOTE = '기록이 함께 나타난 평균 차이예요. 이 사건이 상태의 원인이라는 뜻은 아니에요.'

function fmt(date: string): string {
  return formatMonthDay(parseISODate(date))
}

export function AnalysisScreen() {
  const tone = useToneMode()
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

  // 유효 결과일 30일 미만이면 효과/원인 후보를 보여주지 않는다.
  const showComparison = !!vm && vm.validOutcomeDayCount >= 30

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">분석</h1>
        <p className="screen-head__sub">힘들었던 날의 흐름을 순서대로 정리해요</p>
      </header>

      {/* 고정 안내 — 인과/진단 아님 */}
      <GlassCard tint="lav">
        <p className="analysis-disclaimer">
          MODE는 기록을 시간 순서대로 묶어 흐름을 정리합니다. 원인이나 의학적 진단을 판정하지 않아요.
        </p>
        <p className="analysis-subnote">{getToneCopy(tone, 'analysisIntro')}</p>
      </GlassCard>

      {loading || !vm ? (
        <GlassCard>
          <p className="analysis-loading">패턴을 계산하는 중…</p>
        </GlassCard>
      ) : (
        <>
          {/* 기록 현황 */}
          <GlassCard>
            <SectionHeader title="기록 현황" subtitle={vm.analysisStageLabel} />
            <p className="analysis-count">
              저장한 날 {vm.savedDayCount}일 · 비교 가능한 상태 기록 {vm.validOutcomeDayCount}일
            </p>
            {!showComparison && (
              <p className="analysis-body">
                30일이 되면 사건이 있던 날과 없던 날의 평균을 비교해요.
                {vm.daysUntilComparison > 0 ? ` (비교까지 약 ${vm.daysUntilComparison}일)` : ''}
              </p>
            )}
          </GlassCard>

          {/* ===== 최근 힘들었던 날 (핵심) ===== */}
          <GlassCard tint="coral">
            <SectionHeader title="최근 힘들었던 날" subtitle="힘들었던 날의 흐름을 하나로 정리했어요" star />
            {vm.episodes.length === 0 ? (
              <p className="analysis-empty">
                아직 묶을 흐름이 없어요. ‘오늘 일상 기능’을 3·4로 기록한 날이 생기면 그 흐름을 정리해드릴게요.
              </p>
            ) : (
              <div className="ep-list">
                {vm.episodes.map((ep) => (
                  <EpisodeRow key={ep.startDate} ep={ep} />
                ))}
              </div>
            )}
            <p className="factor-footnote">
              같은 날 함께 기록된 일은 순서를 알 수 없어 원인으로 표시하지 않아요. 추정 구간은 기능 기록이 없어 종합 버거움으로 짐작한
              거예요.
            </p>
          </GlassCard>

          {/* ===== 미리 알아차릴 수 있었을까? (조기경보 백테스트) ===== */}
          {vm.earlyWarning && <EarlyWarningCardView ew={vm.earlyWarning} />}

          {/* ===== 비슷했던 날의 회복 (유사 에피소드 회복 경로) ===== */}
          {vm.recoveryComparison && <RecoveryComparisonCardView rc={vm.recoveryComparison} />}

          {/* ===== 장기 관찰 자료 (기존 분석 — 접힘) ===== */}
          <details className="longterm">
            <summary className="longterm__summary">장기 관찰 자료 (평균 비교·회복 기록)</summary>
            <div className="longterm__body">
              {/* 30일 미만: 단순 빈도만 */}
              {!showComparison ? (
                <GlassCard>
                  <SectionHeader title="자주 기록한 사건" subtitle="아직 평균 비교 전이라 빈도만 보여줘요" />
                  {vm.eventFrequency.length > 0 ? (
                    <div className="recfreq">
                      {vm.eventFrequency.map((e) => (
                        <span className="recfreq__chip" key={e.label}>
                          {e.label} {e.count}일
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="analysis-empty">아직 사건 기록이 적어요. 며칠 더 기록하면 흐름을 볼 수 있어요.</p>
                  )}
                </GlassCard>
              ) : (
                <>
                  {/* 함께 나타난 기록 */}
                  <GlassCard>
                    <SectionHeader title="함께 나타난 기록" subtitle="자료가 많은 순으로 보여줘요" />
                    {vm.factorPatterns.length === 0 ? (
                      <p className="analysis-empty">아직 평균 차이가 뚜렷한 기록은 보이지 않아요. 기록이 쌓이면 다시 보여드릴게요.</p>
                    ) : (
                      <ul className="pattern-list">
                        {vm.factorPatterns.map((f, i) => (
                          <FactorRow key={`${f.factorGroup}-${i}`} f={f} />
                        ))}
                      </ul>
                    )}
                    <p className="factor-footnote">{FACTOR_FOOTNOTE}</p>
                  </GlassCard>

                  {/* 시간창 하이라이트 */}
                  {vm.timeWindowHighlight && (
                    <GlassCard tint="sky">
                      <SectionHeader title="시간차가 있는 기록" />
                      <p className="analysis-body">{vm.timeWindowHighlight.message}</p>
                      <p className="factor-footnote">정확한 날짜가 없는 최근 기간 기록은 시간차 비교에서 제외돼요.</p>
                    </GlassCard>
                  )}

                  {/* 같이 겹친 기록 */}
                  {vm.combos.length > 0 && (
                    <GlassCard tint="lav">
                      <SectionHeader title="같이 겹친 기록" subtitle="두 기록이 함께 있던 날" />
                      {vm.combos.map((c, i) => (
                        <ComboRow key={`${c.factorA}-${c.factorB}-${i}`} c={c} />
                      ))}
                      <p className="factor-footnote">원인을 증명한 결과는 아니에요.</p>
                    </GlassCard>
                  )}
                </>
              )}

              {/* 나를 살린 것들 (회복 효과 후보) */}
              <GlassCard tint="mint">
                <SectionHeader title="나를 살린 것들" subtitle="전후 기록과 다음날 흐름을 함께 보고, 도움이 됐던 행동 후보를 보여줘요" star />
                {vm.mixedRecoveryDayCount > 0 && (
                  <p className="analysis-mixed-note">
                    도움 된 것과 안 맞았던 것이 함께 기록된 날이 {vm.mixedRecoveryDayCount}일 있어요. 같은 행동도 날에 따라
                    다르게 작동할 수 있어서, 이런 날은 해석에 참고만 해요.
                  </p>
                )}
                {vm.recoveryEffects.length > 0 ? (
                  <ul className="pattern-list">
                    {vm.recoveryEffects.map((r) => (
                      <li className="pattern" key={r.actionCode}>
                        <div className="pattern__top">
                          <span className="pattern__name">{r.actionLabel}</span>
                          <span className={`pattern__tier rectier--${r.confidenceTier}`}>{RECOVERY_TIER_LABEL[r.confidenceTier]}</span>
                        </div>
                        <p className="pattern__msg">{r.message}</p>
                        <div className="pattern__meta">
                          <span>회복 후보 {r.combinedScore}</span>
                          <span>·</span>
                          <span>{r.supportCount}회 기록</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : vm.recoveryFrequency.length > 0 ? (
                  <>
                    <p className="analysis-empty">
                      아직 회복 행동 효과를 보기엔 기록이 조금 부족해요. 뭐 했더니 나아졌는지 몇 번 더 기록하면 개인 회복템을 찾을 수 있어요.
                    </p>
                    <div className="recfreq">
                      {vm.recoveryFrequency.map((r) => (
                        <span className="recfreq__chip" key={r.label}>
                          {r.label} {r.count}회
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="analysis-empty">
                    아직 회복 행동 기록이 없어요. 뭐 했더니 나아졌는지 기록하면 개인 회복템을 찾아볼게요.
                  </p>
                )}
              </GlassCard>

              {/* 설명되지 않은 날 (미제 사건) */}
              {vm.unexplained.length > 0 && (
                <GlassCard tint="yellow">
                  <SectionHeader title="설명되지 않은 날" subtitle="미제 사건" />
                  <p className="analysis-body">
                    현재 기록만으로는 충분히 설명되지 않은, 버거움이 컸던 날짜들이 있어요. 이유가 없는 날도 데이터로 보관해요.
                  </p>
                  <div className="unexplained">
                    {vm.unexplained.map((u) => (
                      <span className="unexplained__chip" key={u.date}>
                        {fmt(u.date)} · 종합 {u.rhythmLoad}
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
        {recalcing ? '계산 중…' : '패턴 다시 계산'}
      </button>
    </>
  )
}

/**
 * 조기경보 백테스트 카드. 기본: 전날 밤 / 당일 아침 결과 + 오경보 균형 문장.
 * 혼동행렬 상세와 사용된 신호는 "계산 근거 보기" 접힘. 확률·인과 표현 없음.
 */
function EarlyWarningCardView({ ew }: { ew: EarlyWarningCard }) {
  return (
    <GlassCard tint="sky">
      <SectionHeader title="미리 알아차릴 수 있었을까?" subtitle="과거 기록으로 되짚어 본 실제 횟수예요" />
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
              {ew.signalLabelsUsed.length > 0 && (
                <p className="ew-note">사용된 신호: {ew.signalLabelsUsed.join(', ')}</p>
              )}
              <p className="ew-note">
                원인이나 예측이 아니라, 그 시점에 알아차릴 수 있었던 신호가 과거에 있었는지만 세요. 놓친 경우도, 잘못 경고한
                경우도 함께 봅니다.
              </p>
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

/**
 * 비슷했던 날의 회복 카드. 새 점수·추천 없이 과거에 함께 기록된 빈도 + 실제
 * 소요일만 서술. 표본 부족 시 자기보고 기준 안내. 인과·처방 표현 없음.
 */
function RecoveryComparisonCardView({ rc }: { rc: RecoveryComparisonCard }) {
  const hasDetail = rc.positiveActions.length > 0 || rc.negativeActions.length > 0
  return (
    <GlassCard tint="mint">
      <SectionHeader title="비슷한 강도로 힘들었던 날의 회복" subtitle="기능 저하 강도가 비슷한 날끼리 회복 흐름을 되짚어요" />
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
                <p className="rc-note">현재는 기능 저하 강도를 기준으로 비교해요.</p>
                <p className="rc-note">
                  회복시킨 원인이 아니라, 비슷했던 날에 함께 기록된 횟수예요. 같은 행동도 날에 따라 다르게 느껴질 수 있어요.
                </p>
              </div>
            </details>
          )}
        </div>
      )}
    </GlassCard>
  )
}

/**
 * 에피소드 기본 카드 (압축): 헤더 + 이번 흐름 요약 + 먼저 보인 변화 /
 * 전날 추가된 신호 / 나빠진 뒤 행동(각 최대 2). 나머지는 접힘 영역으로.
 */
function EpisodeRow({ ep }: { ep: EpisodeCard }) {
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
          <summary className="ep__more-sum">같은 날 · 배경 · 전체 기록 보기</summary>
          <div className="ep__more-body">
            {ep.sameDay.length > 0 && (
              <div className="ep__bucket">
                <span className="ep__bhead ep__bhead--same">같은 날 함께 기록됨</span>
                <ChipRow items={ep.sameDay} />
                <p className="ep__note">어느 쪽이 먼저인지 알 수 없어요.</p>
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

/** 기본 카드의 한 영역: 병합된 신호 최대 2개 + "외 N개". */
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

/** factor 카드: 그룹 표준명 + 숫자 근거를 정직하게 표시. */
function FactorRow({ f }: { f: FactorPatternCard }) {
  const sameDay = f.window === 'same_day'
  return (
    <li className="pattern">
      <div className="pattern__top">
        <div>
          <span className="pattern__name">{f.title}</span>
          {f.subtitle && <span className="pattern__sub">{f.subtitle}</span>}
        </div>
        <span className={`pattern__tier ev--${f.evidence}`}>{f.evidenceLabel}</span>
      </div>
      {sameDay ? (
        <p className="pattern__msg">
          같은 날 함께 나타났어요. {f.metricLabel} 평균 차이 +{f.effectSize}점.
        </p>
      ) : (
        <p className="pattern__msg">
          {f.windowPhrase} {f.metricLabel} 평균 차이가 +{f.effectSize}점이었어요.
        </p>
      )}
      <div className="pattern__nums">
        <span>있는 결과일 {f.supportCount}일 · 없는 결과일 {f.comparisonCount}일</span>
        <span>있는 날 평균 {f.withFactorMean} · 없는 날 평균 {f.withoutFactorMean}</span>
      </div>
      {sameDay && <p className="pattern__caution">어느 쪽이 먼저인지는 알 수 없어요.</p>}
    </li>
  )
}

/** combo 카드: 두 기록이 함께 있던 날 비교. */
function ComboRow({ c }: { c: ComboCard }) {
  return (
    <div className="combo">
      <div className="overlap">
        <div className="overlap__c overlap__c--a">{c.titleA}</div>
        <div className="overlap__c overlap__c--b">{c.titleB}</div>
      </div>
      <p className="overlap__body">
        두 기록이 함께 있던 {c.supportCount}일에 {c.metricLabel} 점수가 더 높았던 편이에요.
      </p>
      <div className="pattern__nums">
        <span>함께 있던 날 {c.supportCount}일 · 한쪽만 있던 날 {c.comparisonCount}일</span>
        <span>평균 차이 +{c.comboEffect}점</span>
      </div>
      <span className={`pattern__tier ev--${c.evidence}`}>{c.evidenceLabel}</span>
    </div>
  )
}
