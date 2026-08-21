/* =====================================================================
   MODE · 오늘 머릿속과 마음 신호 카탈로그 (update2)
   진단·성향 판정이 아니라, 하루에 실제로 느끼거나 한 일을 기록하는 원본 데이터다.
   DailyLog.mindSignalCodes(비인덱스 optional 문자열 배열)로 저장한다.

   - 감정(emotionCodes: 짜증·불안·가라앉음)과 역할을 섞지 않는다.
   - 머릿속 여유(mentalSpaceLevel: 하루 전체 여유 정도)와도 다르다.
   - 점수/도메인/감정 코드로 자동 변환하지 않는다(이번 단계는 입력·저장·표시만).
   - 화면에는 내부 카테고리명·영어 코드를 노출하지 않는다(사람말 라벨만).
   ===================================================================== */

export interface MindSignalItem {
  code: string
  label: string
}
export interface MindSignalGroup {
  /** 사용자에게 보여줄 소제목. 내부 카테고리명이 아니다. */
  title: string
  items: MindSignalItem[]
}

export const MIND_SIGNAL_GROUPS: MindSignalGroup[] = [
  {
    title: '생각이 계속 이어졌어',
    items: [
      { code: 'worrying', label: '괜히 걱정이 많았어' },
      { code: 'thought_loop', label: '같은 생각이 계속 맴돌았어' },
      { code: 'tasks_on_mind', label: '해야 할 일이 계속 떠올랐어' },
      { code: 'small_things_bothered', label: '사소한 것도 계속 신경 쓰였어' },
      { code: 'mind_would_not_rest', label: '머리가 쉬지 않았어' },
      { code: 'too_many_thoughts', label: '여러 생각이 한꺼번에 몰렸어' },
    ],
  },
  {
    title: '마음과 자극이 버거웠어',
    items: [
      { code: 'sensory_overload', label: '소리·빛·사람이 버거웠어' },
      { code: 'took_things_hard', label: '작은 말도 크게 받아들였어' },
      { code: 'on_edge', label: '마음이 계속 긴장돼 있었어' },
      { code: 'need_time_alone', label: '혼자 정리할 시간이 필요했어' },
    ],
  },
  {
    title: '움직이거나 시작하기 어려웠어',
    items: [
      { code: 'no_desire', label: '아무것도 하기 싫었어' },
      { code: 'little_enjoyment', label: '즐거운 느낌이 별로 없었어' },
      { code: 'empty_lonely', label: '외롭거나 공허했어' },
      { code: 'self_blame', label: '스스로를 탓하는 생각이 많았어' },
      { code: 'hard_to_start', label: '시작하기 어려웠어' },
      { code: 'avoided_tasks', label: '해야 할 일을 피했어' },
      { code: 'time_drifted', label: '멍하게 시간이 지나갔어' },
      { code: 'hard_to_get_up', label: '침대나 소파에서 일어나기 어려웠어' },
      { code: 'delayed_replies', label: '답장이나 연락을 미뤘어' },
    ],
  },
]

/** 코드 → 사람말 라벨 (Calendar 원본 표시용). unknown 코드는 여기 없으면 표시하지 않는다. */
export const MIND_SIGNAL_LABEL: Map<string, string> = new Map(
  MIND_SIGNAL_GROUPS.flatMap((g) => g.items).map((i) => [i.code, i.label]),
)

/** 저장된 코드들 → 사람말 라벨 목록(알 수 없는 코드는 건너뛴다 — 원본은 보존, 화면엔 미노출). */
export function mindSignalLabels(codes: string[] | undefined): string[] {
  return (codes ?? []).map((c) => MIND_SIGNAL_LABEL.get(c)).filter((l): l is string => !!l)
}
