/* =====================================================================
   MODE · mock 데이터 (Analysis/Forecast 화면 표시용 — 실제 계산 아님)
   후속 단계에서 엔진/DB 결과로 대체된다. 절대 영구 데이터 아님.
   (Calendar는 5단계에서 실제 dailyScores 기반으로 전환됨)
   ===================================================================== */
import type { GraphSlide } from '../design'

/** 분석 화면 슬라이드 그래프 mock (0~1 값). */
export const MOCK_GRAPH_SLIDES: GraphSlide[] = [
  {
    key: 'emotion',
    title: '감정 부하 흐름',
    subtitle: '이번 달 · 흐름 먼저',
    color: '#A985E8',
    data: [0.3, 0.4, 0.34, 0.5, 0.6, 0.54, 0.7, 0.64, 0.5, 0.46, 0.6, 0.72, 0.82, 0.6, 0.5, 0.66],
  },
  {
    key: 'appetite',
    title: '식욕 변동 흐름',
    subtitle: '이번 달 · 변동 빈도',
    color: '#FF9576',
    data: [0.5, 0.44, 0.6, 0.7, 0.6, 0.8, 0.64, 0.54, 0.7, 0.86, 0.7, 0.6, 0.76, 0.82, 0.66, 0.6],
  },
  {
    key: 'sleep',
    title: '수면 부하 흐름',
    subtitle: '이번 달 · 누적 피로',
    color: '#74A8EC',
    data: [0.4, 0.5, 0.6, 0.55, 0.7, 0.6, 0.5, 0.66, 0.76, 0.6, 0.5, 0.55, 0.7, 0.6, 0.5, 0.45],
  },
]

/** 이번 주 흐름 mock (예보 화면). */
export const MOCK_WEEK_FLOW: { day: string; shortLabel: string; tone: string }[] = [
  { day: '월', shortLabel: '회복', tone: 'mint' },
  { day: '화', shortLabel: '집중', tone: 'sky' },
  { day: '수', shortLabel: '안정', tone: 'mint' },
  { day: '목', shortLabel: '예민', tone: 'lav' },
  { day: '금', shortLabel: '식욕', tone: 'coral' },
]
