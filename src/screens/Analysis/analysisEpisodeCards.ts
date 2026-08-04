/* =====================================================================
   MODE · Analysis 화면용 episode 카드 구성(순수)
   presentEpisodeInsight 결과를 "화면 카드 구조"로 조립한다. aftereffect/recovery는
   최근 흐름 카드 안의 작은 구분 영역으로, currentMatch는 반복 카드 안의 보조 영역으로
   중첩한다. 새 흐름 카드가 하나라도 있으면 기존 누적 카드는 숨긴다.
   ⚠️ 계산/서비스/repository를 부르지 않는다(presentation 결과만 재배치).
   ===================================================================== */
import { presentEpisodeInsight, type FlowCard } from './episodeInsightPresentation'
import type { EpisodeInsightSnapshot } from '../../data/services/episodeInsightService'

/** 카드 안의 작은 구분 영역(소제목 + 본문). */
export interface CardSubsection {
  subtitle: string
  lines: string[]
}

/** 최근에 이어진 흐름 카드(여파·회복을 내부 구분 영역으로 포함). */
export interface RecentFlowCard {
  title: string
  lines: string[]
  status?: string
  aftereffect?: CardSubsection
  recovery?: CardSubsection
}

/** 반복해서 나타난 순서 카드(현재 일치를 내부 보조 영역으로 포함). */
export interface RepeatedFlowCard {
  title: string
  lines: string[]
  currentMatch?: CardSubsection
}

export interface AnalysisEpisodeCards {
  recentFlow: RecentFlowCard | null
  repeatedFlow: RepeatedFlowCard | null
  /** 새 흐름 카드가 있으면 기존 "이어지며 커진 변화" 누적 카드를 숨긴다. */
  hideCumulative: boolean
}

const sub = (card: FlowCard | null): CardSubsection | undefined => (card ? { subtitle: card.title, lines: card.lines } : undefined)

/**
 * snapshot → Analysis 화면 카드 구조. 화면은 이 결과만 렌더링한다.
 * 카드가 모두 없으면 recentFlow/repeatedFlow는 null, hideCumulative는 false.
 */
export function composeAnalysisEpisodeCards(snapshot: EpisodeInsightSnapshot): AnalysisEpisodeCards {
  const p = presentEpisodeInsight(snapshot)

  const recentFlow: RecentFlowCard | null = p.recentFlow
    ? {
        title: p.recentFlow.title,
        lines: p.recentFlow.lines,
        ...(p.recentFlow.status ? { status: p.recentFlow.status } : {}),
        ...(sub(p.aftereffect) ? { aftereffect: sub(p.aftereffect) } : {}),
        ...(sub(p.recovery) ? { recovery: sub(p.recovery) } : {}),
      }
    : null

  const repeatedFlow: RepeatedFlowCard | null = p.repeatedFlow
    ? {
        title: p.repeatedFlow.title,
        lines: p.repeatedFlow.lines,
        ...(sub(p.currentMatch) ? { currentMatch: sub(p.currentMatch) } : {}),
      }
    : null

  return { recentFlow, repeatedFlow, hideCumulative: recentFlow !== null || repeatedFlow !== null }
}
