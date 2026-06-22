# data/repositories/ — 저장 계층 (Dexie/IndexedDB, 아직 구현하지 않음)

**Phase 1에서는 비어 있음 (placeholder).** DB 구현은 2단계다.

예정 (docs/PHASE-0-PLAN.md §3의 7개 모델 기준):

```
data/
  db.ts                  # Dexie 스키마 정의 (2단계)
  models.ts              # 저장 모델 타입: DailyLog, EventLog, CycleLog, RecoveryLog, DailyScore, PatternInsight, UserSettings
  repositories/
    dailyLogRepo.ts
    eventLogRepo.ts
    cycleLogRepo.ts
    recoveryLogRepo.ts
    dailyScoreRepo.ts
    insightRepo.ts
```

Phase 1에는 `data/types.ts`(표시·구조용 가벼운 타입)와 `data/catalog/*`(선택지 상수)만 존재한다.
Dexie 스키마는 아직 만들지 않는다.
