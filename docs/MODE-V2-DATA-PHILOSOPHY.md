# MODE V2 — 데이터 철학 (N-of-1 개인 건강 데이터셋)

MODE V2는 "기록 일기"에서 **개인 N-of-1 연구 데이터셋**으로 데이터 계층을 다시 세운 것이다.
이 문서는 왜 이렇게 저장/분석하는지의 규칙을 고정한다. 앱을 고칠 때 이 규칙을 먼저 읽는다.

로컬 우선: 모든 데이터는 기기 IndexedDB(`MODELocalDB`)에만 있다. 서버/계정 없음.

---

## 1. 0 / null / unknown 은 서로 다르다

세 상태를 절대 섞지 않는다. 하나만 제대로 지켜도 분석 품질이 크게 올라간다.

- `0` = 측정했고 증상이 **전혀 없음** (진짜 숫자 0)
- `null` / 값 없음 = **측정 안 함** (미입력)
- `'unknown'` = 측정했으나 **판단 불가** ("모름")

규칙:
- 사용자가 고르지 않은 값을 **0으로 저장하지 않는다.**
- 아침에 **원래 묻지 않은** metric은 `promptedMetrics`에 없고 `metrics`에도 없다 →
  분석기가 "안 물어봄"과 "물어봤는데 미응답"을 구분한다.
- numeric 분석에서 `null`/`'unknown'`은 제외한다. 품질 리포트의 분모는
  총 체크인이 아니라 **그 metric을 실제로 물어본 횟수(promptedCount)**다.

`TriBoolean`(예/아니오/모름/미입력)도 같은 삼분 원칙을 따른다 — 미입력을 `false`로 처리하지 않는다.

---

## 2. Timestamp

"있었다"가 아니라 **언제**를 남긴다. 원인-결과의 시간 방향을 분석하기 위해서다.

- 상태/사건/식사/수면/약/운동/체중은 모두 절대 시각(ISO datetime)을 갖는다.
- `StateMeasurement.recordedAt` = 측정 시각(불변), `updatedAt` = 수정 시각 — **혼동하지 않는다.**
  기존 체크인을 편집해도 `recordedAt`은 원래 값을 유지한다.
- 수면/식사 등의 시각은 `datetime-local`로 받아 자정/날짜 경계를 사용자가 고른 그대로 저장한다.
- `localDate`(YYYY-MM-DD) + `timezoneOffsetMinutes`로 로컬 날짜 provenance를 함께 둔다.

파생값(수면시간·midpoint·식사 간격 등)은 **저장하지 않고** 순수 함수로 계산한다.

---

## 3. Source / Provenance

모든 V2 레코드는 `source`를 갖는다: `manual | healthkit | import | derived | legacy`.

- 분석 cohort 분류(`classifyProvenance`): `v2_core`(직접 측정) / `legacy_compatible` / `legacy_display_only`.
- 자동 vs 수동 충돌: 원자료를 **overwrite하지 않는다.** 같은 슬롯에 여러 source가 있으면
  `resolveBySourcePriority`가 canonical만 규칙으로 고르고(우선순위 `manual > healthkit > import > derived > legacy`,
  동률이면 최신) 원본은 모두 보존한다.

---

## 4. V1 legacy semantics

V1 `dailyLogs`(및 7개 legacy 테이블)는 유지한다. 캘린더/기록/이전 방식 폼에서 계속 읽힌다.

- V1의 **애매한 0**(예: `moodLow=0`)을 V2 직접 rating과 **동등한 측정으로 취급하지 않는다.**
  provenance가 불확실하므로 `legacy_display_only` cohort로 분류하고 core numeric 분석에서 제외한다.
- V1 → V2 자동 변환을 하지 않는다. 두 계층은 역할이 분리돼 있다.
- V2 신규 입력에서 같은 개념을 두 번 묻지 않는다. 아래 중복은 V2 새 입력 동선에 노출하지 않는다
  (기존 기록 표시용으로만 legacy 폼에 남는다):
  - `energy` vs `bodyEnergyLevel`
  - `focus` vs `focusLevel`
  - `appetite`(단일) vs `physicalHunger`/`craving`/`bingeUrge`(3분리)
  - `overallIntensity` (V2 core numeric을 재생성하지 않는다)
  - legacy body signals / legacy event 공유 intensity(하나를 모든 코드에 복사)

---

## 5. Core 12 (매일 고정 상태)

`StateMeasurement`에 담기는 고정 12 metric. 이름은 core schema version 내에서 **바꾸지 않는다.**

`moodLow, anxiety, irritability, energy, focus, impulsivity, physicalHunger, craving,
bingeUrge, fatigueHeaviness, bloating, painDiscomfort`

- 척도: 0~10 정수, `'unknown'`, `null(미측정)`.
- 아침 기본 8개 / 저녁 기본 12개(prompted). 아침에 안 묻는 값은 0으로 채우지 않는다.
- 아침/저녁을 같은 날짜에 각각 upsert. adhoc(수시)은 여러 개 공존.

---

## 6. Hunger / Craving / Binge urge 는 분리한다

식욕을 하나로 합치지 않는다. 세 축을 **항상 별개 질문/별개 metric**으로 유지한다.

- `physicalHunger` — 배가 실제로 고픈가?
- `craving` — 배와 별개로 특정 음식이 먹고 싶은가?
- `bingeUrge` — 먹으면 제어하기 어려울 것 같은가?

식사 기록도 "먹기 직전 3축"을 각각 받고, "단 음식 먹음(sweetsIncluded)"과 craving을
같은 순간 하나로 합치지 않는다(시각별 방향성 보존). cycle-aligned 분석에서도 셋을 합치지 않는다.

---

## 7. Retrospective vs Prospective cycle

생리 주기는 사실만 기록한다(periodStart/flow/spotting/pain/LH/점액). 단계를 사용자가 고르지 않는다.

- **Prospective(오늘 판단)**: `buildCycleContext`는 `date ≤ target`만 사용한다 — 미래 생리를
  절대 당겨 쓰지 않는다(look-ahead 금지). 실제 관찰 간격이 없으면(시작 1개) 예측/PMS를 확정하지 않는다.
  **평균 28일 hard fallback을 primary inference로 쓰지 않는다.** `settings.averageCycleLength`는
  legacy 호환용으로 보존만 하고 V2 예측 근거로 쓰지 않는다.
- **Retrospective(사후 정렬)**: `getRelativeDayToNextPeriod`는 이미 발생한 다음 실제 periodStart를
  D0로 두고 그 이전을 D-1, D-2 … 로 역산한다. 주기가 26일이든 34일이든 실제 이벤트로 정렬한다.
  cycle-aligned 분석은 **완료된 주기만** 겹치며 현재 미완료 주기는 제외한다(최소 3 완료 주기).

두 경로를 엄격히 분리한다: Today 화면의 오늘 판단은 미래를 몰래 쓰면 안 되고,
Analysis의 retrospective는 발생한 다음 생리를 쓸 수 있다.

---

## 8. Observational association ≠ Causation

관찰 데이터다. "원인을 증명한다"고 말하지 않는다. 표현은:
`association / temporal association / repeated pattern / candidate / adjusted association`.

- 사건 이후에 상태가 변했다는 이유만으로 원인이라 부르지 않는다(event response는 supportCount+window로 보고).
- lagged 분석은 lag {0,1,2,3}을 모두 보고 family FDR을 적용한다 — 가장 큰 것만 남기는 cherry-picking 금지.
- 가능하면 이전 outcome `y(t-1)`을 보정하고, 사전 정의된 작은 confounder set(weekend/시간추세/cycle 등)만 넣는다.
- 실험 결과에 "효과가 입증됨" 류 문구를 만들지 않는다. 단정 금지 가드(`copy/tone`)를 통과해야 한다.

---

## 9. Analysis data thresholds (날짜 수만으로 신뢰도를 정하지 않는다)

- `canAnalyzeMetric` / `canAnalyzePair` / `analysisReadiness`: 실제 numeric 관찰 수 · paired 관찰 수 ·
  coverage · source/schema 일관성으로 판정한다(날짜 수가 아니라).
- 신뢰도(`scoreV2Confidence`)는 p-value 변환이 아니다: sample · coverage · effect magnitude ·
  repetition · uncertainty · FDR · adjusted 결과 가용성을 종합한 규칙(`V2_CONFIDENCE_RULES`).
- cycle-aligned: 최소 3 완료 주기(4~6이면 더 강함). clustering: usable days · per-metric coverage ·
  variance · missingness · **안정성**이 모두 충족될 때만 노출(불안정하면 숨김). 표시명은 진단명이 아니다.
- 데이터 기간 기대치(대략): 30일=힌트, 60일=패턴, 90~120일=꽤 좋은 개인 시계열, 월경 분석=3~6 cycle.

---

## 10. HealthKit / native future integration boundary

현재 앱은 웹 PWA다. **브라우저에서 HealthKit/Screen Time을 직접 읽지 않는다.**

- `HealthDataProvider` 인터페이스 + registry만 둔다. 실제 HealthKit 구현은 이 저장소에 넣지 않는다.
- 장래 iOS native wrapper/companion이 provider를 구현해 `HealthSampleBundle`(sleep onset/wake/steps/
  workouts/resting HR/HRV/weight/menstrual/screen)을 전달한다.
- `ingestHealthBundle`은 `source='healthkit'`로 저장하되 **manual 원자료를 덮어쓰지 않는다**
  (episode형은 별도 행으로 add, 하루 1행형은 기존 값이 있으면 스킵). canonical 선택은 resolver가 처리.
- provider가 없어도 PWA는 정상 동작한다(manual only). Screen Time도 웹에서 가짜 자동수집을 만들지 않는다.

---

## 11. Export / Import compatibility

- 백업 포맷 `EXPORT_FORMAT_VERSION = 2`: V1 7테이블 + V2 10테이블(원자료 전부)을 담는다.
- import은 v1/v2 백업을 **모두** 받는다(`SUPPORTED_IMPORT_VERSIONS = [1,2]`).
  V1 파일도 손실 없이 legacy 테이블로 복원하며, 애매한 0을 V2 actual 0으로 바꾸지 않는다.
- V2 export → import 왕복은 완전히 동일(0/null/unknown 보존). 원자료만으로 앱을 복구할 수 있어
  분석 캐시(dailyScores/patternInsights)가 없어도 된다.
- 사용자 데이터는 서버로 보내지 않으며, 기록 원문을 콘솔/오류 메시지에 노출하지 않는다.

---

## ⚠️ Core 12 rating 이름/척도는 당분간 바꾸지 않는다

MODE V2 core 12 rating의 **이름과 0~10 척도는 실제 데이터를 최소 2~3개월 수집하기 전까지
자의적으로 다시 변경하지 않는다.** 중간에 스키마/척도를 바꾸면 시계열이 끊기고 사후 분석이 불가능해진다.
정말 바꿔야 하면 `CORE_METRICS_SCHEMA_VERSION`을 올리고 마이그레이션 신호로 남긴다.
