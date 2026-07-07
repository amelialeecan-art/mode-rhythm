import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getAnalysisViewModel, type AnalysisViewModel } from '../../data/services/patternAnalysisService'
import { CONFIDENCE_TIER_LABEL, ANALYSIS_METRIC_LABEL, RECOVERY_TIER_LABEL } from '../../engine'
import { formatMonthDay, parseISODate } from '../../lib/date'
import { useToneMode } from '../../lib/useToneMode'
import { getToneCopy } from '../../copy/tone'
import './analysis.css'

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

  // 진입 시 자동 계산. (데이터가 커지면 캐시/증분 계산으로 개선 가능)
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

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">분석</h1>
        <p className="screen-head__sub">반복적으로 함께 나타난 패턴을 봐요</p>
      </header>

      {/* 분석 안내 (tone 반영) */}
      <GlassCard tint="lav">
        <p className="analysis-disclaimer">{getToneCopy(tone, 'analysisIntro')}</p>
      </GlassCard>

      {loading ? (
        <GlassCard>
          <p className="analysis-loading">패턴을 계산하는 중…</p>
        </GlassCard>
      ) : !vm || !vm.hasEnoughData ? (
        <GlassCard>
          <SectionHeader title="상습 패턴" />
          <p className="analysis-empty">
            아직 상습 패턴을 보기엔 기록이 조금 부족해요. 며칠 더 기록하면 반복 경향을 볼 수 있어요.
            {vm ? ` (현재 ${vm.dayCount}일 기록)` : ''}
          </p>
        </GlassCard>
      ) : (
        <>
          {/* 상습 패턴 */}
          <GlassCard>
            <SectionHeader title="상습 패턴" subtitle="신뢰도 높은 순으로 보여줘요" />
            {vm.factorPatterns.length === 0 ? (
              <p className="analysis-empty">아직 뚜렷한 반복 패턴은 보이지 않아요. 기록이 쌓이면 다시 보여드릴게요.</p>
            ) : (
              <ul className="pattern-list">
                {vm.factorPatterns.map((f, i) => (
                  <li className="pattern" key={`${f.factorGroup}-${i}`}>
                    <div className="pattern__top">
                      <span className="pattern__name">{f.factorLabel}</span>
                      <span className={`pattern__tier tier--${f.confidenceTier}`}>{CONFIDENCE_TIER_LABEL[f.confidenceTier]}</span>
                    </div>
                    <p className="pattern__msg">{f.message}</p>
                    <div className="pattern__meta">
                      <span>{ANALYSIS_METRIC_LABEL[f.metric]}</span>
                      <span>·</span>
                      <span>효과 +{f.effectSize}</span>
                      <span>·</span>
                      <span>{f.supportCount}일 기준</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          {/* 시간창 하이라이트 */}
          {vm.timeWindowHighlight && (
            <GlassCard tint="sky">
              <SectionHeader title="시간창별 경향" />
              <p className="analysis-body">{vm.timeWindowHighlight.message}</p>
            </GlassCard>
          )}

          {/* 겹쳐 나타나는 패턴 (공범 구조) */}
          {vm.combos.length > 0 && (
            <GlassCard tint="lav">
              <SectionHeader title="겹쳐 나타나는 패턴" subtitle="공범 구조 후보" />
              {vm.combos.map((c, i) => (
                <div className="combo" key={`${c.factorA}-${c.factorB}-${i}`}>
                  <div className="overlap">
                    <div className="overlap__c overlap__c--a">{c.factorALabel}</div>
                    <div className="overlap__c overlap__c--b">{c.factorBLabel}</div>
                  </div>
                  <p className="overlap__body">{c.message}</p>
                  <span className={`pattern__tier tier--${c.confidenceTier}`}>{CONFIDENCE_TIER_LABEL[c.confidenceTier]}</span>
                </div>
              ))}
            </GlassCard>
          )}

          {/* 나를 살린 것들 (효과 후보 기반) */}
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
                현재 기록만으로는 충분히 설명되지 않은 고부하 날짜들이 있어요. 이유가 없는 날도 데이터로 보관해요.
              </p>
              <div className="unexplained">
                {vm.unexplained.map((u) => (
                  <span className="unexplained__chip" key={u.date}>
                    {formatMonthDay(parseISODate(u.date))} · 리듬 {u.rhythmLoad}
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
