/* =====================================================================
   MODE · Phase 1 mock 데이터 (화면 표시용 — 실제 계산 아님)
   후속 단계에서 엔진/DB 결과로 대체된다. 절대 영구 데이터 아님.
   ===================================================================== */
import type { HeatmapDay } from '../design'
import type { GraphSlide } from '../design'

/** 6월 캘린더 mock (1일이 일요일 가정, 앞 빈칸 없음). 색 단계 0~4. */
export const MOCK_CALENDAR_DAYS: HeatmapDay[] = [
  { day: 1, intensity: 0, label: '안정' },
  { day: 2, intensity: 1, label: '안정' },
  { day: 3, intensity: 1, label: '집중' },
  { day: 4, intensity: 3, label: '예민' },
  { day: 5, intensity: 3, label: '식욕' },
  { day: 6, intensity: 2, label: '회복' },
  { day: 7, intensity: 2, label: '회복' },
  { day: 8, intensity: 0, label: '안정' },
  { day: 9, intensity: 2, label: '미제' },
  { day: 10, intensity: 1, label: '집중' },
  { day: 11, intensity: 1, label: '집중' },
  { day: 12, intensity: 4, label: '예민' },
  { day: 13, intensity: 3, label: '식욕' },
  { day: 14, intensity: 1, label: '안정' },
  { day: 15, intensity: 3, label: '예민' },
  { day: 16, intensity: 2, label: '미제' },
  { day: 17, intensity: 3, label: '식욕' },
  { day: 18, intensity: 2, label: '회복' },
  { day: 19, intensity: 0, label: '안정' },
  { day: 20, intensity: 4, label: '예민' },
  { day: 21, intensity: 4, label: '예민', today: true },
  { day: 22 },
  { day: 23 },
  { day: 24 },
  { day: 25 },
  { day: 26 },
  { day: 27 },
  { day: 28 },
  { day: 29 },
  { day: 30 },
]

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
