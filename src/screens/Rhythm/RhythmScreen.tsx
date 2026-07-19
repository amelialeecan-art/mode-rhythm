import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader, RhythmChart, type RhythmSeries } from '../../design'
import {
  getRhythmViewModel,
  getCycleCompareViewModel,
  type RhythmViewModel,
  type CycleCompareViewModel,
  type RhythmMetric,
  type CyclePhase,
} from '../../data/services/rhythmService'
import { getRhythmForecastViewModel, type RhythmForecastViewModel } from '../../data/services/rhythmForecastService'
import { parseISODate, formatMonthDay, formatWeekday } from '../../lib/date'
import { rhythmCompareSentence, cycleCompareSentence } from './rhythmVoice'
import { CycleCompareChart } from './CycleCompareChart'
import './rhythm.css'

const OFFSET_LABEL: Record<number, string> = { 1: '내일', 2: '모레', 3: '3일 뒤' }

const RANGES = [
  { key: '30d', label: '30일', days: 30, bucket: 'day' as const },
  { key: '3m', label: '3개월', days: 90, bucket: 'week' as const },
  { key: '6m', label: '6개월', days: 180, bucket: 'week' as const },
  { key: '1y', label: '1년', days: 365, bucket: 'week' as const },
]

const METRICS: { key: RhythmMetric; label: string; color: string }[] = [
  { key: 'emotional', label: '감정', color: '#A985E8' },
  { key: 'appetite', label: '식욕', color: '#FF9576' },
  { key: 'sleep', label: '수면', color: '#74A8EC' },
  { key: 'body', label: '몸', color: '#5BC79E' },
  { key: 'recovery', label: '회복', color: '#46BBB0' },
]

const PHASE_LABEL: Record<CyclePhase, string> = {
  period: '생리 중',
  premenstrual: '월경 전 구간',
  ovulation: '배란 추정 구간',
}
const PHASE_COLOR: Record<CyclePhase, string> = {
  period: '#E58BBE',
  premenstrual: '#FF9576',
  ovulation: '#74A8EC',
}

type ViewMode = 'long' | 'cycle'

export function RhythmScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('long')
  const [rangeKey, setRangeKey] = useState('3m')
  const [metric, setMetric] = useState<RhythmMetric>('emotional')
  const [vm, setVm] = useState<RhythmViewModel | null>(null)
  const [cycleVm, setCycleVm] = useState<CycleCompareViewModel | null>(null)
  const [forecast, setForecast] = useState<RhythmForecastViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [cycleLoading, setCycleLoading] = useState(false)

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1]
  const metricColor = METRICS.find((m) => m.key === metric)?.color ?? '#A985E8'

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
    void getRhythmForecastViewModel().then((f) => {
      if (!cancelled) setForecast(f)
    })
    return () => {
      cancelled = true
    }
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

  const series: RhythmSeries[] = vm
    ? [{ key: metric, color: metricColor, values: vm.buckets.map((b) => b[metric]) }]
    : []
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

      {/* 항목 선택 (두 보기 공용) */}
      <div className="rhythm-metrics" role="tablist" aria-label="항목 선택">
        {METRICS.map((m) => {
          const on = m.key === metric
          return (
            <button
              key={m.key}
              role="tab"
              aria-selected={on}
              className={`rhythm-metric${on ? ' rhythm-metric--on' : ''}`}
              style={on ? { borderColor: m.color, color: m.color } : undefined}
              onClick={() => setMetric(m.key)}
            >
              <span className="rhythm-metric__dot" style={{ background: m.color }} />
              {m.label}
            </button>
          )
        })}
      </div>

      {viewMode === 'cycle' ? (
        <CycleCompareView vm={cycleVm} loading={cycleLoading} metric={metric} color={metricColor} />
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
              <p className="rhythm-empty">아직 흐름을 그리기엔 기록이 부족해요. 며칠 더 쌓이면 여기 선으로 보여줄게요.</p>
            </GlassCard>
          ) : (
            <>
              <GlassCard>
                <RhythmChart
                  count={vm.buckets.length}
                  series={series}
                  phases={vm.buckets.map((b) => b.cyclePhase)}
                  todayIndex={vm.todayBucketIndex}
                />
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

              <GlassCard tint="lav">
                <SectionHeader title="최근 일주일" />
                <p className="rhythm-week">{rhythmCompareSentence(metric, vm.weekCompare[metric])}</p>
                {vm.weekCompare[metric].enough && (
                  <details className="rhythm-week-more">
                    <summary>근거 보기</summary>
                    <p className="rhythm-week-nums">
                      최근 7일 평균 {vm.weekCompare[metric].recentMean} · 이전 28일 평균 {vm.weekCompare[metric].prevMean}
                      {` (기록 ${vm.weekCompare[metric].recentN}일 / ${vm.weekCompare[metric].prevN}일)`}
                    </p>
                  </details>
                )}
              </GlassCard>

              {forecast && forecast.hasData && forecast.next3Days.length > 0 && (
                <GlassCard tint="sky">
                  <SectionHeader title="다음 3일 흐름" subtitle="실제 기록이 아니라, 최근 흐름과 주기 위치를 바탕으로 한 참고예요" />
                  <div className="fc3">
                    {forecast.next3Days.map((d) => {
                      const date = parseISODate(d.date)
                      return (
                        <div className="fc3__card" key={d.date}>
                          <span className="fc3__day">
                            {OFFSET_LABEL[d.dayOffset]} · {formatMonthDay(date)} {formatWeekday(date).slice(0, 1)}
                          </span>
                          <span className="fc3__mode">{d.label} 가능성</span>
                          {d.subLabel && <span className="fc3__sub">{d.subLabel}</span>}
                          <span className="fc3__meta">참고도 {d.confidence} · 리듬 {d.predictedScores.rhythmLoad}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="rhythm-note">기록이 쌓이면 더 개인화돼요. 확정은 아니에요.</p>
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
        <p className="rhythm-empty">주기 비교를 하려면 생리 시작 기록이 {vm.neededMore}번 더 필요해요.</p>
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
          <span>평소 기준선 {curve.baseline} · 비교 주기 {vm.compareCycles}개</span>
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
