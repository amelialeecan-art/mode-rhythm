import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader, Chip, ChipGroup } from '../../design'
import {
  EXPERIMENT_INTERVENTIONS,
  INTERVENTION_LABEL,
  experimentRepository,
  getExperimentsWithAnalysis,
} from '../../data'
import { CORE_STATE_META } from '../../data/catalog/coreState'
import type { CoreMetric, ExperimentInterventionCode, Experiment } from '../../data'
import type { ExperimentAnalysis } from '../../engine/v2'
import { getTodayISODate, parseISODate, toISODate } from '../../lib/date'
import { assertGuard } from '../../copy/tone'
import { beforeAfterLine, confidenceWords } from './friendlyCopy'

function addDaysISO(date: string, n: number): string {
  const d = parseISODate(date)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** 실험 결과 한 줄 — 인과("좋아졌어") 금지, 관찰 비교로만. 단정 금지 가드 통과. */
function resultLine(exp: Experiment, a: ExperimentAnalysis): string {
  if (a.status !== 'ok') {
    return assertGuard('아직 비교할 기록이 부족해요. 조금 더 쌓이면 여기서 비교해 볼게요.')
  }
  const dir = a.effectDifference >= 0 ? '전보다 조금 높았어요' : '전보다 조금 낮았어요'
  return assertGuard(`바꿔본 기간에는 ${CORE_STATE_META[exp.targetMetric].label}이(가) ${dir}.`)
}

/** 실험 전 → 실험 기간 실측 비교(엔진이 준 평균만). 두 값이 있을 때만. */
function beforeAfter(a: ExperimentAnalysis): string | null {
  return beforeAfterLine(a.baselineMean, a.interventionMean, { beforeLabel: '실험 전에는', afterLabel: '실험 기간에는' })
}

/**
 * 개인 실험(N-of-1) 섹션. 생활요인만, 한 번에 하나.
 * ⚠️ 약 중단/용량 변경은 실험으로 제안/생성하지 않는다(개입 목록에 없음).
 */
export function ExperimentSection() {
  const [items, setItems] = useState<{ experiment: Experiment; analysis: ExperimentAnalysis }[]>([])
  const [reload, setReload] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getExperimentsWithAnalysis().then((r) => {
      if (!cancelled) setItems(r)
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  return (
    <GlassCard tint="mint">
      <SectionHeader title="내 실험" subtitle="생활 습관을 한 번에 하나만 바꿔서 비교해요" star />

      {items.length === 0 ? (
        <p className="state-hint" style={{ marginTop: 8 }}>아직 실험이 없어요. 관찰에서 눈에 띈 생활요인을 직접 테스트해볼 수 있어요.</p>
      ) : (
        <ul className="exp-list">
          {items.map(({ experiment, analysis }) => (
            <li className="exp-item" key={experiment.id}>
              <div className="exp-top">
                <span className="exp-title">{INTERVENTION_LABEL[experiment.interventionCode]}</span>
                <span className={`exp-status exp-status--${experiment.status}`}>{STATUS_LABEL[experiment.status]}</span>
              </div>
              <p className="exp-say">{resultLine(experiment, analysis)}</p>
              {analysis.status === 'ok' && (
                <>
                  {beforeAfter(analysis) && <p className="tmp-num">{beforeAfter(analysis)}</p>}
                  <p className="exp-meta">분석할 수 있었던 날은 {analysis.usableObservations}일이에요.</p>
                  <details className="tmp-more">
                    <summary>자세히 보기</summary>
                    <p className="tmp-meta">
                      {confidenceWords(analysis.confidence)}
                      {` 실험 기간 기록률 ${Math.round(analysis.loggingCoverage * 100)}%`}
                      {analysis.ci && ` · 범위 ${analysis.ci.lo.toFixed(1)}~${analysis.ci.hi.toFixed(1)}`}
                    </p>
                  </details>
                </>
              )}
              <div className="exp-actions">
                {experiment.status !== 'completed' && (
                  <button className="dtl-btn" onClick={() => experimentRepository.setStatus(experiment.id!, 'completed').then(() => setReload((r) => r + 1))}>완료로 표시</button>
                )}
                <button className="dtl-btn dtl-btn--del" onClick={() => experimentRepository.deleteById(experiment.id!).then(() => setReload((r) => r + 1))}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button className="meal-add-btn" style={{ borderColor: 'var(--mint-2)', color: 'var(--mint-ink)', background: 'rgba(91,199,158,0.09)' }} onClick={() => setOpen(true)}>
          ＋ 실험 시작
        </button>
      ) : (
        <ExperimentForm onDone={() => { setOpen(false); setReload((r) => r + 1) }} onCancel={() => setOpen(false)} />
      )}
      <p className="state-hint">약 중단·용량 변경 같은 의료 변경은 실험 대상이 아니에요. 생활 습관만 다뤄요.</p>
    </GlassCard>
  )
}

const STATUS_LABEL: Record<Experiment['status'], string> = {
  planned: '계획',
  baseline: '기준 측정',
  intervention: '실험 중',
  completed: '완료',
  abandoned: '중단',
}

function ExperimentForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState<ExperimentInterventionCode>('reduce_prebed_screen')
  const meta = EXPERIMENT_INTERVENTIONS.find((i) => i.code === code)!
  const [metric, setMetric] = useState<CoreMetric>(meta.suggestedMetrics[0])
  const today = getTodayISODate()

  const pickCode = (c: ExperimentInterventionCode) => {
    setCode(c)
    const m = EXPERIMENT_INTERVENTIONS.find((i) => i.code === c)!
    setMetric(m.suggestedMetrics[0])
  }

  const onSave = async () => {
    // 기준 2주(과거) → 실험 2주(오늘부터) 기본 설계.
    await experimentRepository.create({
      title: INTERVENTION_LABEL[code],
      targetMetric: metric,
      interventionCode: code,
      baselineStart: addDaysISO(today, -14),
      baselineEnd: addDaysISO(today, -1),
      interventionStart: today,
      interventionEnd: addDaysISO(today, 13),
      status: 'intervention',
      source: 'manual',
      schemaVersion: 1,
    })
    onDone()
  }

  return (
    <div className="exp-form">
      <p className="event-group__label">무엇을 바꿔볼까요? (생활 습관)</p>
      <ChipGroup label="개입">
        {EXPERIMENT_INTERVENTIONS.map((i) => (
          <Chip key={i.code} label={i.label} tone="mint" selected={code === i.code} onToggle={() => pickCode(i.code)} />
        ))}
      </ChipGroup>
      <p className="event-group__label" style={{ marginTop: 14 }}>무엇을 관찰할까요?</p>
      <ChipGroup label="관찰 metric">
        {meta.suggestedMetrics.map((m) => (
          <Chip key={m} label={CORE_STATE_META[m].label} tone="lav" selected={metric === m} onToggle={() => setMetric(m)} />
        ))}
      </ChipGroup>
      <p className="state-hint">기준 2주(지난 기록) → 실험 2주(오늘부터)로 비교해요. 나머지는 평소대로 지내요.</p>
      <div className="meal-form-actions">
        <button className="btn-primary" onClick={onSave}>실험 시작</button>
        <button className="custom-cancel-btn" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}
