import { useEffect, useState } from 'react'
import { GlassCard, SectionHeader } from '../../design'
import { getCycleAlignedInsights, type CycleAlignedInsights, type CycleAlignedEntry } from '../../data/services/longAnalysisService'
import { assertGuard } from '../../copy/tone'
import { cycleWindowPhrase, repetitionPhrase, confidenceWords, beforeAfterLine, approxRating } from './friendlyCopy'

/**
 * hunger vs craving 관계 해석(§7) — MODE의 핵심 가치.
 * 생리 전 "배가 더 고픈 게 아니라 음식이 더 당겼다"를 데이터가 지지할 때만 만든다.
 * 조건: 둘 다 ok · 배고픔 변화는 거의 없음 · 음식 당김은 뚜렷이 큼.
 */
function hungerCravingContrast(entries: CycleAlignedEntry[]): { say: string; num: string } | null {
  const hunger = entries.find((e) => e.metric === 'physicalHunger')?.result
  const craving = entries.find((e) => e.metric === 'craving')?.result
  if (!hunger || !craving || hunger.status !== 'ok' || craving.status !== 'ok') return null
  const hungerFlat = Math.abs(hunger.baselineDifference) < 0.6
  const cravingUp = craving.baselineDifference >= 1.0 && craving.baselineDifference > Math.abs(hunger.baselineDifference) + 0.8
  if (!hungerFlat || !cravingUp) return null
  const say = assertGuard('생리 전에는 배가 더 고팠던 건 아니야. 음식이 훨씬 더 당겼어.')
  const num = `배고픔은 거의 그대로였는데, 음식 당김은 ${approxRating(craving.baselineMean)}에서 ${approxRating(craving.windowMean)}로 올라갔어.`
  return { say, num }
}

/** "생리하기 일주일 전쯤에는 음식이 당기는 정도가 평소보다 확 더 높았어." (반말 · 단정 금지) */
function sentence(e: CycleAlignedEntry): string {
  const r = e.result
  const big = Math.abs(r.effectSize) >= 0.8 ? '확 ' : ''
  const dir = r.baselineDifference >= 0 ? `${big}더 높았어` : `${big}더 낮았어`
  return assertGuard(`${cycleWindowPhrase(r.window.fromDay)} ${e.label}이(가) 평소보다 ${dir}.`)
}

/** 평소 → 이때 실측 비교 문장(엔진이 준 실제 평균만). 두 값이 없으면 null. */
function numLine(e: CycleAlignedEntry): string | null {
  return beforeAfterLine(e.result.baselineMean, e.result.windowMean)
}

/** 반복을 사람말로. "같은 방향/4/4" 대신 "최근 네 번 모두 비슷했어". */
function repeatLine(e: CycleAlignedEntry): string {
  return repetitionPhrase(e.result.sameDirectionCycleCount, e.result.usableCycleCount)
}

/** 자세히 보기용 — 숫자·범위·보정을 사람말 라벨로. */
function detailLine(e: CycleAlignedEntry): string {
  const r = e.result
  const base = `완료된 주기 ${r.usableCycleCount}개 · 관찰 ${r.observations}회 · 기록 비율 ${Math.round(r.coverageRate * 100)}%`
  const ci = r.ci ? ` · 범위 ${r.ci.lo.toFixed(1)}~${r.ci.hi.toFixed(1)}` : ''
  const adj = r.adjusted ? ' · 개인 평소 수준 대비로 봤어' : ''
  return `${base}${ci}${adj}`
}

/**
 * Cycle-aligned retrospective 카드. 완료된 3+ 주기가 있을 때만.
 * 상관계수 하나가 아니라 효과 크기 + N + 반복성 + 불확실성 + 보정 + confidence를 함께 보여준다.
 */
export function CycleAlignedCard() {
  const [data, setData] = useState<CycleAlignedInsights | null>(null)

  useEffect(() => {
    let cancelled = false
    void getCycleAlignedInsights().then((d) => {
      if (!cancelled) setData(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return null

  // 완료 주기 부족 → 조용히 숨김(카드 자체 미노출)
  if (data.completedCycles < data.minCyclesRequired) return null

  // 보고할 만한 것: status ok + confidence tentative 이상.
  const shown = data.entries
    .filter((e) => e.result.status === 'ok' && e.result.confidence !== 'insufficient' && e.result.confidence !== 'exploratory')
    .sort((a, b) => Math.abs(b.result.effectSize) - Math.abs(a.result.effectSize))
    .slice(0, 5)

  if (shown.length === 0) return null

  // hunger vs craving 관계 해석(데이터가 지지할 때만) — 핵심 insight로 위에 강조.
  const contrast = hungerCravingContrast(data.entries)

  return (
    <GlassCard tint="lav">
      <SectionHeader title="주기와 함께 반복된 변화" subtitle={`완료된 ${data.completedCycles}개 주기를 겹쳐 본 거야`} />
      {data.strongerWithMoreCycles && (
        <p className="state-hint" style={{ marginTop: 4 }}>주기가 4~6번쯤 쌓이면 더 믿을 만해져.</p>
      )}
      {contrast && (
        <div className="ca-highlight">
          <p className="ca-say">{contrast.say}</p>
          <p className="tmp-num">{contrast.num}</p>
        </div>
      )}
      <ul className="ca-list">
        {shown.map((e) => (
          <li className="ca-item" key={e.metric}>
            <p className="ca-say">{sentence(e)}</p>
            {numLine(e) && <p className="tmp-num">{numLine(e)}</p>}
            <p className="tmp-num">{repeatLine(e)}</p>
            <details className="tmp-more">
              <summary>자세히 보기</summary>
              <p className="tmp-meta">{confidenceWords(e.result.confidence)} {detailLine(e)}</p>
            </details>
          </li>
        ))}
      </ul>
      <p className="state-hint">이미 지나간 주기들을 겹쳐 본 거야. 원인이라고 단정하진 않아.</p>
    </GlassCard>
  )
}
