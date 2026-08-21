import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader, RhythmChart, type RhythmSeries } from '../../design'
import {
  getRhythmViewModel,
  getCycleCompareViewModel,
  getRecentFlow,
  getPersonalRhythm,
  getMonthlyComparison,
  type RhythmViewModel,
  type CycleCompareViewModel,
  type RhythmMetric,
  type CyclePhase,
} from '../../data/services/rhythmService'
import type { RecentFlow, PersonalRhythm, MonthlyComparison } from '../../engine'
import { getCheckpointSignals } from '../../data/services/rhythmForecastService'
import { getEpisodeInsightSnapshot } from '../../data/services/episodeInsightService'
import { createSnapshotFlowLoader } from '../../lib/snapshotFlowLoader'
import { getTodayISODate } from '../../lib/date'
import { rhythmCompareSentence, cycleCompareSentence, recentFlowSentence, personalRhythmSentence, monthlyComparisonView, RHYTHM_METRIC_LABEL } from './rhythmVoice'
import { presentRhythmRepeatedFlow, type RepeatedFlowCard } from './rhythmRepeatedFlow'
import { CycleCompareChart } from './CycleCompareChart'
import { buildCheckpoint, type CheckpointCard } from './checkpoint'
import {
  METRIC_ORDER,
  METRIC_LABEL,
  METRIC_COLOR,
  METRIC_EXPLAIN,
  PRESETS,
  isNeutral,
  toDisplayValue,
  pickTickIndices,
  formatTickDate,
  formatTooltipDate,
} from './rhythmOverlay'
import './rhythm.css'

const RANGES = [
  { key: '30d', label: '30일', days: 30, bucket: 'day' as const },
  { key: '3m', label: '3개월', days: 90, bucket: 'week' as const },
  { key: '6m', label: '6개월', days: 180, bucket: 'week' as const },
  { key: '1y', label: '1년', days: 365, bucket: 'week' as const },
]

const NAMED_PRESETS = PRESETS.filter((p) => p.key !== 'custom')
const DEFAULT_METRICS: RhythmMetric[] = ['emotional', 'appetite', 'sleep', 'recovery', 'body']

const PHASE_LABEL: Record<CyclePhase, string> = {
  period: '생리 중',
  premenstrual: '월경 전 구간',
  ovulation: '배란 구간',
}
const PHASE_COLOR: Record<CyclePhase, string> = {
  period: '#E58BBE',
  premenstrual: '#FF9576',
  ovulation: '#74A8EC',
}

type ViewMode = 'long' | 'cycle'

function sameSet(a: RhythmMetric[], b: RhythmMetric[]): boolean {
  return a.length === b.length && a.every((m) => b.includes(m))
}

export function RhythmScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('long')
  const [rangeKey, setRangeKey] = useState('30d')
  // 겹쳐보기: 선택된 지표 집합(항상 METRIC_ORDER 순서 유지, 최소 1개).
  const [selectedMetrics, setSelectedMetrics] = useState<RhythmMetric[]>(DEFAULT_METRICS)
  // 주기 비교는 본질적으로 단일 곡선 → 별도 단일 선택.
  const [cycleMetric, setCycleMetric] = useState<RhythmMetric>('emotional')
  const [vm, setVm] = useState<RhythmViewModel | null>(null)
  const [cycleVm, setCycleVm] = useState<CycleCompareViewModel | null>(null)
  const [checkpoint, setCheckpoint] = useState<CheckpointCard | null>(null)
  const [recentFlow, setRecentFlow] = useState<RecentFlow | null>(null)
  const [personalRhythm, setPersonalRhythm] = useState<PersonalRhythm | null>(null)
  const [monthly, setMonthly] = useState<MonthlyComparison | null>(null)
  const [repeatedFlowCards, setRepeatedFlowCards] = useState<RepeatedFlowCard[]>([])
  const [loading, setLoading] = useState(true)
  const [cycleLoading, setCycleLoading] = useState(false)

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0]
  const activePresetKey = NAMED_PRESETS.find((p) => sameSet(p.metrics, selectedMetrics))?.key ?? 'custom'

  const applyPreset = (metrics: RhythmMetric[]) =>
    setSelectedMetrics(METRIC_ORDER.filter((m) => metrics.includes(m)))

  const toggleMetric = (m: RhythmMetric) =>
    setSelectedMetrics((prev) => {
      const has = prev.includes(m)
      if (has && prev.length === 1) return prev // 최소 1개 유지
      const next = has ? prev.filter((x) => x !== m) : [...prev, m]
      return METRIC_ORDER.filter((x) => next.includes(x))
    })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getRhythmViewModel({ days: range.days, bucket: range.bucket }).then((v) => {
      if (!cancelled) {
        setVm(v)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [range.days, range.bucket])

  useEffect(() => {
    let cancelled = false
    void getCheckpointSignals().then((s) => {
      if (!cancelled) setCheckpoint(buildCheckpoint(s))
    })
    void getRecentFlow().then((f) => {
      if (!cancelled) setRecentFlow(f)
    })
    void getPersonalRhythm().then((p) => {
      if (!cancelled) setPersonalRhythm(p)
    })
    void getMonthlyComparison().then((m) => {
      if (!cancelled) setMonthly(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // "반복해서 나타난 큰 흐름" — 진입 시 1회, 실패해도 리듬 화면 전체는 그대로(섹션만 미표시).
  useEffect(() => {
    const today = getTodayISODate()
    const loader = createSnapshotFlowLoader(
      () => getEpisodeInsightSnapshot(today),
      (snap) => setRepeatedFlowCards(presentRhythmRepeatedFlow(snap)),
      (err) => console.error('[Rhythm] repeated flow load failed', err),
    )
    void loader.load()
    return () => loader.dispose()
  }, [])

  useEffect(() => {
    if (viewMode !== 'cycle' || cycleVm) return
    let cancelled = false
    setCycleLoading(true)
    void getCycleCompareViewModel().then((v) => {
      if (!cancelled) {
        setCycleVm(v)
        setCycleLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [viewMode, cycleVm])

  // 겹쳐보기 시리즈: 선택된 각 지표를 방향 통일된 표시값으로. 원본 값은 raw로(툴팁용).
  const series: RhythmSeries[] = vm
    ? selectedMetrics.map((m) => ({
        key: m,
        label: METRIC_LABEL[m],
        color: METRIC_COLOR[m],
        neutral: isNeutral(m),
        values: vm.buckets.map((b) => toDisplayValue(m, b[m])),
        raw: vm.buckets.map((b) => b[m]),
      }))
    : []
  const xTicks = vm
    ? pickTickIndices(vm.buckets.length, 6).map((i) => ({ index: i, label: formatTickDate(vm.buckets[i].endDate) }))
    : []
  const tooltipDates = vm ? vm.buckets.map((b) => formatTooltipDate(b.endDate)) : []
  const presentPhases = vm
    ? (['period', 'premenstrual', 'ovulation'] as CyclePhase[]).filter((p) => vm.buckets.some((b) => b.cyclePhase === p))
    : []

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">리듬</h1>
      </header>

      {/* 보기 방식 */}
      <div className="rhythm-view" role="tablist" aria-label="보기 방식">
        {(['long', 'cycle'] as ViewMode[]).map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={v === viewMode}
            className={`rhythm-view__tab${v === viewMode ? ' rhythm-view__tab--on' : ''}`}
            onClick={() => setViewMode(v)}
          >
            {v === 'long' ? '장기 흐름' : '주기 비교'}
          </button>
        ))}
      </div>

      {viewMode === 'cycle' ? (
        <>
          {/* 주기 비교는 한 번에 한 지표 */}
          <div className="rhythm-metrics" role="tablist" aria-label="항목 선택">
            {METRIC_ORDER.map((m) => {
              const on = m === cycleMetric
              return (
                <button
                  key={m}
                  role="tab"
                  aria-selected={on}
                  className={`rhythm-metric${on ? ' rhythm-metric--on' : ''}`}
                  style={on ? { borderColor: METRIC_COLOR[m], color: METRIC_COLOR[m] } : undefined}
                  onClick={() => setCycleMetric(m)}
                >
                  <span className="rhythm-metric__dot" style={{ background: METRIC_COLOR[m] }} />
                  {METRIC_LABEL[m]}
                </button>
              )
            })}
          </div>
          <CycleCompareView vm={cycleVm} loading={cycleLoading} metric={cycleMetric} color={METRIC_COLOR[cycleMetric]} />
        </>
      ) : (
        <>
          {/* 기간 선택 */}
          <div className="rhythm-tabs" role="tablist" aria-label="기간 선택">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={r.key === rangeKey}
                className={`rhythm-tab${r.key === rangeKey ? ' rhythm-tab--on' : ''}`}
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {loading || !vm ? (
            <GlassCard>
              <p className="rhythm-loading">리듬을 불러오는 중…</p>
            </GlassCard>
          ) : !vm.hasData ? (
            <GlassCard>
              <p className="rhythm-empty">아직 흐름을 그리기엔 기록이 부족해. 며칠 더 쌓이면 여기 선으로 보여줄게.</p>
            </GlassCard>
          ) : (
            <>
              {/* 1. 최근 흐름 (최근 며칠~2주 방향) — 약하면 카드 숨김 */}
              {recentFlow && (
                <GlassCard tint="mint">
                  <SectionHeader title="최근 흐름" />
                  <p className="rhythm-flow">{recentFlowSentence(recentFlow)}</p>
                </GlassCard>
              )}

              {/* 1-2. 반복해서 나타난 큰 흐름 (여러 번 되풀이된 순서) — 없으면 섹션 전체 숨김 */}
              {repeatedFlowCards.length > 0 && (
                <GlassCard tint="sky">
                  <SectionHeader title="반복해서 나타난 큰 흐름" />
                  {repeatedFlowCards.map((c, i) => (
                    <div className="rhythm-repeat" key={i}>
                      <p className="rhythm-repeat__say">{c.sentence}</p>
                      <p className="rhythm-repeat__dates">{c.dates}</p>
                    </div>
                  ))}
                </GlassCard>
              )}

              {/* 2. 나의 반복 흐름 (장기 반복 구조) — 없으면 카드 전체 숨김 */}
              {personalRhythm && (
                <GlassCard tint="lav">
                  <SectionHeader title="나의 반복 흐름" />
                  {personalRhythmSentence(personalRhythm).map((s, i) => (
                    <p className="rhythm-flow" key={i}>
                      {s}
                    </p>
                  ))}
                </GlassCard>
              )}

              {/* 3. 겹쳐보기 그래프 — 여러 지표를 같은 날짜축 위에서 겹쳐 본다 */}
              <GlassCard>
                <SectionHeader title="겹쳐보기" />
                <p className="rhythm-overlay-help">보고 싶은 조합을 골라. 위로 갈수록 편안, 아래로 갈수록 힘듦이야. 식욕은 중립(많고 적음)이라 방향을 매기지 않아.</p>

                {/* 프리셋 */}
                <div className="rhythm-presets" role="group" aria-label="겹쳐볼 조합">
                  {NAMED_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      className={`rhythm-preset${activePresetKey === p.key ? ' rhythm-preset--on' : ''}`}
                      aria-pressed={activePresetKey === p.key}
                      onClick={() => applyPreset(p.metrics)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* 직접 고르기 (범례 겸 켜기/끄기) */}
                <p className="rhythm-pick-label">직접 고르기</p>
                <div className="rhythm-metrics" role="group" aria-label="지표 켜고 끄기">
                  {METRIC_ORDER.map((m) => {
                    const on = selectedMetrics.includes(m)
                    return (
                      <button
                        key={m}
                        aria-pressed={on}
                        className={`rhythm-metric${on ? ' rhythm-metric--on' : ' rhythm-metric--off'}`}
                        style={on ? { borderColor: METRIC_COLOR[m], color: METRIC_COLOR[m] } : undefined}
                        onClick={() => toggleMetric(m)}
                      >
                        <span className="rhythm-metric__dot" style={{ background: on ? METRIC_COLOR[m] : 'var(--ink-3)' }} />
                        {METRIC_LABEL[m]}
                      </button>
                    )
                  })}
                </div>

                <RhythmChart
                  count={vm.buckets.length}
                  series={series}
                  phases={vm.buckets.map((b) => b.cyclePhase)}
                  todayIndex={vm.todayBucketIndex}
                  xTicks={xTicks}
                  tooltipDates={tooltipDates}
                  baselineLabel="평소"
                  showDirection
                />

                {/* 선택 지표가 무엇을 모은 값인지 */}
                <ul className="rhythm-explain">
                  {selectedMetrics.map((m) => (
                    <li className="rhythm-explain__item" key={m}>
                      <span className="rhythm-explain__dot" style={{ background: METRIC_COLOR[m] }} />
                      <span className="rhythm-explain__name">{METRIC_LABEL[m]}</span>
                      <span className="rhythm-explain__desc">{METRIC_EXPLAIN[m]}</span>
                    </li>
                  ))}
                </ul>

                {presentPhases.length > 0 && (
                  <div className="rhythm-phases">
                    {presentPhases.map((p) => (
                      <span className="rhythm-phases__item" key={p}>
                        <span className="rhythm-phases__band" style={{ background: PHASE_COLOR[p] }} />
                        {PHASE_LABEL[p]}
                      </span>
                    ))}
                  </div>
                )}
              </GlassCard>

              {/* 5. 월간 비교 (달 단위 생활 변화) — 결과 없으면 제목·카드 전체 숨김 */}
              {monthly && (
                <GlassCard tint="coral">
                  <SectionHeader title="월간 비교" />
                  {(() => {
                    const view = monthlyComparisonView(monthly)
                    return (
                      <>
                        <p className="rhythm-month-lead">{view.lead}</p>
                        <ul className="rhythm-month-list">
                          {view.lines.map((line, i) => (
                            <li className="rhythm-month-line" key={i}>
                              {line}
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  })()}
                </GlassCard>
              )}

              {/* 6. 최근 일주일 (선택한 지표별 · 보조) */}
              <GlassCard tint="lav">
                <SectionHeader title="최근 일주일" />
                {selectedMetrics.map((m) => {
                  const cmp = vm.weekCompare[m]
                  return (
                    <div className="rhythm-week-block" key={m}>
                      <p className="rhythm-week">
                        <span className="rhythm-week__tag" style={{ color: METRIC_COLOR[m] }}>{METRIC_LABEL[m]}</span>
                        {rhythmCompareSentence(m, cmp)}
                      </p>
                      {cmp.enough && (
                        <p className="rhythm-week-nums">
                          {RHYTHM_METRIC_LABEL[m]} · 최근 7일 {cmp.recentMean} · 이전 28일 {cmp.prevMean}
                          {` (기록 ${cmp.recentN}일 / ${cmp.prevN}일)`}
                        </p>
                      )}
                    </div>
                  )
                })}
              </GlassCard>

              {checkpoint && (
                <GlassCard tint="sky">
                  <SectionHeader title="다가오는 체크포인트" />
                  {checkpoint.sentences.map((s, i) => (
                    <p className="cp-say" key={i}>
                      {s}
                    </p>
                  ))}
                </GlassCard>
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

function CycleCompareView({
  vm,
  loading,
  metric,
  color,
}: {
  vm: CycleCompareViewModel | null
  loading: boolean
  metric: RhythmMetric
  color: string
}) {
  if (loading || !vm) {
    return (
      <GlassCard>
        <p className="rhythm-loading">주기를 맞춰보는 중…</p>
      </GlassCard>
    )
  }
  if (!vm.eligible) {
    return (
      <GlassCard>
        <p className="rhythm-empty">주기 비교를 하려면 생리 시작 기록이 {vm.neededMore}번 더 필요해.</p>
      </GlassCard>
    )
  }
  const curve = vm.byMetric[metric]
  return (
    <GlassCard>
      <CycleCompareChart
        recent={curve.recent}
        previous={curve.previous}
        color={color}
        relMin={vm.relMin}
        relMax={vm.relMax}
        periodLen={vm.periodLen}
      />
      <div className="cc-legend">
        <span className="cc-legend__item">
          <span className="cc-legend__line" style={{ background: color }} />최근 주기
        </span>
        <span className="cc-legend__item">
          <span className="cc-legend__line cc-legend__line--prev" />이전 {vm.compareCycles}주기 평균
        </span>
        <span className="cc-legend__item">
          <span className="cc-legend__band" />생리 중
        </span>
      </div>
      <p className="cc-say">{cycleCompareSentence(metric, curve)}</p>
      <details className="cc-more">
        <summary>근거 보기</summary>
        <div className="cc-nums">
          <span>평소 수준 {curve.baseline} · 비교한 주기 {vm.compareCycles}개</span>
          {curve.recent.map((p) => {
            const prev = curve.previous.find((q) => q.rel === p.rel)
            const label = p.rel === 0 ? '생리 시작' : p.rel < 0 ? `${-p.rel}일 전` : `${p.rel}일 후`
            return (
              <span key={p.rel}>
                {label}: 최근 {p.mean ?? '—'} / 이전 {prev?.mean ?? '—'} (주기 {prev?.n ?? 0})
              </span>
            )
          })}
        </div>
      </details>
    </GlassCard>
  )
}
