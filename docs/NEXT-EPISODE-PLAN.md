# MODE · 무너짐 에피소드 분석 개편 계획 (0단계 감사 + 설계)

> **문서 성격**: 이 문서는 **계획서**다. 이 단계(0단계)에서는 어떤 앱 기능 코드·DB·엔진·화면도 바꾸지 않는다.
> **최우선 목표**: “입력은 단순하게, 결과와 분석은 상세하고 정확하게.” 사용자가 원인을 추측하지 않고, 앱이 **시간 순서·누적·반복·회복 경로**를 분석한다.
> **작성 기준 커밋**: `ab187a0` (branch `claude/mode-episode-analysis-plan`, base `origin/main`)

---

## 0. Baseline 스냅샷 (감사 시점)

| 항목 | 값 |
|---|---|
| DB_NAME | `MODELocalDB` |
| DB_VERSION | `1` (`src/data/db.ts` → `this.version(1).stores(SCHEMA_V1)` — 단일 버전) |
| 테이블 수 | 7 |
| EXPORT_FORMAT_VERSION | `1` (`dataExportService.ts`, DB_VERSION과 별개 상수) |
| 테스트 | 225 passed / 28 files |
| build | 성공 |
| lint | 0 errors / 4 warnings (기존 baseline) |

### Dexie 스키마 (인덱스 문자열 = 인덱싱되는 필드만)

```
dailyLogs:      '++id, &date'
eventLogs:      '++id, date, eventCode, category, mappedFactorGroup'
cycleLogs:      '++id, date'
recoveryLogs:   '++id, date, actionCode, category'
dailyScores:    '++id, &date, dayType'
patternInsights:'++id, insightType, targetMetric, confidence, createdAt'
userSettings:   '++id'
```

**핵심 사실 — 이 개편의 기술적 전제**: Dexie의 `stores()` 문자열은 **인덱싱할 필드만** 나열한다. 객체의 임의 속성은 인덱스에 없어도 그대로 저장된다. 실제로 현재 코드가 이미 이렇게 쓴다:

- `DailyLog`: `sleepHours?`, `sleepQuality?`, `memo?`, `stateCodes?`, `overallIntensity?`, `appetiteRatings?`, `greasyCraving?` — 전부 **비인덱스 optional**, `stores()` 문자열에 없음.
- `EventLog`: `customLabel?` — 비인덱스 optional.
- `RecoveryLog`: `direction?` — 비인덱스 optional (3단계에서 추가됨, 버전 안 올림).

→ **새 optional 필드를 추가해도 `stores()` 문자열/DB_VERSION을 바꿀 필요가 없다.** 인덱스로 조회할 필드가 아니라면 migration도 불필요하다. 이 문서의 데이터 모델 변경안은 전부 이 규칙 위에서 설계한다.

---

## 1. 현재 코드 구조 지도

```
src/
  app/App.tsx            라우팅(5탭+온보딩/설정), BrowserRouter basename, PWA init, UpdateBanner
  design/                디자인 시스템 (tokens/components/mascot/charts) — GlassCard, Chip, ConfidenceBadge…
  screens/
    Today/   TodayScreen.tsx     오늘 모드/종합부하/요인후보/4줄설계/회복추천/내일참고
    Log/     LogScreen.tsx       상태칩·식욕·사건·생리·회복·메모 입력 + dirty 추적
    Rhythm/  RhythmScreen.tsx    30일 선그래프 + 주기 오버레이 + 다음 3일 참고
    Calendar/CalendarScreen.tsx  월간 히트맵 + 날짜별 상세
    Analysis/AnalysisScreen.tsx  함께 나타난 기록/같이 겹친 기록/회복/미제 (단계 게이팅)
    Onboarding/, Settings/
  data/
    db.ts                Dexie 인스턴스 (ModeLocalDB, version(1))
    schema.ts            SCHEMA_V1, DB_VERSION, DB_NAME
    models.ts            7테이블 저장 타입 + optional 확장 필드
    reset.ts             resetDatabase (트랜잭션 clear)
    seed.ts              데모 데이터
    catalog/
      events.ts          EVENT_CATALOG, FACTOR_GROUP_DISPLAY, RECOVERY_LIKE_FACTOR_GROUPS, EVENT_CATEGORY_LABEL
      recoveryActions.ts RECOVERY_ACTIONS, RECOVERY_EFFECTS, 매핑
      statePresets.ts    STATE_PRESETS, buildStateNumericFields, inferStateCodes
      modes.ts           MODES, STATE_CHIPS
      intensity.ts, customEvent.ts
    repositories/        테이블별 CRUD (dailyLog/event/cycle/recovery/dailyScore/patternInsight/userSettings)
    services/
      dailyEntryService.ts     saveDailyEntry(트랜잭션)/loadDailyEntry/emptyDraft + draft→입력 변환
      dailyScoreService.ts     recalculateDailyScore/getTodaySummary (저장 시 + Today 진입 시)
      patternAnalysisService.ts computeAnalysis/getAnalysisViewModel/recalculatePatternInsights/getRecoveryRecommendations
      calendarService.ts, rhythmService.ts, rhythmForecastService.ts
      dataExportService.ts     buildExportPayload/downloadExportPayload/EXPORT_FORMAT_VERSION
      dataImportService.ts     validateImportPayload/importAllData/parseAndValidate
  engine/                순수 함수 (React/Dexie 모름)
    scoring.ts           calcEmotionalLoad/AppetiteLoad/SleepLoad/BodyLoad/EventLoad/RhythmLoad, EVENT_CATEGORY_WEIGHTS
    cycle.ts             buildCycleContext, calcCycleLoad
    classify.ts          classifyDay, DAY_TYPE_LABEL/SHORT/DESC, buildSubLabel
    correlation.ts       factorEffect, calcBaseline, calcConfidence, evidenceLevel, windowPhrase, ANALYSIS_METRIC_LABEL
    patterns.ts          accompliceEffect(combo), detectUnexplained
    recovery.ts          recoveryDelta, immediateRecoveryScore, nextDayRecoveryEffect, analyzeRecoveryActions, recoveryTier
    forecast.ts          forecastRhythmDay (가벼운 규칙 기반 참고)
    todaySummary.ts      buildTodaySummary → TodaySummary(scores/classification/factorCandidates/eventSummary/plan)
    todayPlan.ts         buildTodayPlan (4줄 설계)
    guards.ts            clamp/normalizeTo100/roundScore
  copy/tone.ts           단정 금지 가드(assertGuard/findAssertivePhrase) + 톤 카피(getToneCopy)
  lib/                   date, onboarding, useToneMode
```

**데이터 흐름**: Log 저장 → `saveDailyEntry`(dailyLogs/eventLogs/cycleLogs/recoveryLogs 트랜잭션) → `recalculateDailyScore`(dailyScores upsert). Analysis 진입 → `getAnalysisViewModel` → `computeAnalysis`(엔진 호출) → patternInsights persist. 엔진은 DB를 모르고 입력(맵/배열)만 받는다.

---

## 2. 이미 구현된 기능 — 보존 항목 (재작업/되돌림 금지)

| 보존 기능 | 구현 파일 | 함수/타입 | 테스트 |
|---|---|---|---|
| PWA 업데이트 배너 | `design/components/UpdateBanner.tsx`, `lib/pwaUpdate.ts` | `subscribeUpdateAvailable`, `applyUpdate`(`'applied'\|'saving'\|'unsaved'\|'noop'`) | `lib/pwaUpdate.test.ts` |
| 설정 업데이트 확인 | `screens/Settings/SettingsScreen.tsx`, `lib/pwaUpdate.ts` | `checkForUpdateNow` | `pwaUpdate.test.ts` |
| 저장 중/미저장 폼 업데이트 보류 | `lib/pwaUpdate.ts`, `screens/Log/LogScreen.tsx`, `screens/Log/dirty.ts` | `setFormBusy/isFormBusy`, `setFormDirty/isFormDirty`, `serializeForm/isFormChanged` | `pwaUpdate.test.ts`, `Log/dirty.test.ts` |
| JSON 내보내기 | `data/services/dataExportService.ts` | `buildExportPayload`, `downloadExportPayload`, `EXPORT_FORMAT_VERSION` | `dataExport.test.ts` |
| JSON 가져오기 | `data/services/dataImportService.ts` | `parseAndValidate`, `validateImportPayload`, `importAllData` | `dataImport.test.ts` |
| 가져오기 검증+롤백 | `dataImportService.ts` | 단일 rw 트랜잭션 clear+bulkAdd+개수검증, throw→롤백 | `dataImport.test.ts` (롤백/무접촉) |
| DB_NAME/DB_VERSION/7테이블 | `data/schema.ts`, `data/db.ts` | `DB_NAME`, `DB_VERSION`, `SCHEMA_V1` | `pwaUpdateSafety.test.ts`, `dataImport.test.ts` #29 |
| 상태칩 저장·복원 | `dailyEntryService.ts`, `catalog/statePresets.ts` | `buildStateNumericFields`, `inferStateCodes`, `DailyLog.stateCodes` | `stateChipFix.test.ts` |
| 식욕 세부 입력 | `dailyEntryService.ts`, `LogScreen.tsx` | `AppetiteRatings`, `hasAppetiteRatings` | `dailyScoreService.test.ts` |
| 회복 positive/negative | `dailyEntryService.ts`, `catalog/recoveryActions.ts` | `RecoveryLog.direction`, `buildRecoveryInputs` | `patternAnalysisService.test.ts` |
| 유효 결과일만 분석 | `patternAnalysisService.ts` | `isValidOutcomeLog`, `resultDates` | `analysisTrustworthiness.test.ts` #1~4 |
| 빈 저장일 제외 | `patternAnalysisService.ts` | `isValidOutcomeLog` | `analysisTrustworthiness.test.ts` #1,#16 |
| 유효 30일 전 factor 숨김 | `patternAnalysisService.ts` | `FACTOR_MIN_DAYS=30`, `analysisStageFor` | `analysisTrustworthiness.test.ts` #5,#6 |
| 유효 45일 전 combo 숨김 | `patternAnalysisService.ts` | `COMBO_MIN_DAYS=45` | `analysisTrustworthiness.test.ts` #7,#8 |
| 사건 timing today/yesterday 반영 | `patternAnalysisService.ts` | `eventOccurrenceDate` | `analysisTrustworthiness.test.ts` #15,#16 |
| recent3/7days 정밀분석 제외 | `patternAnalysisService.ts` | `eventOccurrenceDate`→null | `analysisTrustworthiness.test.ts` #17,#18 |
| 회복성 사건 위험요인 제외 | `catalog/events.ts`, `patternAnalysisService.ts` | `RECOVERY_LIKE_FACTOR_GROUPS` | `analysisTrustworthiness.test.ts` #19,#20 |
| Today 사건 개수/주요사건 표시 | `engine/todaySummary.ts`, `TodayScreen.tsx` | `EventSummary`, `eventSummary` | `analysisTrustworthiness.test.ts` #26 |
| PWA/GitHub Pages/basename | `vite.config.ts`, `.github/workflows/deploy.yml`, `app/App.tsx` | `base '/mode-rhythm/'`, `BASENAME` | 배포 workflow |
| 5탭 구조 | `app/App.tsx` | Routes Today/Log/Rhythm/Calendar/Analysis | — |
| export/legacy 호환 | `dataExport/ImportService.ts` | 필수필드만 검증, 여분 필드 bulkAdd 보존 | `dataImport.test.ts` 왕복 |

**계획 원칙**: 위 항목은 후속 어느 단계에서도 **다시 구현하거나 되돌리지 않는다.** 모든 신규 작업은 위 구조를 **확장(add)** 하는 방식이며, 특히 (a) 새 필드는 비인덱스 optional로, (b) 새 분석은 순수 함수 엔진으로, (c) 화면은 기존 컴포넌트 재사용으로 붙인다.

---

## 3. 요구사항 A~M 추적표

각 요구사항: 현재 구현 여부 / 관련 파일 / 최소 변경 / DB 영향 / 기존 기록 영향 / 테스트 방법 / 구현 단계.

### A. 지난밤 수면 귀속
- **현재**: ❌ 없음. 수면은 (1) `DailyLog.sleepHours/sleepQuality`(숫자, 그날 기록에 귀속) + (2) 사건 `sleep_late/waking/nightmare/allnight/much/short`(eventLogs, 단일 `eventTiming`). 귀속 규칙(“깨어난 날”)·전용 카드 없음.
- **관련 파일**: `LogScreen.tsx`, `dailyEntryService.ts`, `models.ts`(DailyLog), `engine/scoring.ts`(calcSleepLoad), `catalog/events.ts`(sleep_*).
- **최소 변경**: Log에 **“지난밤 수면” 전용 카드** 신설(timing 안 물음). 저장은 **DailyLog 비인덱스 optional 필드**(예: `sleepAttribution`, `sleepIssues:string[]`)로 → 기록 날짜 = 깨어난 날. scoring은 0단계 범위 밖(4단계 이전엔 공식 불변), 단 **중복 가산 방지 설계** 필수(§13).
- **DB 영향**: 없음(비인덱스 optional). **DB_VERSION 유지**.
- **기존 기록 영향**: 과거 sleep event/`sleepHours`는 **삭제·변환 금지**. 신규 필드 없는 옛 기록은 “지난밤 수면 미기록”으로 처리. eventCode 호환 유지.
- **테스트**: 저장/복원 왕복, 옛 기록 로딩 무손실, 지난밤 수면과 sleep event 이중 가산 없음(스코어 경로 단위 테스트).
- **단계**: **1단계**.

### B. 사용자 노출 용어 변경
- **현재**: 화면에 “부하/리듬 부하/전체 리듬/효과 +N” 등이 노출. `ANALYSIS_METRIC_LABEL`(감정 부하/식욕 변동/수면 부하/신체 부하/주기 부하/사건 부하/전체 리듬), `TodayScreen` LOAD_ROWS(감정/식욕/수면/몸) + “오늘의 종합 부하”, `classify.ts` DAY_TYPE_*, `AnalysisScreen` 카피.
- **관련 파일(감사 대상 전부)**: `screens/Today/TodayScreen.tsx`(+today.css), `screens/Calendar/CalendarScreen.tsx`, `screens/Analysis/AnalysisScreen.tsx`, `screens/Rhythm/RhythmScreen.tsx`, `engine/classify.ts`(dayType 라벨/설명), `engine/correlation.ts`(ANALYSIS_METRIC_LABEL), `engine/recovery.ts`(recoveryMessage), `engine/forecast.ts`/`rhythmForecastService.ts`(reference card), `copy/tone.ts`(톤 카피/가드), 각 화면 “빈 상태” 문구, 테스트 snapshot/카피 guard.
- **최소 변경**: **표시 문자열만** 매핑 (내부 변수/필드명은 대규모 rename 금지). eventLoad는 사용자에게 0~100 미노출 → 개수/주요기록/기록량만.
- **표시 매핑**:

  | 내부 | 사용자 표시 |
  |---|---|
  | emotionalLoad | 감정 흔들림 |
  | appetiteLoad | 식욕 흔들림 |
  | sleepLoad | 수면 문제 정도 |
  | bodyLoad | 몸 불편 |
  | rhythmLoad | 오늘의 버거움 |
  | effectSize | 평균 차이 |
  | eventLoad | (숫자 미노출) 사건 개수/주요 기록/기록량 |

- **DB 영향**: 없음. **기존 기록 영향**: 없음(표시만).
- **테스트**: 카피 guard(`assertGuard`) 유지 + 새 라벨 스냅샷, eventLoad 숫자 미노출 확인.
- **단계**: **2단계**.

### C. 자명/순환 분석 제외
- **현재**: ⚠️ 부분. factor 분석이 모든 targetMetric×window를 검사 → **입력 공식이 그대로 결과로 나오는 순환**(수면 사건→수면 문제 점수↑, 생리통→몸 불편↑, 생리구간→주기 점수↑)이 factor로 뜰 수 있음. 현재는 회복성 그룹만 제외.
- **관련 파일**: `patternAnalysisService.ts`(FACTOR_METRICS/COMBO_METRICS 루프), `engine/scoring.ts`(어느 사건이 어느 load에 들어가는지), `catalog/events.ts`(factorGroup→category).
- **최소 변경**: **factor exclusion matrix**(§14) 도입 — (factorGroup 또는 category) × targetMetric 쌍 중 “입력→같은 도메인 점수” 직접포함은 factor 후보에서 제외하거나 “입력 요약”으로만. 교차영역(수면→다음날 감정 등)은 허용.
- **DB 영향**: 없음. **기존 기록 영향**: 없음(분석 필터).
- **테스트**: 제외표대로 self-domain 관계가 factorPatterns에 안 뜨는지, 교차영역은 뜨는지.
- **단계**: **2단계**(제외) + **4단계**(교차영역 lag 분석 본격).

### D. 당일 관계 표현
- **현재**: ⚠️ same_day factor/combo가 지연 관계와 같은 카드/문구를 씀(“있었던 날 … 높았어요”). combo는 same_day 동시발생.
- **관련 파일**: `AnalysisScreen.tsx`(FactorRow/ComboRow 문구), `engine/correlation.ts`(WINDOW_PHRASE), `patterns.ts`(combo message).
- **최소 변경**: same_day 결과는 “**같은 날 함께 나타남 / 동반 기록 / 어느 쪽이 먼저인지 알 수 없음**”으로 별도 표현. 지연(previous_day 이상)과 카드/문구 분리.
- **DB 영향**: 없음. **기존 기록 영향**: 없음(표시).
- **테스트**: window별 문구 분기 스냅샷.
- **단계**: **2단계**(문구) + **5단계**(카드 구조).

### E. 일상 기능·무너짐 입력
- **현재**: ❌ 없음. dayType `recovery_priority` 등은 점수에서 유추일 뿐, 사용자 자기보고 기능저하 없음.
- **관련 파일**: `LogScreen.tsx`, `dailyEntryService.ts`, `models.ts`(DailyLog).
- **최소 변경**: Log에 **“오늘 일상 기능” 1문항 카드**(4단계 라벨). 3·4 선택 시에만 보조질문(기능저하 항목·무너짐 시작시점). 저장은 **DailyLog 비인덱스 optional**(예: `functionLevel:1|2|3|4`, `functionDeclines?:string[]`, `declineOnset?`). **상태칩 아님 — 분석 결과 변수.** 의료 진단 아님(사용자 정의 라벨).
- **DB 영향**: 없음(비인덱스 optional). **DB_VERSION 유지.**
- **기존 기록 영향**: 옛 기록은 `functionLevel` undefined → “기능 기록 없음”. 무손실.
- **테스트**: 조건부 보조질문 노출, 저장/복원, 옛 기록 undefined 처리.
- **단계**: **3단계**.

### F. 사건의 선후관계 (relationToShift)
- **현재**: ❌ 없음. EventLog에 관계 필드 없음. `eventTiming`은 발생 시점(today/yesterday…)일 뿐 무너짐과의 선후가 아님.
- **관련 파일**: `LogScreen.tsx`, `dailyEntryService.ts`, `models.ts`(EventLog).
- **최소 변경**: 기능저하 큰 날(E의 3·4)에만, **이미 선택된 사건 칩을 다시 보여주고** before/after/both/unknown 분류. 저장은 **EventLog 비인덱스 optional** `relationToShift?: 'before'|'after'|'both'|'unknown'`. 사건마다 긴 폼 금지.
- **DB 영향**: 없음(비인덱스 optional). **DB_VERSION 유지.**
- **기존 기록 영향**: 옛 EventLog는 `relationToShift` undefined → **unknown**으로 처리.
- **테스트**: 조건부 노출, unknown 기본값, 저장/복원, 옛 기록 unknown.
- **단계**: **3단계**.

### G. 고정 날짜 구간 금지 (연속·다중 시간척도)
- **현재**: ⚠️ 고정 window enum(same_day/previous_day/recent_3_days/recent_7_days)만. 연속 lag/누적/기울기 없음.
- **관련 파일**: (신규) `engine/episode*.ts`, `patternAnalysisService.ts`.
- **최소 변경**: 내부 계산은 **D-1~D-14 일별 lag + 2/3/5/7일 누적 + 연속 발생일수 + 개인 기준선 대비 + 악화 기울기**를 순수 함수로. 화면은 “먼저 쌓인 신호/가까운 경고/당일 동반/배경 조건/아직 모르는 부분/개입 가능 지점”으로 요약. “전날/3일/7일”은 분석틀이 아니라 설명 언어.
- **DB 영향**: 없음(즉석 계산). **기존 기록 영향**: 없음.
- **테스트**: lag/누적/기울기 순수 함수 단위 테스트.
- **단계**: **4단계**.

### H. 요인별 plausible time window
- **현재**: ❌ 없음. 모든 그룹을 모든 window에서 탐색 → cherry-picking 위험.
- **관련 파일**: `catalog/events.ts`(metadata 추가 위치), (신규) 엔진.
- **최소 변경**: 요인별 **탐색 허용 범위 metadata**(§15) 설계. 엔진은 그 범위 안에서만 lag 탐색.
- **DB 영향**: 없음(정적 카탈로그). **기존 기록 영향**: 없음.
- **테스트**: 범위 밖 lag가 후보에 안 뜨는지.
- **단계**: **4단계**.

### I. 생리주기 분석 (연속 위치)
- **현재**: ⚠️ `buildCycleContext`(예정일까지 남은 일수/경과일/구간/신뢰도) 존재하나, 분석은 “월경 전 7일” 고정 구간 factor뿐. `calcCycleLoad` 존재.
- **관련 파일**: `engine/cycle.ts`(보존), `patternAnalysisService.ts`(cycle factor), (신규) 에피소드 엔진.
- **최소 변경**: 에피소드 분석에서 **연속 주기 위치**(예정일까지 거리/시작 후 경과/-14~-1 연속/1·2일차/여러 주기 변화 시작 위치/같은 위치인데 안 무너진 날과 차이) 계산. 시작 기록 부족 시 “주기 데이터 없음/아직 반복 확인 전”. 생리 중 몸 아픔 같은 자명 결과는 핵심 카드로 올리지 않음(C와 연동).
- **DB 영향**: 없음(cycleLogs 그대로 사용). **기존 기록 영향**: 없음(보존).
- **테스트**: 주기 위치 계산, 표본 부족 표시, 자명 결과 강등.
- **단계**: **4단계**(엔진) + **6·7단계**(경보/회복에 주기 위치 매칭).

### J. 무너짐 에피소드 분석 (분석 단위 확장)
- **현재**: ❌ 없음. 분석은 날짜별 상관 목록.
- **관련 파일**: (신규) `engine/episode.ts`, `patternAnalysisService.ts`(또는 신규 서비스), `AnalysisScreen.tsx`.
- **최소 변경**: episode **start/continuation/recovery 판정 규칙**(§16) → 연속 무너짐을 한 에피소드로 묶음. 각 에피소드: 이른 선행신호/누적조건/전날 경고/당일 동반/이후 행동/주기 위치/회복 시작/복귀 소요일. 기존 장기 평균 비교는 **삭제 금지 → “장기 관찰 자료” 접힌 섹션으로 이동**.
- **DB 영향**: 원칙적으로 없음(즉석 계산). 성능상 필요하면 **경량 요약만** 캐시(§17, DB에 대량 파생배열 저장 금지).
- **기존 기록 영향**: 없음. **테스트**: 에피소드 묶기 규칙, 접힌 섹션 유지.
- **단계**: **4단계**(엔진) + **5단계**(화면).

### K. 조기경보 백테스트 (누수 금지)
- **현재**: ❌ 없음. (참고: 기존 `factorEffect`는 이미 D 이후 데이터 미참조 원칙을 지킴 — 재사용 가능한 안전 패턴.)
- **관련 파일**: (신규) `engine/earlyWarning.ts`, `AnalysisScreen.tsx`.
- **최소 변경**: 무너짐 D 예측에 **D-1 밤까지(전날 밤 경고) / 지난밤수면+아침까지(당일 아침 경고)** 정보만 사용. D 오후·저녁 사건/기능저하 사용 금지. 확률 대신 **과거 백테스트 결과**(잡음/놓침/오경보/무경고 정상). 표본 부족 시 경보 숨기고 필요 에피소드 수 표시.
- **DB 영향**: 없음. **기존 기록 영향**: 없음.
- **테스트**: **누수 방지 테스트(§12)** — 미래 데이터 주입 시 경보 불변; confusion matrix 4칸 계산.
- **단계**: **6단계**.

### L. 회복 경로 분석 (유사 에피소드 매칭)
- **현재**: ⚠️ `analyzeRecoveryActions`(전후 자기보고+다음날 비교), `nextDayRecoveryEffect`, positive/negative 존재 — **보존**. 단, 모든 날 평균 비교.
- **관련 파일**: `engine/recovery.ts`(보존/확장), (신규) 에피소드 매칭, `AnalysisScreen.tsx`.
- **최소 변경**: 비슷한 에피소드끼리(기능저하 강도/시작 전 수면/주기 위치/최근 감정·식욕) 비교. 결과는 문장으로. 자료 부족 시 “자기보고 기준/아직 유사 사례 비교 전”. negative는 “안 맞았던 것/그날만 안 맞았을 가능성”으로 신중히.
- **DB 영향**: 없음. **기존 기록 영향**: 없음(기존 회복 분석 보존).
- **테스트**: 유사 매칭, 표본 부족 분기, 문장 카피 guard.
- **단계**: **7단계**.

### M. 성능·무게 제한
- **현재**: ✅ 부분 준수. 외부 ML/차트 없음(자체 SVG), 순수 함수 엔진, `getAnalysisViewModel`이 진입 시 전체 재계산+persist(에피소드 확장 시 위험).
- **관련 파일**: `patternAnalysisService.ts`, `AnalysisScreen.tsx`, 신규 엔진.
- **최소 변경**: 최대 분석 범위 명시(예: 에피소드 lag 스캔 D-14, 분석창 최대 365일). 렌더마다 전체 DB 반복 스캔 금지 → ViewModel 1회 계산/수동 재계산. 대량 파생배열 DB 매일 저장 금지. 모바일 Safari 동작. PWA/백업 흐름 무손상.
- **DB 영향**: 테이블 불필요 증설 금지. **기존 기록 영향**: 없음.
- **테스트**: 분석 1회 호출 회수/시간 상한(대량 시드로 측정), 렌더 반복 스캔 없음.
- **단계**: **8단계**(전 단계 관통 원칙).

**요구사항 누락 여부: A~M 13개 전부 표에 포함(누락 없음).**

---

## 4. 현재 구현과 목표 사이의 gap

1. **입력**: 수면 귀속(A)·일상 기능(E)·선후관계(F) 입력 자체가 없음.
2. **분석 단위**: 날짜별 상관 → 에피소드 중심(J)으로 확장 필요.
3. **시간 모델**: 고정 window enum → 연속 lag/누적/기울기(G) + 요인별 허용범위(H).
4. **자명/당일 관계**: 순환 결과 제외(C)·당일=동반 표현(D) 미흡.
5. **경보/회복**: 조기경보 백테스트(K)·유사 에피소드 회복(L) 없음.
6. **용어**: “부하” 노출(B) — 이해도 낮음.
7. **주기**: 고정 “월경 전 7일” → 연속 위치(I).

---

## 5. 최소 데이터 모델 변경안 (전부 비인덱스 optional)

| 테이블 | 추가 필드(optional, 비인덱스) | 용도 | 단계 |
|---|---|---|---|
| `DailyLog` | `sleepAttribution?: { hours?: number; quality?: number; issues?: string[] }` (또는 평면 `lastNightSleep*`) | 지난밤 수면(A) — 깨어난 날 귀속, timing 없음 | 1 |
| `DailyLog` | `functionLevel?: 1\|2\|3\|4` | 일상 기능(E) 자기보고 | 3 |
| `DailyLog` | `functionDeclines?: string[]` | 기능저하 항목(E, 조건부) | 3 |
| `DailyLog` | `declineOnset?: 'wake'\|'morning'\|'afternoon'\|'evening'\|'gradual'\|'unknown'` | 무너짐 시작 시점(E) | 3 |
| `EventLog` | `relationToShift?: 'before'\|'after'\|'both'\|'unknown'` | 사건 선후관계(F) | 3 |

- **인덱스 변경 없음** → `SCHEMA_V1`/`db.ts` `version(1)` **그대로**. (조회는 date 인덱스 + 메모리 필터로 충분.)
- 카탈로그(정적, DB 아님): `catalog/events.ts`에 요인별 plausible window metadata(H), factor exclusion matrix(C) 상수 추가.
- 에피소드/경보/회복경로 결과는 **DB에 저장하지 않고** ViewModel로만 계산(M). 필요 시 경량 요약만 캐시.

**중복 방지(A 핵심)**: 지난밤 수면을 DailyLog 필드로 저장하면, 기존 sleep **event**(sleep_late/short/waking…)와 **동시에 존재**할 수 있다. 스코어·분석에서 **한 경로만** 채택하도록 규칙 필요(§13). 0단계에선 scoring 공식 불변이므로, 1단계 설계 시 “지난밤 수면 카드로 입력한 값은 sleep event를 만들지 않는다(또는 만들되 scoring에서 이중 가산 안 함)”를 확정한다.

---

## 6. DB_VERSION 유지 가능성 — 판단

**결론: 전 단계에서 DB_VERSION=1 유지 가능.** 근거:
- 추가 필드가 전부 **비인덱스 optional** → Dexie `stores()` 문자열 불변 → migration 불필요(현재 `sleepHours/appetiteRatings/direction`이 이미 그렇게 저장됨).
- 새 필드로 **조회(where/orderBy)하지 않음** → 인덱스 불필요. 필요한 조회는 기존 `date` 인덱스 + 메모리 필터.
- 인덱스가 정말 필요해지는 경우에만(현재 계획엔 없음) 별도 논의로 `version(2)` 검토. **이 계획 범위에선 발생하지 않음.**

---

## 7. legacy / export / import 호환 전략

- **export**: `buildExportPayload`는 `table.toArray()`로 **모든 속성을 그대로** 덤프 → 새 optional 필드는 **자동 포함**. `EXPORT_FORMAT_VERSION`은 구조가 실제로 바뀔 때만 올림. 새 필드는 기존 구조에 optional 추가라 **버전 유지 가능**(단, 문서에 “v1이 새 optional을 포함할 수 있음” 명시). 
- **import 검증**: `validateImportPayload`는 **필수 필드만** 확인하고 여분은 통과. 새 optional은 필수에 넣지 않음 → **옛 백업(필드 없음)도 계속 유효**, **새 백업(필드 있음)도 유효**. 값 검증이 필요하면 “있으면 타입 체크”만 추가.
- **import 복원**: `importAllData`는 `bulkAdd`로 **여분 필드 보존** → 새 필드 왕복 OK(3단계 dataImport 왕복 테스트가 이미 optional 보존 검증).
- **legacy 로딩**: `loadDailyEntry`/분석은 새 필드 undefined를 **“미기록/unknown”**으로 처리. 재저장 시 손실 금지(폼 baseline에 새 필드 포함).
- **주의**: 이 계획은 `dataExport/ImportService.ts`를 **구조적으로 바꾸지 않는다**. 새 필드는 자동 흐름을 타므로 import/export 코드 수정은 원칙적으로 불필요(값 검증 강화만 선택적).

---

## 8. 단계별 구현 순서 (한 단계에서 다음 단계 기능 선구현 금지)

| 단계 | 범위 | 산출물 |
|---|---|---|
| **1** | 지난밤 수면 입력/귀속만 | Log 수면 카드 + DailyLog optional + 중복 가산 방지 |
| **2** | 사용자 용어(B) + 자명 분석 제거(C 제외) + 당일 표현(D 문구)만 | 표시 매핑 + exclusion matrix + 문구 분리 |
| **3** | 일상 기능/무너짐(E) + 조건부 선후관계(F) 입력만 | Log 기능 카드 + relationToShift, 저장/복원 |
| **4** | 에피소드 데이터 모델 + 순수 분석 엔진(G/H/I/J 계산)만 | `engine/episode*.ts` + plausible window/exclusion 적용, 화면 미변경 |
| **5** | Analysis 화면 에피소드 중심 재구성(장기 관찰 자료 접힘) | AnalysisScreen 재구성 |
| **6** | 조기경보 백테스트(K) | earlyWarning 엔진 + confusion matrix 표시 |
| **7** | 유사 에피소드 회복 경로(L) | 회복 매칭 + 문장 결과 |
| **8** | 통합 QA/성능/legacy/PWA/배포 | 성능 상한 검증 + preview QA + main 병합/배포 |

---

## 9·10. 단계별 수정 가능/금지 파일

> 공통 금지(전 단계): `data/schema.ts`, `data/db.ts`(version), `data/reset.ts`, `dataExportService.ts`·`dataImportService.ts`(구조), `lib/pwaUpdate.ts`·`UpdateBanner.tsx`, `vite.config.ts`, `.github/workflows/`, `package.json`(라이브러리 추가), 기존 테스트 삭제.

| 단계 | 수정 가능 | 수정 금지(위 공통 + 추가) |
|---|---|---|
| 1 | `LogScreen.tsx`+`log.css`, `dailyEntryService.ts`, `models.ts`(DailyLog optional), `catalog/events.ts`(필요시 sleep 라벨), 신규 테스트 | `engine/scoring.ts` 공식 변경 금지(귀속만, 가산식 불변), Analysis/Today 로직 |
| 2 | 5개 화면 표시 문자열, `correlation.ts`/`classify.ts`/`recovery.ts` **라벨/문구만**, `patternAnalysisService.ts`(exclusion matrix), `copy/tone.ts`, `catalog/events.ts`(exclusion 상수) | scoring 공식, 필드명 rename, 입력 UX |
| 3 | `LogScreen.tsx`, `dailyEntryService.ts`, `models.ts`(EventLog/DailyLog optional), 신규 테스트 | 분석 엔진, 화면 분석부 |
| 4 | 신규 `engine/episode*.ts`·테스트, `patternAnalysisService.ts`(계산 연결), `catalog/events.ts`(window/exclusion metadata) | 화면(5단계 전 미변경), scoring 공식 |
| 5 | `AnalysisScreen.tsx`+`analysis.css` | 엔진 계산 규칙(4단계 확정분) |
| 6 | 신규 `engine/earlyWarning.ts`·테스트, `AnalysisScreen.tsx`(경보 섹션) | 입력, DB |
| 7 | `engine/recovery.ts`(확장, 기존 함수 보존), 신규 매칭·테스트, `AnalysisScreen.tsx` | 기존 회복 함수 시그니처 파괴 |
| 8 | QA 스크립트, 문서 | 코드 대규모 변경 |

---

## 11. 단계별 테스트 계획

- **1**: 지난밤 수면 저장/복원 왕복; 옛 기록(필드 없음) 로딩 무손실; **수면 이중 가산 없음**(scoring 경로 단위 테스트); export/import 왕복에 새 필드 보존.
- **2**: 표시 매핑 스냅샷(“부하” 미노출, 새 라벨); eventLoad 숫자 미노출; exclusion matrix로 self-domain factor 미출현/교차영역 유지; 당일=동반 문구 분기; `assertGuard` 통과.
- **3**: 기능 카드 조건부(3·4에서만 보조질문); `functionLevel`/`relationToShift` 저장/복원; 옛 기록 undefined→unknown; 왕복 보존.
- **4**: lag/누적/연속/기울기 순수 함수 단위; plausible window 밖 lag 제외; 주기 연속 위치; 에피소드 묶기(start/continuation/recovery); **누수 방지(§12)**.
- **5**: 화면 렌더(단계 게이팅/접힌 장기자료 유지); 카피 guard.
- **6**: **백테스트 누수 방지(§12)**; confusion matrix 4칸; 표본 부족 시 숨김.
- **7**: 유사 매칭·표본 부족 분기·negative 신중 표현.
- **8**: 성능 상한(대량 시드로 1회 계산 시간/스캔 수), preview QA(모바일 Safari 폭), PWA/백업 무손상.

---

## 12. 데이터 누수 방지 테스트 (전용)

핵심 불변식: **무너짐 D 예측/경보는 D 시점 이후 정보로 바뀌면 안 된다.**

- **주입 테스트**: 에피소드 D의 경보를 계산 → D 당일 오후/저녁 사건·기능저하·회복 로그를 사후 추가 → 경보 결과 **완전 불변**이면 통과.
- **미래일 주입**: D+1..D+7에 극단값 주입 → D 경보/에피소드 선행신호 **불변**.
- **전날/아침 경계**: 전날 밤 경보는 D-1 23:59까지 정보만, 아침 경보는 지난밤수면+아침 상태까지만. D-day 이후 필드 참조 시 실패하도록 단위 테스트.
- **기존 안전 패턴 재사용**: `correlation.factorEffect`가 이미 “D 이후 요인 미참조”를 지킴(테스트 존재) — 에피소드/경보도 동일 규칙·동일 스타일 테스트.

---

## 13. 중복 계산 방지 계획

- **수면 이중 경로(A)**: 지난밤 수면(DailyLog 필드) ↔ sleep event(eventLogs)가 같은 밤을 이중 표현하지 않게. 규칙 후보: (i) 수면 카드 입력 시 대응 sleep event 생성 안 함, scoring/분석은 DailyLog 수면 필드를 **단일 출처**로; (ii) 옛 sleep event만 있는 날은 기존 경로 유지. `calcSleepLoad`가 현재 **`sleep_short`를 참조하지 않는다**는 점(감사 결과)까지 문서화해 실제 반영 경로를 명확히.
- **분석 재계산**: `getAnalysisViewModel`가 진입마다 전체 재계산+persist. 에피소드 확장 시 **1회 계산 → ViewModel 공유**, 화면 렌더마다 DB 재스캔 금지(M).
- **파생 캐시**: 에피소드/경보 결과는 DB 매일 저장 금지 — 즉석 계산 또는 경량 요약 1건만.
- **exclusion**: self-domain factor를 계산은 하되 **표시에서 1곳**(입력 요약)으로만, factor 카드와 중복 노출 금지(C).

---

## 14. Circular / self-evident 분석 제외표 (targetMetric × 입력 도메인)

`✗` = factor 후보에서 제외(입력→같은 도메인 점수 = 자명/순환). `✓` = 교차영역, 분석 허용.

| 입력(factorGroup/도메인) | sleep(수면 문제) | emotional(감정) | appetite(식욕) | body(몸) | rhythm(버거움) |
|---|---|---|---|---|---|
| sleep_deficit/quality/schedule (수면 사건) | ✗ 자명 | ✓ 다음날 | ✓ 누적→식욕 | ✓ | ✓(지연) |
| cycle_period (생리 구간) | ✓ | ✓ | ✓ | ✗ 자명(생리통→몸) | ✓ |
| cycle_premenstrual (월경 전) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 생리통 입력(periodPain) | – | ✓ | ✓ | ✗ 자명 | ✓ |
| overeat/sugar (식사 사건) | ✓ | ✓ 다음날 | ✗ 당일 자명 | ✓ | ✓ |
| interpersonal/conflict (관계) | ✓ | ✓ | ✓ | ✓ | ✓ |
| workload/anticipatory (통제) | ✓ | ✓ | ✓ | ✓ | ✓ |
| 회복성(exercise/walk/self_care) | 전부 ✗ (이미 제외됨, RECOVERY_LIKE) | | | | |

- 규칙 형식(설계): `EXCLUDED_SELF_DOMAIN: { [factorGroupOrCategory]: AnalysisMetric[] }` 상수 → factor 루프에서 (group, metric)이 제외표에 있으면 skip. 자명 관계는 “입력 요약” 카드로만.
- **주의**: same_day만 제외하고 **지연(다음날/누적)은 허용** — “수면 문제→다음날 감정”은 same_day 자명과 다른 발견이므로 유지.

---

## 15. 요인별 plausible time window 표 (cherry-picking 방지)

엔진은 아래 허용 범위 **안에서만** lag/누적을 탐색한다. (카탈로그 metadata로 코드화 + 테스트)

| 요인 | 허용 탐색 범위 | 형태 |
|---|---|---|
| 잠 부족/악몽/자주 깸 | 당일 아침 ~ D+3 | 지난밤 귀속 + 단기 lag |
| 늦은 카페인 | 그날 밤 ~ 다음날 | 단기 lag |
| 취침/기상 불규칙 | 3~14일 | 추세/누적 |
| 갈등/실수 | 당일 ~ D+3 | 단기 |
| 앞둔 일정 부담 | 발생일 ~ 일정 전 (최대 14일) | 예기, 일정까지 |
| 집 지저분/공간 답답 | 연속 노출 일수 | 누적/연속 |
| 쇼츠/누워 있음 | `relationToShift='after'`면 선행신호에서 제외 | after면 결과쪽 |
| 생리주기 | 예정일과의 연속 거리 | 연속 위치(I) |
| 단 음식 섭취 | 당일 ~ 다음날(식욕/감정) | 단기 lag(교차) |
| SNS/사회적 비교 | 당일 ~ D+2 | 단기 |

- 데이터 구조(설계): `FACTOR_WINDOW: { [group]: { minLag, maxLag, mode: 'nightly'|'short'|'trend'|'cumulative'|'cycle'|'result_side' } }`.

---

## 16. Episode 정의 후보 (장단점)

“무너짐 에피소드” = 연속된 기능 저하 구간을 하나로 묶는 단위.

- **정의 A — functionLevel 임계 연속**: `functionLevel ≥ 3`인 날이 시작; 사이에 `≤2`가 **1일**이면 계속(휴지 허용), **2일 이상** 회복이면 종료. 복귀 = `functionLevel ≤ 2`가 안정.
  - 장점: 자기보고 기반, 명확. 단점: 기능 미기록 날 처리 필요(추정 or 제외).
- **정의 B — 복합 부하 임계**: `rhythmLoad ≥ T`(개인 기준선 대비) 연속. 장점: 옛 기록에도 적용. 단점: 자명/점수 순환, 사용자 체감과 괴리.
- **정의 C — 하이브리드(권장 후보)**: 우선 `functionLevel≥3`으로 에피소드 확정, 기능 미기록 구간은 `rhythmLoad`+상태칩으로 **보조 추정**(신뢰도 낮음 표시). 장점: 신규·legacy 모두 커버. 단점: 규칙 복잡 → 테스트 강화.
- 공통 파라미터(설계): `EPISODE_GAP_TOLERANCE_DAYS=1`, `RECOVERY_CONFIRM_DAYS=2`, 최소 에피소드 길이=1. 규칙은 순수 함수 + 표 기반 단위 테스트.

---

## 17. 성능 위험과 방지책

| 위험 | 방지책 |
|---|---|
| Analysis 진입마다 전체 재계산+persist(에피소드로 무거워짐) | 1회 계산 → ViewModel 공유; persist는 요약만; 수동 “다시 계산” 유지 |
| 에피소드×D-14×그룹 lag 스캔 폭증 | plausible window(H)로 그룹별 범위 제한; 최대 분석창(예 365일) 상한 |
| 렌더마다 DB 반복 스캔 | 화면은 ViewModel만 소비, DB 접근은 서비스 1회 |
| 대량 파생배열 DB 저장 | 금지 — 즉석 계산/경량 요약 |
| 모바일 Safari 메모리 | 배열 크기 상한, map 재사용; preview QA로 확인 |
| 백테스트 반복 | 에피소드 목록 1회 계산 후 경보 지표 파생 |

명시 상한(설계): 분석창 ≤ 365일, lag ≤ 14일, 그룹 후보 ≤ 상위 N, 에피소드 표시 ≤ 최근 K개.

---

## 18. 롤백 방법

- 각 단계 = **독립 브랜치 + 단일/소수 커밋**, main 병합은 8단계(또는 단계별 승인 후). 문제가 생기면 **해당 브랜치 미병합**으로 무효화.
- 데이터: 새 필드는 optional이라, 코드 되돌려도 **기존 기록/DB 무손상**(필드는 무시됨). DB_VERSION 불변이라 다운그레이드 이슈 없음.
- 화면/문구: 표시 매핑은 순수 문자열 → revert 안전.
- 배포: GitHub Pages는 이전 커밋 재빌드로 롤백. import/export 구조 불변이라 백업 파일 호환 유지.
- 안전장치: 단계마다 `git diff --stat`으로 금지 파일 미변경 확인, `git revert`로 커밋 단위 롤백.

---

## 19. 각 단계 완료 기준

공통: `npm run test/build/lint` 통과(0 errors), 금지 파일 diff 없음, DB_NAME/DB_VERSION/7테이블 불변, export/import·PWA 무손상, preview QA(해당 시).

- **1**: 지난밤 수면 카드 입력/저장/복원, 이중 가산 없음, 옛 기록 무손실, 왕복 보존.
- **2**: 화면에 “부하”·“효과 +N”·eventLoad 숫자 미노출, 새 라벨 표시, self-domain factor 미출현/교차 유지, 당일=동반 문구.
- **3**: 기능 1문항+조건부 보조질문, relationToShift 저장, 옛 기록 unknown.
- **4**: 에피소드/lag/누적/주기위치 순수 함수 통과 + 누수 테스트 통과(화면 미변경).
- **5**: Analysis 에피소드 중심, 장기 관찰 자료 접힘 유지.
- **6**: 백테스트 confusion matrix + 누수 방지, 표본 부족 숨김.
- **7**: 유사 에피소드 회복 문장, 표본 부족 분기.
- **8**: 성능 상한 충족, 통합 QA/배포.

---

## 20. 1단계 “지난밤 수면” 구현 프롬프트 초안

> 아래는 **초안**이다. 1단계 착수 시 이 프롬프트로 시작한다(범위: 지난밤 수면 입력/귀속만, 다른 단계 선구현 금지).

```
MODE 1단계: 지난밤 수면 입력/귀속만 구현합니다. 다른 단계 기능은 만들지 마세요.

기준: branch claude/mode-episode-analysis-plan (또는 최신 main), DB_VERSION=1 유지.

절대 금지:
- DB_NAME/DB_VERSION/SCHEMA_V1/index/migration 변경
- scoring 공식(calc*Load) 수식 변경
- Analysis/Today 분석 로직 변경
- JSON export/import 구조 변경, PWA 로직 변경
- 새 라이브러리/탭

구현:
1. Log 화면에 일반 사건과 분리된 "지난밤 수면" 카드 추가.
   - 표시: "지난밤 수면 · N일 밤 → (N+1)일 아침"(기록 날짜=깨어난 날)
   - timing(오늘/어제/최근3·7일) 묻지 않음
   - 입력(단순): 수면시간 구간 또는 시간 / 만족도·질 / 늦게 잠 / 자주 깸 / 악몽 / 밤샘 / 많이 잠 / 늦게 일어남
   - 낮잠은 이 카드가 아니라 기존 "오늘 사건"으로 유지
2. 저장: DailyLog에 비인덱스 optional 필드로 저장(예: sleepAttribution 또는 lastNightSleep*).
   기존 sleepHours/sleepQuality와의 관계를 정하고, sleep event와 이중 가산이 없도록 설계.
   (감사 결과: 현재 calcSleepLoad는 sleep_short를 참조하지 않음 — 반영 경로를 명확히 문서화)
3. 기존 sleep event 기록은 삭제/변환하지 않음. eventCode 호환 유지.
   새 필드 없는 옛 기록은 "지난밤 수면 미기록"으로 로딩, 재저장 시 손실 금지.

테스트(추가):
- 지난밤 수면 저장→복원 왕복 일치
- 옛 기록(필드 없음) 로딩/재저장 무손실
- 지난밤 수면과 sleep event가 수면 점수에 이중 가산되지 않음(scoring 경로 단위 테스트)
- export→import 왕복에 새 필드 보존
- DB_NAME/DB_VERSION/SCHEMA_V1 불변, 금지 파일 diff 없음

완료: test/build/lint 통과, preview QA(Log에서 지난밤 수면 입력/저장 확인), 기능 브랜치 commit/push, main 병합 금지, 보고 후 멈춤.
```

---

### 부록 · 가장 위험한 충돌 지점 10 (요약, 본문 §13/§5/§12 참조)
1. 수면 이중 경로(DailyLog 수면 필드 ↔ sleep event) 이중 가산 — **A/§13**.
2. `calcSleepLoad`가 `sleep_short` 미참조 — 수면 반영 경로 오해 위험 — **A/감사**.
3. `eventTiming` 단일값 모델 vs per-event `relationToShift` — **F**.
4. `getAnalysisViewModel` 진입마다 재계산+persist가 에피소드로 무거워짐 — **M/§17**.
5. self-domain 순환 제외가 교차영역(수면→다음날 감정)까지 지우지 않도록 — **C/§14**.
6. legacy sleep event/옛 기록 삭제·변환 금지, dual-path 읽기 — **A/§7**.
7. export/import: 새 optional 자동 포함·검증 통과·왕복 보존, 옛 백업 거부 금지 — **§7**.
8. 에피소드/경보 표본 부족 시 게이팅(적은 에피소드로 과신) — **J/K**.
9. 백테스트 데이터 누수(D 당일 오후·저녁, D+ 미래) — **K/§12**.
10. `classify.ts` dayType가 eventLoad에 의존(social_fatigue) — eventLoad 숫자 UI 숨김(B)해도 내부 유지 필요 — **B**.
