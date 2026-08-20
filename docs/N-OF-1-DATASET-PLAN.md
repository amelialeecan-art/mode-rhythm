# MODE · N-of-1 개인 건강 데이터셋 개편 계획

> **문서 성격**: 이 문서는 **계획서**다. 이 단계에서는 어떤 앱 기능 코드·DB·엔진·화면도 바꾸지 않는다.
> **최우선 목표**: 지금 MODE는 "하루 하나의 상자"에 사건이 뭉쳐 있어 *언제 → 무엇이 먼저 → 무엇이 뒤에 변했는지*가 약하다. 이 개편은 MODE를 **의학·생리학적으로 해석 가능하고, 통계적으로 덜 사기 치는 개인 N-of-1 시계열 데이터셋**으로 만든다.
> **불변 전제**: 사용자는 사실만 기록 / 앱이 패턴 분석 / 원인은 단정 금지(후보·신뢰도·경향) / 의료 진단 아님 / 로컬 우선(IndexedDB).

---

## 0. Baseline 스냅샷 (감사 시점)

| 항목 | 값 |
|---|---|
| DB_NAME | `MODELocalDB` (`src/data/schema.ts`) |
| DB_VERSION | `1` (단일 버전, 마이그레이션 없음) |
| EXPORT_FORMAT_VERSION | `1` (`dataExportService.ts`, DB_VERSION과 별개 상수) |
| 테이블 수 | 7 (`dailyLogs · eventLogs · cycleLogs · recoveryLogs · dailyScores · patternInsights · userSettings`) |
| 이벤트 카탈로그 | 51종 / 11 카테고리 (`src/data/catalog/events.ts`) |
| 주기 엔진 | `src/engine/cycle.ts` — 실측 간격 median 우선, 없으면 `averageCycleLength ?? 28` fallback |

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

**이 개편의 기술적 전제 (NEXT-EPISODE-PLAN.md에서 확립된 사실)**: Dexie의 `stores()` 문자열은 **인덱싱할 필드만** 나열한다. 객체의 임의 속성은 인덱스에 없어도 그대로 저장된다. 실제로 `DailyLog`는 이미 `lastNightSleep?`, `appetiteRatings?`, `emotionCodes?`, `bodySignalCodes?` 등 다수의 **비인덱스 optional 필드**를 `stores()` 문자열/DB_VERSION 변경 없이 저장한다.

→ **이 문서의 데이터 모델 확장은 대부분 새 optional 필드 추가로, `stores()`·DB_VERSION·마이그레이션을 건드리지 않는다.** 새 인덱스가 꼭 필요한 항목(예: 하루 여러 행이 생기는 식사 로그의 신규 테이블)만 별도로 표시한다.

---

## 1. 핵심 설계 원칙 — 데이터를 4종류로 분리

지금 가장 큰 문제는 기분(상태)·단 음식 먹음(결과)·업무 압박(원인)·생리 D-3(맥락)이 한 상자에 섞여 있다는 것이다. 모든 필드는 아래 **네 역할 중 하나**로만 태깅한다. 섞이면 인과 방향을 못 읽는다.

| 역할 | 정의 | 예시 | 현재 대응 테이블 |
|---|---|---|---|
| **① Exposure (원인 후보)** | 내가 겪은 입력·자극 | 수면 시각, 식사, 운동, 스트레스 사건, 화면사용, 약, 카페인 | `eventLogs` + `lastNightSleep` + (신규) 식사/운동/화면 로그 |
| **② State (상태)** | 지금 내 몸·마음의 순간 상태 | 기분·불안·짜증·에너지·집중·충동·허기·craving·통증·붓기 | `dailyLogs`(코어 12) |
| **③ Outcome (결과)** | 하루의 결과 사건 | 폭식함, 기능저하, 잠 못 잠, 운동 못 함 | `dailyLogs.functionLevel` + (신규) 결과 플래그 |
| **④ Context (배경)** | 그날의 배경 조건 (원인 칩 아님) | 생리주기 위치, 요일, 출근/재택, 질병, 여행 | `cycleLogs` + `dayContext` + `rhythmExceptionCodes` |

**규칙**: 분석 엔진은 이 role을 명시적으로 알아야 한다. State를 Exposure로 회귀에 넣거나, Context를 원인 후보로 표시하면 안 된다. → 각 지표 정의에 `role: 'exposure'|'state'|'outcome'|'context'` 메타를 부여한다(카탈로그 레벨, 저장 불필요).

---

## 2. 코어 12 — 매일 고정, 절대 중간에 안 바뀜

분석 신뢰성의 뿌리는 **스키마가 중간에 안 바뀌는 고정 코어**다. 지금까지의 실데이터에서 입력 필드가 바뀌고 0과 미입력이 섞여 분석을 방해했다. 아래 12개를 **불변 코어(State, 0~10)**로 고정한다.

| # | 코어 지표 | 현재 `DailyLog` 필드 | 변경 |
|---|---|---|---|
| 1 | 기분저하 | `moodLow` | 유지 |
| 2 | 불안 | `anxiety` | 유지 |
| 3 | 짜증/분노 | `irritability` | 유지 |
| 4 | 에너지 | `energy` | 유지 |
| 5 | 집중력 | `focus` | 유지 |
| 6 | 충동성 | `impulsivity` | 유지 |
| 7 | **신체적 배고픔 (physical hunger)** | `appetite` → 의미 재정의 | **분할 #1** |
| 8 | **음식 craving** | `sweetCraving`/`saltyCraving` 통합 대표값 | **분할 #2** |
| 9 | **폭식 충동 (binge urge)** | `bingeUrge` | 유지 |
| 10 | 피로/몸 무거움 | `fatigue`/`heaviness` | 유지 |
| 11 | 복부팽만 | `bloating` | 유지 |
| 12 | 통증/몸 불편감 | `pain`/`bodyDiscomfort` | 유지 |

### 2-A. 식욕을 반드시 3개로 찢는다 (이 개편의 핵심)

현재 `appetite` 하나는 아래 셋을 구별하지 못한다.

- **Physical hunger** — 배가 실제로 고픈가?
- **Craving** — 배와 별개로 특정 음식이 먹고 싶은가?
- **Binge urge** — 먹으면 제어하기 어려울 것 같은가?

이 셋만 분리해도:

> "나는 생리 전에 *실제 허기*가 증가하는 사람인가?" / "허기는 그대로인데 *음식 보상욕구*만 증가하는가?" / "둘 다 아닌데 *폭식 제어력*만 떨어지는가?"

까지 갈 수 있다. → 신규 코어 필드 `physicalHunger`, `foodCraving`, `bingeUrge`를 **명시적 3축**으로 둔다. 기존 `appetite`/`sweetCraving`/`saltyCraving`/`greasyCraving`은 **읽기 호환용으로 보존**하되(삭제 금지), 신규 기록의 단일 출처는 3축으로 옮긴다. sweet/salty/greasy는 craving의 *하위 종류 태그*로 강등한다(있으면 기록, 점수엔 미가산).

---

## 3. 하루 한 번 → 아침 + 저녁 2회 측정

지금 데이터는 하루가 하나의 상자로 뭉쳐 있어 "아침부터 안 좋았는지 / 출근 후 망가졌는지 / 오후부터 식욕이 올라왔는지"를 분리할 수 없다. 코어 State를 **아침·저녁 2개 시점**으로 나눈다.

- **🌅 아침 (기상 후 30분 이내)**: 기분·불안·짜증·에너지·집중·신체적 배고픔·몸 무거움·복부팽만 + **수면 시각 세트**(§5).
- **🌙 저녁 (잠들기 전)**: 기분·불안·짜증·에너지·집중·신체적 배고픔·craving·폭식충동·몸 상태.

### 저장 형태

`dailyLogs`는 지금 `&date` unique(하루 1행)다. 2회 측정은 두 방향 중 하나:

- **(권장) 하루 1행 유지 + 시점 접미 필드**: `am_moodLow`, `pm_moodLow` … 또는 `morning?: CoreSnapshot`, `evening?: CoreSnapshot` 서브객체. `&date` unique·인덱스·마이그레이션 **불변**. 기존 12축 필드는 "대표값(저녁 우선, 없으면 아침)"으로 하위호환 유지.
- (대안) `dailyLogs`를 시점별 다행으로 — `&date` unique를 깨야 하므로 **DB_VERSION 상승 + 마이그레이션 필요**. 이 개편에서는 채택하지 않는다.

→ **채택: `morning?`/`evening?` 서브객체 (비인덱스 optional).** 옛 단일 기록은 그대로 읽히고, 신규 기록만 2시점을 채운다.

---

## 4. 식사 로그 — 칼로리 아님, "리듬"을 받는다

먹은 음식 일기·칼로리 입력은 하지 않는다. 분석용으로 더 강한 건 **먹은 시각 + 먹기 직전 3축 + 먹고 난 뒤 종류 플래그**다.

**신규 테이블 `mealLogs`** (하루 여러 행 → `date` 인덱스 필요 → `stores()` 추가 = **DB_VERSION 상승 필요**한 유일한 항목):

```
mealLogs: '++id, date, startTime'
```

| 필드 | 값 | 역할 |
|---|---|---|
| `startTime` | ISO 시각 | Exposure(시각) |
| `preHunger` | 0~10 | State 직전 |
| `preCraving` | 0~10 | State 직전 |
| `preBingeUrge` | 0~10 | State 직전 |
| `portion` | `low`/`normal`/`high` | Exposure |
| `hasProtein` | Y/N | Exposure |
| `hasSweets` | Y/N | Exposure |
| `ultraProcessed` | Y/N | Exposure |
| `alcohol` | 양(0~) | Exposure |
| `feltOvereating` | Y/N | Outcome |

이러면 "식사 후 3시간 20분부터 신체적 허기 증가 / 생리 -5일부터는 식사 후 1시간 40분 만에 craving 상승 / 단백질 있는 식사에선 physical hunger는 늦어졌지만 craving은 변화 없음" 같은 분석이 가능하다. 지금처럼 *단 음식 먹음 + 식욕 9*만 있으면 식욕 때문에 먹은 건지 먹어서 식욕이 오른 건지 모른다.

---

## 5. 수면 — "몇 시간"보다 "시각 3개"

실데이터에서 수면시간 자체는 그날 기분과 상관이 약했고, 오히려 *늦게 잠·불규칙·밤 화면* 같은 리듬변수가 더 수상했다. 사용자는 시각만 넣고, **파생값은 앱이 계산**한다.

- 입력(3개): `bedtime` / `sleepOnset` / `wakeTime` + `nightWakes`(밤중 깬 횟수) + `sleepSatisfaction` 0~10.
- 앱 자동 파생(입력 불필요): 수면시간 · 취침시각 변동성 · 기상시각 변동성 · **midpoint of sleep** · **social jetlag** · 전날 대비 phase delay · 최근 3일 sleep debt.

현재 `lastNightSleep`(hours/quality/issues)는 보존하되, 신규는 `bedtime`/`sleepOnset`/`wakeTime`을 우선 출처로 하고 hours는 파생으로 계산해 채운다.

---

## 6. 화면/폰 — "많이 봄" 금지, 숫자로

주관적 Y/N(SNS 많이 봄, 쇼츠 많이 봄)로는 못 판다. 가능하면 자동 수집 숫자로:

- 총 screen time · SNS minutes · short-form minutes · **취침 전 2시간 screen minutes** · 마지막 화면 사용시각.

특히 **취침 전 화면 사용량**을 최우선으로 받는다(late screen 다음날 상태가 실데이터에서 수상했으나 주관적 Y/N이라 더 못 팠다). 자동 수집이 불가한 환경에서는 "취침 전 화면 분(수동 슬라이더)"만이라도 숫자로 받는다.

---

## 7. 운동 — "운동함 Y/N" 금지

최소 스키마: `startTime` · `durationMin` · `RPE` 0~10 · `type`(근력/유산소/걷기). 자동 수집 가능 시 steps / active calories / workout minutes 추가.

이러면 "운동한 날 좋다"가 아니라 "30~60분 중강도 운동 후 다음날 에너지 평균 +1.4 / 밤 9시 이후 고강도 운동에선 수면 시작이 42분 늦어짐" 수준으로 간다. → 운동은 `eventLogs`의 movement 사건이 아니라 **구조화 필드**(신규 `exerciseLogs` 또는 `dailyLogs.exercise?` 서브객체)로 받는다.

---

## 8. 스트레스 이벤트 — 51종/11카테고리 → 6종

표본은 ~51일인데 predictor 후보가 너무 많아 우연 상관을 잡기 쉽다. 스트레스성 사건은 **딱 6종**으로 축소한다.

1. 업무/학업 압박 · 2. 인간관계 갈등 · 3. 예정된 일에 대한 부담 · 4. 통제감 상실/실수 · 5. 외모·몸 신경씀 · 6. 환경/감각 스트레스

이벤트 발생 시 **`시각 + 강도 0~10`만** 찍는다 (예: `16:40 인간관계 갈등 8`). 그 뒤 저녁 State가 어떻게 변했는지를 분석한다. → 기존 51종 `eventCode`는 이 6개 상위 그룹으로 매핑(카탈로그에 `stressGroup` 필드 추가), 옛 기록은 매핑으로 읽고 신규 입력 UI는 6개만 노출.

---

## 9. 약 / 건강 이벤트 — 무조건 별도 타임라인

의학적 해석엔 필수다. `eventLogs`·`dailyLogs`와 섞지 않는다.

- **약**: 이름 / 용량 / 복용·투여 시각 / 변경일.
- **healthException**(큰 사건): 감기·몸살 / 열 / 설사·구토 / 여행 / 밤샘 / 시차 / 예방접종 / 수술·시술.

없으면 어느 날 식욕·피로가 확 바뀌었을 때 질병 때문인지 생활 때문인지 통계가 엉망이 된다. → 신규 `medicationLogs` + `healthEvents` 타임라인. 분석은 이 구간을 **교란변수 또는 제외 구간**으로 명시적으로 다룬다. 현재 `rhythmExceptionCodes`(illness/injury/medication_change 등)는 이 타임라인의 씨앗으로 승격한다.

---

## 10. 생리 — '평균 28일' 절대 사용 금지

실 Health 기록에서 최근 주기가 26~51일까지 움직였고, 최근 1년 typical cycle은 30일 ±6일이다. **평균 28일 가정은 금지한다.**

**현재 코드의 문제**: `src/engine/cycle.ts`는 실측 간격 median을 우선하지만, 간격이 없으면 `averageCycleLength ?? 28`로 fallback하고 그 값으로 `nextPeriodDate`·premenstrual window를 만든다. `DEFAULT_USER_SETTINGS.averageCycleLength = 28`.

**개편**:
- 입력은 사실만: `periodStart` 날짜 · 매일 `flowLevel` 0~3 · `spotting` Y/N. (원하면 배란점액 · LH test.)
- **28 fallback 폐기**: 실측 간격이 부족하면 phase를 *추정하지 않고* `confidence: 'none'/'low'`로 두고 라벨을 붙이지 않는다. "평균주기 28일이니까 오늘 PMS" 절대 금지.
- 파생 자동 계산: cycle day · days since period · days until next(사후 계산) · **개인별 상대 cycle phase**.

### 사후 정렬 (event-aligned) — 분석의 핵심

생리가 8/20 시작이면 `8/19=D-1, 8/18=D-2 …`로 **실제 생리 기준 역산**한다. 주기가 26일이든 34일이든 정확하다. 3~6개월 쌓이면 모든 사이클을 D축에 겹쳐 각 D에서 physical hunger·craving·binge urge·mood·irritability·energy·bloating·sleep 평균을 낸다 → "D-7부터 craving 상승, D-4부터 급증, physical hunger는 불변, D0~D2 energy 저하, D+3 정상화" 같은 개인 패턴.

---

## 11. 체중 — 값과 "봤는지"를 분리

- `weight` = 신체 변수 (State/Context).
- `userSawWeight` = 심리적 exposure. 몸무게 숫자를 *본 행위* 자체가 자극이 될 수 있으므로 **별도 필드**로 받고 섞지 않는다.

---

## 12. 0 / null / unknown 삼분 저장 — DB 수준 필수

분석 품질을 가장 크게 올리는 한 가지. 지금은 0과 미입력이 섞여 있다.

| 값 | 의미 |
|---|---|
| `0` | 증상이 전혀 없음 (측정함) |
| `null` | 측정 안 함 |
| `'unknown'` | 모르겠음 (측정 시도했으나 판단 불가) |

**현재 위험**: `DailyLog`의 코어 축이 non-optional `number`라, 미입력이 `0`으로 저장돼 "증상 없음"과 구별되지 않는다. → 신규 코어는 `number | null` + 필요 시 `'unknown'` 센티넬 허용. 저장·내보내기·분석 전 구간에서 이 삼분을 보존한다. 엔진의 평균/상관은 `null`을 *결측 처리*(제외)하고 `0`은 값으로 쓴다.

---

## 13. 입력 UX — 생각보다 안 복잡하게

사용자는 하루 크게 3번만 만진다.

- **🌅 아침 1분**: 수면 시각(가능하면 자동) + 기분·불안·짜증·에너지·집중·배고픔·몸상태.
- **🍴 먹을 때 10초**: 배고픔·craving·binge urge → 식사 종료 후 양 + 음식종류 몇 개.
- **🌙 밤 1분**: 기분·불안·짜증·에너지·집중·craving·binge urge·몸상태.
- **+ 이벤트 (특별한 일 있을 때만)**: `16:40 인간관계 8`.

---

## 14. 분석 파이프라인 — "덜 사기 치는" 방법

깨끗한 데이터가 쌓이면 엔진은 아래 순서로 돈다. (현재 `src/engine/`의 correlation·patterns·cycle·episode 모듈을 이 파이프라인으로 재편성.)

1. **데이터 품질 검사 (선행 게이트)**: missing rate · 입력 누락 패턴 · 0값 이상 · 스키마 변경 · 이상치 · 기록시각 오류. 쓰레기 데이터로 분석을 돌리지 않도록 여기서 차단.
2. **탐색용 단순 상관**: Spearman으로 식욕↔수면, 짜증↔업무, 에너지↔운동을 훑음. **여기서 절대 "X가 Y의 원인"이라 말하지 않는다** — 1차 탐색일 뿐.
3. **Lag 분석 (핵심)**: `X(t-1) → Y(t)`. 어제 밤 화면→오늘 아침 에너지, 어제 수면시각→오늘 식욕, 오늘 갈등→3시간 뒤 불안. 더 강하게: **오늘 Y를 예측할 때 어제 Y도 함께 넣어**(자기상관 제거) 그 위에서 화면사용이 *추가로* 설명하는지 본다.
4. **교란변수 동시 투입**: 식욕 분석 시 수면·cycle position·요일·시간추세·운동·식사간격·스트레스·질병을 함께 넣어, "생리 전이라 오른 걸 늦게 자서 오른 것처럼" 착각하지 않는다.
5. **시계열 추세 제거 (detrend)**: 실데이터에서 8월 들어 식욕 베이스라인 자체가 상승 → 안 빼면 8월 후반의 모든 행동이 식욕 원인처럼 보인다. 모델에 항상 date/time trend 투입. 필요 시 **change-point detection**("8/8부터 식욕이 다른 regime")으로 전후 분리.
6. **주기 event-aligned 분석**: §10의 D축 정렬(최소 3, 가능하면 4~6 cycles).
7. **상태 자동 군집화**: 90일+ 쌓이면 PCA/factor analysis + clustering으로 하루 타입(정상형·감정폭풍형·식욕폭풍형·에너지고갈형·불안각성형)을 찾음. (현재 데이터에서도 감정폭풍과 식욕폭풍이 따로 존재한다는 힌트 있음.)
8. **결과 표기 = 상관계수 딸랑 금지**: 매 항목에 **효과크기 + 반복성 + 불확실성** 3종을 함께. 예: "생리 D-7 이내 craving +2.8점, 95% CI, 4/4 cycles 같은 방향, d=1.1, 신뢰도 높음."
9. **다중비교 보정 (FDR)**: 변수 50개를 검사하면 우연히 몇 개는 유의하게 나온다 → Benjamini-Hochberg FDR로 *발견 후보*와 *재현되는 패턴*을 구분.
10. **개인 실험 (N-of-1 인과 근접)**: 관찰로 수상한 걸 찾은 뒤, 위험하지 않은 생활요인은 *한 번에 하나만* 바꿔 확인(예: 2주 취침 전 화면시간 고정). 단순 상관보다 인과에 한 걸음 가까워짐.

> **단정 금지 준수**: 파이프라인의 어떤 출력도 "원인입니다/때문입니다/확실/예측됩니다"를 쓰지 않는다. `copy/tone.ts` 가드와 테스트로 강제되는 기존 규칙을 그대로 지킨다.

---

## 15. 데이터 기간 기준

| 기간 | 도달 수준 |
|---|---|
| 30일 | 재미있는 힌트 |
| 60일 | 어느 정도 패턴 |
| 90~120일 | 꽤 좋은 개인 시계열 분석 |
| 월경 분석 | 최소 3 cycles, 가능하면 4~6 cycles |

분석 UI는 현재 기간이 각 분석에 충분한지를 명시(데이터 부족 카드)한다 — 기존 "데이터 부족" 톤 유지.

---

## 16. 현재 스키마 → 신규 매핑 요약

| 항목 | 현재 | 신규 | 마이그레이션 |
|---|---|---|---|
| 코어 State 12축 | `DailyLog` 다수 필드(비optional number) | `number\|null` 유지 + 3식욕축 명시 | 불필요(비인덱스) |
| 아침/저녁 | 하루 1행 | `morning?`/`evening?` 서브객체 | 불필요(비인덱스) |
| 식사 로그 | 없음(단 음식 사건) | **신규 `mealLogs` 테이블** | **필요(DB_VERSION↑)** |
| 수면 | `lastNightSleep.hours` | `bedtime/sleepOnset/wakeTime` + 파생 | 불필요(비인덱스) |
| 화면 | 주관 Y/N 사건 | 숫자 필드(취침전 분 우선) | 불필요(비인덱스) |
| 운동 | movement 사건 | 구조화 `exercise?`(시각/분/RPE/type) | 불필요(비인덱스) |
| 스트레스 | 51종/11카테고리 | 6종 + `시각+강도` | 카탈로그만(데이터 불변) |
| 약/건강 | `rhythmExceptionCodes` | `medicationLogs` + `healthEvents` | **신규 테이블은 필요** |
| 생리 | median 우선, `?? 28` fallback | 28 폐기 + D축 사후정렬 | 불필요(엔진/설정) |
| 체중 | 없음 | `weight` + `userSawWeight` | 불필요(비인덱스) |
| 0/null/unknown | 0과 미입력 혼재 | 삼분 저장 | 필드 타입만 |

**핵심**: 이 개편의 대부분은 **비인덱스 optional 필드 추가**라 무마이그레이션이다. DB_VERSION 상승이 필요한 건 하루 여러 행이 생기는 **신규 테이블**(`mealLogs`, `medicationLogs`, `healthEvents`)뿐이며, 이때만 `db.ts`에 `version(2).stores(...).upgrade(...)`를 추가한다(기존 7테이블 인덱스 문자열은 그대로 복사).

---

## 17. 내보내기 포맷 영향

- `EXPORT_FORMAT_VERSION`은 현재 `1`. 신규 테이블·필드가 추가되면 **`2`로 상승**하고, import 검증(`dataImportService`)이 v1(옛 내보내기)도 계속 읽도록 하위호환을 유지한다.
- 0/null/unknown 삼분은 내보내기 JSON에서 **그대로 직렬화**한다(0을 null로, null을 0으로 접지 않는다). 이게 지금까지 분석을 방해한 핵심이므로 export 테스트에 삼분 보존 케이스를 추가한다.

---

## 18. 단계별 구현 로드맵 (위험도 오름차순)

각 단계는 독립 병합 가능하고, 앞 단계가 뒤 단계의 전제다. **이 문서 승인 후 "N단계 시작" 신호로 진행한다.**

| 단계 | 내용 | 마이그레이션 | 위험 |
|---|---|---|---|
| **P1** | 코어 12 확정 + 식욕 3축 분리 + 0/null/unknown 타입 도입(비인덱스 optional, 기존 필드 읽기 호환) | 없음 | 낮음 |
| **P2** | 수면 시각 3개 + 파생 계산, 체중/userSawWeight, 화면 숫자, 운동 구조화 (전부 비인덱스 optional) | 없음 | 낮음 |
| **P3** | 아침/저녁 2시점 서브객체 + 입력 UX 3분할 | 없음 | 중간(UI 큼) |
| **P4** | 생리 28 fallback 폐기 + D축 사후정렬 엔진 | 없음(엔진) | 중간 |
| **P5** | 스트레스 6종 축소 + 카탈로그 매핑(옛 51종 읽기 호환) | 없음(카탈로그) | 중간 |
| **P6** | 신규 테이블 `mealLogs`/`medicationLogs`/`healthEvents` + DB_VERSION↑ + EXPORT_FORMAT_VERSION↑ | **필요** | 높음 |
| **P7** | 분석 파이프라인 재편(품질게이트→lag→교란보정→detrend→FDR→효과크기·반복성) | 없음(엔진) | 높음 |
| **P8** | 상태 군집화 + 개인 실험(N-of-1) 지원 | 없음(엔진) | 높음(데이터 90일+ 필요) |

---

## 19. 불변 규칙 준수 체크

- **단정 금지**: 모든 신규 분석 출력은 `copy/tone.ts` 가드를 통과해야 한다("가능성/함께 나타나는 경향/신뢰도/데이터 부족"). 기존 `copyGuard.test.ts`·`analysisLanguage.test.ts` 범위를 신규 출력까지 확장.
- **로컬 우선**: 자동 수집(Health/steps/screen)이 붙어도 데이터는 기기(IndexedDB)에만 남기고 서버로 보내지 않는다.
- **의료 아님**: 폭식·기능저하·질병 필드는 진단이 아니라 사용자가 고르는 사실 라벨이다. functionLevel과 동일 톤.
- **사용자는 사실만**: 원인 추측은 계속 금지. Exposure/State/Outcome/Context 4분류는 *역할 태깅*이지 사용자가 인과를 지정하는 게 아니다.

---

## 20. 다음 액션

이 계획서가 승인되면 **P1(코어 12 + 식욕 3축 + 0/null/unknown)**부터 시작한다 — 무마이그레이션·낮은 위험이며, 이후 모든 분석의 기반이다. 각 단계 시작 시 별도 계획 확정 없이 이 문서의 해당 절을 구현 명세로 삼는다.
