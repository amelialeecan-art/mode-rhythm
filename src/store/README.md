# store/ — 상태관리 (Zustand, 아직 구현하지 않음)

**Phase 1에서는 비어 있음 (placeholder).**

화면 ↔ 엔진/저장 계층을 중개하는 Zustand 스토어가 들어갈 자리.

예정:

```
store/
  useLogStore.ts       # 오늘의 기록 입력 상태 / 저장 트리거 (2~3단계)
  useScoreStore.ts     # dailyScores 읽기 캐시 (4단계)
  useSettingsStore.ts  # userSettings (9단계)
```

Phase 1의 화면들은 스토어 없이 mock 데이터(`src/data/mock.ts`)로만 렌더한다.
