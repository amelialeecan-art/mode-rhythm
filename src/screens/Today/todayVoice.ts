/* =====================================================================
   MODE · Today 화면 보조 문구 (표시 전용, 순수 함수)
   최근 흐름/반복 요인 결과를 한 문장으로 옮긴다. 새 분석 기준을 만들지 않는다.
   단정·진단·신뢰도 숫자·근거 횟수를 문장에 넣지 않는다.
   ===================================================================== */
import type { RecentFlow, FlowDomain } from '../../engine'
import type { FlowDriverCard } from '../../data/services/patternAnalysisService'

const FLOW_DOMAIN_LABEL: Record<FlowDomain, string> = {
  emotional: '감정',
  appetite: '식욕',
  sleep: '수면',
  body: '몸',
  function: '생활기능',
}

/**
 * '최근 변화 신호' 한 문장. stable(뚜렷하지 않음)이면 null → 카드 숨김.
 */
export function recentChangeSentence(flow: RecentFlow | null): string | null {
  if (!flow || !flow.displayable) return null
  const names = flow.leading.map((d) => FLOW_DOMAIN_LABEL[d]).join('·')
  if (flow.status === 'depleting') return `최근 며칠 ${names || '몇 영역'}이 조금씩 떨어지는 흐름이에요.`
  if (flow.status === 'recovering') return `최근 며칠 ${names || '몇 영역'}이 회복되는 흐름이에요.`
  if (flow.status === 'mixed') return '최근 며칠은 영역마다 오르내림이 섞인 흐름이에요.'
  return null // stable 등은 숨김
}

/**
 * '다음에 자주 이어진 변화' 한 문장. 근거(기존 flowDriver)가 없으면 null → 카드 숨김.
 */
export function followUpSentence(driver: FlowDriverCard | null): string | null {
  if (!driver) return null
  const domain = driver.affectedDomains.map((d) => FLOW_DOMAIN_LABEL[d]).join('·')
  const lead = driver.cumulative ? '이어진 뒤' : '뒤'
  return `이전에 ${driver.label}이 ${lead} ${domain || '리듬'} 흐름이 함께 바뀐 적이 있어요.`
}
