# engine/ — 분석/계산 엔진 (아직 구현하지 않음)

**Phase 1에서는 비어 있음 (placeholder).** 점수 계산·주기 계산·상관/공범·회복·예보 로직은 모두 후속 단계에서 구현한다.

엔진의 핵심 원칙: **React/DB를 전혀 모르는 순수 함수.** 입력 객체를 받아 결과를 반환한다. 그래야 단위 테스트가 쉽고, 계산식 변경이 UI를 깨지 않는다.

예정 구조 (docs/PHASE-0-PLAN.md §2 참고):

```
engine/
  scoring/      # emotionalLoad, appetiteLoad, sleepLoad, bodyLoad, eventLoad, rhythmLoad, normalize  (4단계)
  cycle/        # buildCycleContext, calcCycleLoad, estimateNextPeriod, cycleStrengthForUser           (4단계)
  classify/     # classifyDay, buildSubLabel (동적 괄호 문구)                                          (4단계)
  correlation/  # baseline, factorEffect(4 시간창), confidence, accomplice, unexplained                (6단계)
  recovery/     # recoveryDelta, calcRecoveryScore, nextDayRecoveryEffect, topRecoveryActions          (7단계)
  forecast/     # forecastTomorrow(가능성%), buildDayPlan, findSimilarPastDays                          (8단계)
```

## 입력 스키마 결정 메모 (0단계 열린 질문 확정)

- **수면**: 숫자형(수면시간/수면질)은 `dailyLogs`에 저장. 사건성(늦게 잠/자주 깸/악몽/낮잠/밤샘/많이 잠)은 `eventLogs` 코드로 저장. → `calcSleepLoad`는 두 소스를 함께 읽는다.
- **강도 입력**: 기본 빠른 기록은 칩 중심 UI. 내부 저장은 0~10 숫자(`intensity.ts`의 매핑: 없음0/조금3/보통5/많이7/매우많이9).
