import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader, RhythmChart, type RhythmSeries } from '../../design'
import { getRhythmViewModel, type RhythmViewModel } from '../../data/services/rhythmService'
import { getRhythmForecastViewModel, type RhythmForecastViewModel } from '../../data/services/rhythmForecastService'
import { parseISODate, formatMonthDay, formatWeekday } from '../../lib/date'
import './rhythm.css'

const OFFSET_LABEL: Record<number, string> = { 1: '내일', 2: '모레', 3: '3일 뒤' }

const BASE_LINES = [
  { key: 'emotional', label: '감정', color: '#A985E8' },
  { key: 'appetite', label: '식욕', color: '#FF9576' },
  { key: 'sleep', label: '수면', color: '#74A8EC' },
] as const

const TOGGLE_LINES = [
  { key: 'body', label: '몸', color: '#5BC79E' },
  { key: 'recovery', label: '회복', color: '#46BBB0' },
] as const

const PHASE_LEGEND = [
  { label: '생리 중', color: '#E58BBE' },
  { label: '월경 전 구간', color: '#FF9576' },
  { label: '배란 추정 구간', color: '#74A8EC' },
]

type LineKey = 'emotional' | 'appetite' | 'sleep' | 'body' | 'recovery'

export function RhythmScreen() {
  const [vm, setVm] = useState<RhythmViewModel | null>(null)
  const [forecast, setForecast] = useState<RhythmForecastViewModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBody, setShowBody] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([getRhythmViewModel({ days: 30 }), getRhythmForecastViewModel()]).then(([v, f]) => {
      if (cancelled) return
      setVm(v)
      setForecast(f)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const buildSeries = (vmodel: RhythmViewModel): RhythmSeries[] => {
    const pick = (key: LineKey, color: string): RhythmSeries => ({
      key,
      color,
      values: vmodel.days.map((d) => d[key]),
    })
    const series: RhythmSeries[] = BASE_LINES.map((l) => pick(l.key, l.color))
    if (showBody) series.push(pick('body', '#5BC79E'))
    if (showRecovery) series.push(pick('recovery', '#46BBB0'))
    return series
  }

  return (
    <>
      <header className="screen-head">
        <h1 className="screen-head__title">리듬</h1>
        <p className="screen-head__sub">최근 30일, 실제 기록 기준 흐름이에요</p>
      </header>

      {loading ? (
        <GlassCard>
          <p className="rhythm-loading">리듬을 불러오는 중…</p>
        </GlassCard>
      ) : !vm || !vm.hasData ? (
        <GlassCard>
          <p className="rhythm-empty">
            아직 리듬을 그리기엔 기록이 부족해요. 며칠 더 기록하면 감정·식욕·수면이 어떻게 같이 움직였는지 흐름으로 볼 수 있어요.
          </p>
        </GlassCard>
      ) : (
        <>
          <GlassCard>
            {/* 라인 토글 */}
            <div className="rhythm-legend">
              {BASE_LINES.map((l) => (
                <span className="rhythm-legend__item" key={l.key}>
                  <span className="rhythm-legend__dot" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
              {TOGGLE_LINES.map((l) => {
                const on = l.key === 'body' ? showBody : showRecovery
                return (
                  <button
                    key={l.key}
                    className={`rhythm-toggle${on ? ' rhythm-toggle--on' : ''}`}
                    style={on ? { borderColor: l.color, color: l.color } : undefined}
                    onClick={() => (l.key === 'body' ? setShowBody((v) => !v) : setShowRecovery((v) => !v))}
                  >
                    <span className="rhythm-legend__dot" style={{ background: l.color }} />
                    {l.label}
                  </button>
                )
              })}
            </div>

            <RhythmChart
              count={vm.days.length}
              series={buildSeries(vm)}
              phases={vm.days.map((d) => d.cyclePhase)}
              todayIndex={vm.todayIndex}
            />

            {/* 주기 오버레이 범례 */}
            <div className="rhythm-phases">
              {PHASE_LEGEND.map((p) => (
                <span className="rhythm-phases__item" key={p.label}>
                  <span className="rhythm-phases__band" style={{ background: p.color }} />
                  {p.label}
                </span>
              ))}
            </div>
            <p className="rhythm-note">
              세로 점선은 오늘이에요. 색 띠는 날짜 기준으로 계산된 주기 구간이고, 생리 기록을 고른 게 아니라 앱이 계산한 구간이에요.
            </p>
          </GlassCard>

          {/* 이번 리듬에서 보이는 것 */}
          {vm.observations.length > 0 && (
            <GlassCard tint="lav">
              <SectionHeader title="이번 리듬에서 보이는 것" subtitle="기록된 흐름에서 관찰된 것들 (단정 아님)" />
              <ul className="rhythm-obs">
                {vm.observations.map((o, i) => (
                  <li className="rhythm-obs__item" key={i}>
                    <span className="rhythm-obs__title">{o.title}</span>
                    <span className="rhythm-obs__body">{o.body}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}

          {/* 다음 3일 흐름 (참고 — 미래 예측 확정 아님, 그래프엔 넣지 않음) */}
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
  )
}
