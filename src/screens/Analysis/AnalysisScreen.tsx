import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import {
  getAnalysisViewModel,
  type AnalysisViewModel,
  type FactorPatternCard,
  type ComboCard,
} from '../../data/services/patternAnalysisService'
import { RECOVERY_TIER_LABEL } from '../../engine'
import { formatMonthDay, parseISODate } from '../../lib/date'
import { useToneMode } from '../../lib/useToneMode'
import { getToneCopy } from '../../copy/tone'
import './analysis.css'

// 하단 고정 안내 — 인과/진단이 아님을 반복해서 명시.
const FACTOR_FOOTNOTE = '기록이 함께 나타난 평균 차이예요. 이 사건이 상태의 원인이라는 뜻은 아니에요.'

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
        <p className="screen-head__sub">기록이 함께 나타난 평균을 비교해요</p>
      </header>

      {/* 고정 안내 — 인과/진단 아님 */}
      <GlassCard tint="lav">
        <p className="analysis-disclaimer">
          MODE는 기록이 함께 나타난 평균을 비교합니다. 원인이나 의학적 진단을 판정하지 않아요.
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
              {/* 함께 나타난 기록 (구 "상습 패턴") */}
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

              {/* 같이 겹친 기록 (구 "공범 구조") */}
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
                    {formatMonthDay(parseISODate(u.date))} · 종합 {u.rhythmLoad}
                  </span>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}

      <button className="analysis-recalc" onClick={recalc} disabled={recalcing || loading}>
        {recalcing ? '계산 중…' : '패턴 다시 계산'}
      </button>
    </>
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
