# MODE · 0단계 개발 계획서

> 개인 리듬 분석 앱 MODE의 전체 설계 문서. **이 문서는 구현 전 계획서다. 실제 구현은 "1단계 시작" 신호 이후 진행한다.**

## 확정된 기술 스택 / 전제

- **플랫폼**: React PWA (Vite + React + TypeScript)
- **저장**: 로컬 우선 (IndexedDB, 기기 저장 / 서버 없음 / 오프라인 동작)
- **상태관리**: Zustand (가벼움, 보일러플레이트 적음)
- **DB 래퍼**: Dexie.js (IndexedDB를 타입 안전하게)
- **날짜**: date-fns (주기 계산, 시간창 분석)
- **그래프**: 시안의 SVG spline을 컴포넌트화 (외부 차트 라이브러리 미사용 — 디자인 톤 유지)
- **PWA**: vite-plugin-pwa (설치형, 오프라인 캐시)
- **핵심 가치(불변)**: 사용자는 사실만 기록 / 앱이 패턴 분석 / 원인은 단정 금지, 후보·신뢰도로 표현 / 의료 진단 아님

---

## 1. 현재 디자인 파일에서 참고할 요소 / 수정할 요소

### 1-A. 그대로 가져올 요소 (디자인 자산)

| 요소 | 출처 (HTML) | 1단계에서 할 일 |
|---|---|---|
| 컬러 토큰 (`--lav`, `--coral`, `--mint`, `--sky`, `--rose`, `--butter` 등) | `:root` | `tokens.css`로 추출, 디자인 시스템화 |
| 배경 그라데이션 (다중 radial-gradient) | `body` | 전역 배경 컴포넌트 |
| 둥근 카드 / 글래스모피즘 (`.card.glass`, `--r-card:24px`) | CSS | `<Card>` 컴포넌트 |
| 모찌 캐릭터 (SVG 얼굴 7종: happy/teary/sleepy/hungry/focus/confused) | `FACES` JS | `<Mochi face=... gradient=.../>` 컴포넌트로 포팅 |
| 하단 탭바 (5탭 + SVG 아이콘) | `.tabbar`, `I` | `<TabBar>` + 라우팅 |
| 모드 카드 (그라데이션 헤더 + 괄호 라벨) | `.modecard` | `<ModeCard>` — 단, 괄호 문구는 **동적** |
| 캘린더 명암 렌즈 (`RAMP`, `renderCal`) | JS | 렌즈별 색 램프 로직 그대로 채택 |
| 슬라이드 그래프 (spline + area + ping 애니메이션) | `spline()`, `.gscroll` | `<FlowGraph>` 컴포넌트 |
| 예보 카드 (가능성 %, meter) | `.fcard` | `<ForecastCard>` |
| 4줄 설계 행 (`.plan`, `.planrow` 일정/식사/운동/관계) | CSS | `<DayPlan>` |
| `prefers-reduced-motion` 대응 | CSS | 접근성 유지 |

### 1-B. 반드시 수정/폐기할 요소 (로직이 낡음)

| 시안의 낡은 부분 | 위치 | 최신 명세대로 교체 |
|---|---|---|
| **"이유 같았던 건?"** 질문 + 원인 칩(잠/생리·주기/사람…) | 빠른기록 `q-appetite` | **폐기**. "오늘 있었던 일"(사건/상황 기록)으로 교체. 사용자가 원인을 고르지 않는다 |
| 빠른기록 칩에 **"생리·주기"** 가 원인 후보로 존재 | `q-appetite` | **폐기**. 생리는 별도 `cycleLogs` 기록 → 앱이 날짜로 자동 계산 |
| 모드 괄호 문구 **고정** ("오늘 다 진심임", "배터리 5%") | `.modecard__paren` | 점수·상황 기반 **동적 생성** (`buildSubLabel`) |
| "범인/현행범/유력 용의자/심증·물증" 등 단정적 수사 톤 | `.suspects`, `.stamp` | 톤은 귀엽게 유지하되 **신뢰도 등급**(참고 기록/가능성 있음/유력 후보/반복 패턴 강함)에 매핑. 문구는 "함께 나타나는 경향" |
| 4줄 설계 고정 문구 ("긴 답장은 내일의 일로") | `.plan` | dayType + 점수 기반 동적 생성 |
| 상태 칩 라벨 비표준 ("식욕폭발", "몸살", "인간피로") | `q-emotion` | 명세 표준 라벨로(식욕 변동/몸 불편/사회 피로). 귀여운 표기는 표시용 별칭으로만 |
| 캘린더가 고정 더미 `DAYS` 배열 | `DAYS` | 실제 `dailyScores`에서 렌즈별 부하값 읽어 렌더 |

### 1-C. 디자인 원칙 체크리스트 (명세의 절대 규칙 반영)

- 캘린더: 아이콘 남발 금지 → **색 진함 + 짧은 라벨** 중심 (시안 방향 유지)
- 모드 이름 먼저, 괄호는 보조 표현만
- "단짠" 같은 모호한 표현을 타입명으로 쓰지 않기 (내부 코드는 `sweetCraving`/`saltyCraving`)
- 항상 "가능성/패턴/신뢰도/경향" 어휘. "원인입니다" 금지 (문구 린팅 대상)

---

## 2. 추천 프로젝트 구조

```
mode-rhythm/
├─ docs/
│  └─ PHASE-0-PLAN.md            # 이 문서
├─ public/
│  ├─ manifest.webmanifest       # PWA
│  └─ icons/
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                    # 라우팅 + 탭 셸
│  ├─ design/                    # === 디자인 시스템 (시안 포팅) ===
│  │  ├─ tokens.css              # 컬러/반경/그림자 토큰
│  │  ├─ global.css              # 배경 그라데이션, 폰트
│  │  └─ components/
│  │     ├─ Card.tsx
│  │     ├─ Mochi.tsx            # 모찌 캐릭터 (face 7종)
│  │     ├─ Chip.tsx
│  │     ├─ TabBar.tsx
│  │     ├─ ModeCard.tsx
│  │     ├─ SuspectList.tsx      # 요인 후보 + 신뢰도 스탬프
│  │     ├─ DayPlan.tsx          # 4줄 설계
│  │     ├─ FlowGraph.tsx        # spline 그래프
│  │     ├─ CalendarGrid.tsx     # 명암 + 렌즈
│  │     └─ ForecastCard.tsx
│  ├─ screens/                   # === 화면 (탭) ===
│  │  ├─ Onboarding/
│  │  ├─ Today/
│  │  ├─ Record/                 # 빠른 기록
│  │  ├─ Calendar/
│  │  ├─ Analysis/
│  │  ├─ Forecast/
│  │  └─ Settings/
│  ├─ data/                      # === 저장 계층 (IndexedDB) ===
│  │  ├─ db.ts                   # Dexie 스키마 정의
│  │  ├─ models.ts               # 타입 (dailyLogs, eventLogs, ...)
│  │  ├─ repositories/           # CRUD per 테이블
│  │  │  ├─ dailyLogRepo.ts
│  │  │  ├─ eventLogRepo.ts
│  │  │  ├─ cycleLogRepo.ts
│  │  │  ├─ recoveryLogRepo.ts
│  │  │  ├─ dailyScoreRepo.ts
│  │  │  └─ insightRepo.ts
│  │  └─ catalog/                # 정적 카탈로그 (선택지 정의)
│  │     ├─ events.ts            # 오늘 있었던 일 + category + mappedFactorGroup
│  │     ├─ recoveryActions.ts
│  │     └─ states.ts            # 오늘 상태 칩
│  ├─ engine/                    # === 분석/계산 엔진 (UI 무관, 순수 함수) ===
│  │  ├─ scoring/
│  │  │  ├─ emotionalLoad.ts
│  │  │  ├─ appetiteLoad.ts
│  │  │  ├─ sleepLoad.ts
│  │  │  ├─ bodyLoad.ts
│  │  │  ├─ eventLoad.ts
│  │  │  ├─ rhythmLoad.ts
│  │  │  └─ normalize.ts         # 0~100 보정 공통
│  │  ├─ cycle/
│  │  │  └─ cycleEngine.ts       # 주기 자동 계산 (cycleLoad 포함)
│  │  ├─ classify/
│  │  │  ├─ classifyDay.ts       # dayType 결정
│  │  │  └─ subLabel.ts          # 동적 괄호 문구
│  │  ├─ correlation/
│  │  │  ├─ baseline.ts          # 30일 기준선
│  │  │  ├─ factorEffect.ts      # 요인효과 + 시간창
│  │  │  ├─ confidence.ts        # 신뢰도 계산
│  │  │  ├─ accomplice.ts        # 공범(조합) 구조
│  │  │  └─ unexplained.ts       # 원인 미상 판정
│  │  ├─ recovery/
│  │  │  └─ recoveryAnalysis.ts  # 전후/다음날 비교, recoveryScore
│  │  └─ forecast/
│  │     └─ forecast.ts          # 내일 예보 + 하루 설계
│  ├─ store/                     # Zustand 스토어 (화면↔엔진 중개)
│  │  ├─ useLogStore.ts
│  │  ├─ useScoreStore.ts
│  │  └─ useSettingsStore.ts
│  ├─ copy/                      # === 문구 (단정 금지 규칙 집중) ===
│  │  ├─ tone.ts                 # 신뢰도/경향 표현 헬퍼
│  │  └─ messages.ts             # 메시지 템플릿
│  └─ utils/
│     ├─ date.ts
│     └─ id.ts
├─ tests/                        # 엔진 단위 테스트 (계산은 반드시 테스트)
└─ ...config (vite, tsconfig, eslint)
```

**핵심 설계 원칙**: `engine/`은 React/DB를 전혀 모른다(순수 함수 + 입력 객체). 그래야 테스트가 쉽고, 계산식 변경이 UI를 깨지 않는다. 화면은 `store`를 통해서만 엔진 결과를 읽는다.

---

## 3. 추천 데이터 모델 구조

명세의 7개 모델을 TypeScript 타입으로 정리. 모든 수치 항목은 별도 표기 없으면 **0~10 정수(사용자 입력 강도)**, 점수(`*Load`)는 **0~100**.

```ts
// 공통
type ISODate = string;   // 'YYYY-MM-DD'  (날짜 키)
type ISOTime = string;   // ISO timestamp (createdAt 등)
type Id = string;        // uuid

// 1. dailyLogs — 하루 상태(슬라이더/칩에서 파생된 0~10 강도)
interface DailyLog {
  id: Id; date: ISODate;
  moodLow: number; anxiety: number; irritability: number; sadness: number;
  heaviness: number; calm: number; energy: number; focus: number;
  selfCriticism: number; impulsivity: number;
  appetite: number; sweetCraving: number; saltyCraving: number; bingeUrge: number;
  bodyDiscomfort: number; pain: number; bloating: number; fatigue: number;
  headache: number; digestion: number;
  memo?: string; createdAt: ISOTime; updatedAt: ISOTime;
}

// 2. eventLogs — "오늘 있었던 일"(사건/상황 기록, 원인추측 아님)
interface EventLog {
  id: Id; date: ISODate;
  eventCode: string;            // 카탈로그 코드 (예: 'sleep_short')
  eventLabel: string;
  category: EventCategory;      // 수면|식사|관계|일|외모|환경|디지털|몸|기타
  timing: 'today'|'yesterday'|'recent_days';
  intensity: 'low'|'mid'|'high';
  isCustom: boolean;
  customLabel?: string;
  mappedFactorGroup: string;    // 분석용 그룹키 (커스텀도 여기로 수렴)
  isRecurring?: 'once'|'sometimes'|'often';
  createdAt: ISOTime;
}

// 3. cycleLogs — 사용자는 사실만(시작/종료/양/통증/증상). 요인 선택 아님.
interface CycleLog {
  id: Id; date: ISODate;
  periodStart?: boolean; periodEnd?: boolean;
  flowLevel?: 'spotting'|'light'|'medium'|'heavy';
  periodPain?: number;          // 0~10
  symptoms?: string[];
  createdAt: ISOTime;
}

// 4. recoveryLogs — "뭐 했더니 나아졌어?" + 전후 비교
interface RecoveryLog {
  id: Id; date: ISODate;
  actionCode: string; actionLabel: string; category: string;
  beforeMood?: number; afterMood?: number;
  beforeAnxiety?: number; afterAnxiety?: number;
  beforeAppetite?: number; afterAppetite?: number;
  beforeBodyLoad?: number; afterBodyLoad?: number;
  effect: 'much_better'|'a_bit_better'|'same'|'worse';
  timeGap?: number;             // 분 단위 (행동→재측정)
  memo?: string; createdAt: ISOTime;
}

// 5. dailyScores — 엔진이 매일 계산해서 저장 (캘린더/분석/예보가 읽음)
interface DailyScore {
  id: Id; date: ISODate;
  emotionalLoad: number; appetiteLoad: number; sleepLoad: number;
  bodyLoad: number; cycleLoad: number; eventLoad: number; rhythmLoad: number; // 모두 0~100
  recoveryScore: number;
  dayType: DayType;             // 안정일|감정 민감일|...
  dayTypeSubLabel: string;      // 동적 괄호 문구
  confidence: number;           // 0~100 (해석 신뢰도)
  createdAt: ISOTime;
}

// 6. patternInsights — 분석 산출물(상관/공범/회복/미상)
interface PatternInsight {
  id: Id;
  insightType: 'factor'|'accomplice'|'recovery'|'unexplained'|'cycle';
  targetMetric: string;         // 어떤 결과지표에 대한 것인지 (emotionalLoad 등)
  factorCodes: string[];        // 관련 요인 그룹들
  effectSize: number;
  confidence: number;           // 0~100
  supportCount: number;         // 기록수
  message: string;              // 단정 금지 문구
  createdAt: ISOTime;
}

// 7. userSettings — 단일 행
interface UserSettings {
  cycleEnabled: boolean;
  averageCycleLength: number;   // 기본 28, 기록으로 갱신
  toneMode: 'soft'|'plain';
  reminderEnabled: boolean;
  privacyMode: boolean;
  createdAt: ISOTime; updatedAt: ISOTime;
}
```

**인덱스/키 전략 (Dexie)**: 대부분의 조회가 날짜 기반이므로 각 테이블 `date`를 인덱싱. `eventLogs`는 `[date+mappedFactorGroup]`, `recoveryLogs`는 `[date+actionCode]` 복합 인덱스. `dailyScores.date`는 **유니크**(하루 1행, upsert).

**카탈로그 분리**: "오늘 있었던 일" 25개 선택지는 코드가 아니라 `data/catalog/events.ts`의 데이터로 둔다. 각 항목이 `{ code, label, category, defaultFactorGroup }`을 갖고, 일부는 점수 입력(`mealSkipped`, `lateNightEating` 등 식욕 공식의 가산 항목)으로 연결된다.

---

## 4. 핵심 함수 목록 (시그니처만)

> 0단계에서는 구현하지 않고 **계약(시그니처)** 만 합의.

### 4-A. 점수 엔진 (`engine/scoring`)
```ts
calcEmotionalLoad(d: DailyLog): number              // 0~100
calcAppetiteLoad(d: DailyLog, ev: EventLog[]): number
calcSleepLoad(d: DailyLog, ev: EventLog[]): number
calcBodyLoad(d: DailyLog, cycle: CycleContext): number
calcEventLoad(ev: EventLog[]): number
calcRhythmLoad(parts: LoadParts): number
normalize(raw: number, min: number, max: number): number  // 0~100 클램프
```

### 4-B. 주기 엔진 (`engine/cycle`)
```ts
buildCycleContext(date: ISODate, cycleLogs: CycleLog[], settings: UserSettings): CycleContext
calcCycleLoad(ctx: CycleContext): number
estimateNextPeriod(cycleLogs: CycleLog[]): { date: ISODate; basis: 'median'|'mean'|'insufficient' }
cycleStrengthForUser(scores: DailyScore[], cycleCtxByDate): 'strong'|'weak'|'unknown'
```

### 4-C. 분류 (`engine/classify`)
```ts
classifyDay(score: DailyScore, signals: DaySignals): DayType
buildSubLabel(dayType: DayType, signals: DaySignals): string   // 동적 괄호 문구
```

### 4-D. 상관/패턴 (`engine/correlation`)
```ts
calcBaseline(scores: DailyScore[], windowDays=30): Baseline
factorEffect(factor, metric, window: 'same'|'prev'|'cum3'|'cum7', logs): EffectResult
calcConfidence(e: EffectResult): number                        // 0~100
confidenceTier(c: number): '참고 기록'|'가능성 있음'|'유력 후보'|'반복 패턴 강함'
accompliceEffect(a, b, metric, logs): AccompliceResult | null  // 데이터 부족 시 null
detectUnexplained(score: DailyScore, topFactors: EffectResult[]): boolean
```

### 4-E. 회복 (`engine/recovery`)
```ts
recoveryDelta(r: RecoveryLog): RecoveryDelta             // 전후 차이
calcRecoveryScore(delta: RecoveryDelta): number
nextDayRecoveryEffect(action, logs): EffectResult        // 다음날 비교
topRecoveryActions(logs, dayType?): RankedAction[]       // "나를 살린 것들"
```

### 4-F. 예보/설계 (`engine/forecast`)
```ts
forecastTomorrow(history, cycleCtx): { dayType; probability; reason }
buildDayPlan(dayType, signals): { schedule; meal; exercise; relation }  // 4줄
findSimilarPastDays(today, history): DailyScore[]        // 유사 과거일
```

### 4-G. 문구/톤 (`copy`)
```ts
toTendencyPhrase(factorLabel, metricLabel, confidence): string  // "함께 나타나는 경향"
assertGuard(text: string): string   // 단정 표현 차단(개발용 린트)
```

---

## 5. 각 함수가 하는 일 (의도)

- **calcEmotionalLoad**: 명세 가중합(`moodLow*1.2 + anxiety*1.1 + ... - calm*0.8`) → `normalize`로 0~100. calm은 감점.
- **calcAppetiteLoad**: `appetite*0.8 + sweetCraving*1.1 + saltyCraving*0.8 + bingeUrge*1.5` + 사건 가산(`mealSkipped*6`, `lateNightEating*7`). 사건값은 `eventLogs`에서 해당 코드 존재 여부로 0/1.
- **calcSleepLoad**: 수면시간·질·중간각성·늦게잠·악몽으로 계산. 입력 소스는 DailyLog 확장 또는 수면 관련 eventLog. (0단계 메모: 수면 세부 입력 필드 확정 필요 — 위험요소 참고)
- **calcBodyLoad**: `pain*1.2 + bloating + fatigue*1.3 + headache*0.9 + digestion*0.8 + periodPain*1.2`. periodPain은 cycleLogs에서.
- **calcEventLoad**: 그날 사건들의 강도/카테고리 가중합 → 0~100.
- **calcRhythmLoad**: 6개 부하의 가중합(감정0.30/식욕0.15/수면0.15/몸0.15/주기0.10/사건0.15).
- **buildCycleContext**: 날짜 + 과거 생리기록으로 "생리 중 / n일째 / 예정 n일 전 / 월경 전 민감 구간 / 배란 추정 구간"을 계산해 한 객체로. **사용자는 선택하지 않는다.**
- **calcCycleLoad**: 위 컨텍스트의 구간에 따라 0~100 부하. 단 개인 데이터에서 관련성이 약하면 가중을 낮춤(`cycleStrengthForUser`와 연동).
- **cycleStrengthForUser**: 월경 전 구간과 감정/식욕/몸 점수의 동반 상승이 약하면 'weak' → 화면에 "강하지 않음" 표기.
- **classifyDay**: 어느 부하가 임계 이상인지, 복수면 '복합 흔들림일', 높은데 설명 안 되면 '원인 미상일' 등 우선순위 규칙으로 dayType 결정.
- **buildSubLabel**: dayType + 세부 신호로 괄호 문구 **동적 생성**(예: 감정 민감일+자기비난↑→"자기평가 보류"). 절대 고정 금지.
- **calcBaseline**: 최근 30일 각 지표 평균/표준편차 → 개인 기준선.
- **factorEffect**: "요인 있던 날(또는 다음날/누적) 결과 평균 − 없던 날 평균". 4개 시간창(당일/전날/3일/7일) 각각.
- **calcConfidence**: `기록수35% + 효과크기35% + 일관성20% + 최근성10% − 겹침패널티`.
- **confidenceTier**: 0~30 참고 / 31~55 가능성 / 56~75 유력 / 76~100 반복 강함.
- **accompliceEffect**: A&B 동시일 결과 − max(A만, B만, 평소). 데이터 부족이면 null(카드 미표시).
- **detectUnexplained**: rhythmLoad 높음 + 상위 요인 confidence 낮음 + 최근 사건으로 설명 부족 → true("미제 사건"으로 보관).
- **recoveryDelta / calcRecoveryScore**: 전후 차이 → `기분개선*1.2 + 불안감소*1.1 + 짜증감소*0.9 + 식욕안정*0.8 + 몸부하감소*0.7`.
- **nextDayRecoveryEffect**: 그 행동 한 다음날 평균 vs 안 한 다음날 평균.
- **topRecoveryActions**: "나를 살린 것들 / 오늘의 구조대 / 개인 회복템" 랭킹. dayType별 필터 가능.
- **forecastTomorrow**: 주기 위치 + 수면 적자 + 최근 추세로 내일 dayType과 **가능성(%)**. "확정" 금지.
- **buildDayPlan**: dayType+신호로 일정/식사/운동/관계 4줄 생성.
- **findSimilarPastDays**: 점수 벡터 유사도로 과거 비슷한 날을 찾아 그때 효과 본 회복행동 추천.
- **assertGuard**: "원인입니다/때문입니다" 등 단정 표현을 개발 중 감지(테스트/린트).

---

## 6. 구현 단계 분해 (1단계 이후 로드맵)

- **1단계 — 프로젝트 부트스트랩 + 디자인 시스템**
  Vite+React+TS 셋업, `tokens.css`/`global.css` 추출, `Mochi`/`Card`/`Chip`/`TabBar` 컴포넌트, 5탭 라우팅 셸. 데이터/엔진 없이 정적 화면이 시안처럼 보이게.
- **2단계 — 저장 계층**
  Dexie 스키마(7테이블) + repositories + 카탈로그(events/recoveryActions/states) + settings. 시드/리셋 유틸.
- **3단계 — 기록 화면 (쓰기 경로 완성)**
  빠른 기록(상태/오늘 있었던 일/생리/회복 행동) → DailyLog·EventLog·CycleLog·RecoveryLog 저장. **"이유 같았던 건?" 완전 제거.** 커스텀 요인 추가(구조화 입력).
- **4단계 — 점수 엔진 + 오늘 화면**
  scoring 6종 + classifyDay + buildSubLabel + buildCycleContext/calcCycleLoad. 저장 후 dailyScores upsert. 오늘 화면(모드카드/요인 후보/4줄 설계/회복 추천)이 실제 데이터로.
- **5단계 — 캘린더**
  dailyScores를 렌즈별 색 램프로 렌더. 렌즈 전환(전체/감정/식욕/수면/몸/주기/회복).
- **6단계 — 상관/패턴 분석**
  baseline + factorEffect(4시간창) + confidence + accomplice + unexplained → patternInsights. 분석 화면(상습범/공범/미제/나를 살린 것들) + 슬라이드 그래프.
- **7단계 — 회복 분석 심화**
  전후 + 다음날 비교, recoveryScore 랭킹, dayType별 추천.
- **8단계 — 예보 / 하루 설계**
  forecastTomorrow(가능성%) + buildDayPlan + findSimilarPastDays + 이번 주 흐름.
- **9단계 — 설정/온보딩/PWA 마감**
  온보딩, 설정(cycleEnabled/tone/privacy/reminder), PWA manifest+오프라인, 접근성/모션 점검.
- **10단계 — 문구 가드 & 다듬기**
  assertGuard 전수 적용, 데이터 부족 상태(빈 화면) 카피, 신뢰도 표기 일관성.

---

## 7. 각 단계별 완료 기준 (Definition of Done)

| 단계 | 완료 기준 |
|---|---|
| 1 | 5탭 이동 가능, 모찌 7종 렌더, 시안 색/카드/배경 일치, 반응형·reduced-motion 동작 |
| 2 | 7테이블 CRUD 동작(테스트), 카탈로그 로드, settings 단일행 보장, 시드/리셋 됨 |
| 3 | 빠른 기록 저장 후 IndexedDB에 4종 로그 적재 확인, 커스텀 요인 구조화 저장, **원인추측 UI 없음** |
| 4 | 같은 입력→같은 점수(스냅샷 테스트), dayType/괄호문구가 입력 따라 변함, 주기 컨텍스트가 날짜로 자동계산 |
| 5 | 캘린더가 실제 점수로 명암 표시, 렌즈 전환 시 색 램프 변경, 빈 날 처리 |
| 6 | 요인효과 4시간창 산출, confidence 등급 표기, 공범/미제 카드가 데이터 충분할 때만 표시 |
| 7 | recoveryScore 랭킹 노출, "꽤 도움됨/효과 확인 중" 등급, dayType별 추천 |
| 8 | 예보가 **가능성%** 로만 표현(확정 금지), 4줄 설계 동적, 유사 과거일 추천 동작 |
| 9 | 설치형 PWA 동작, 오프라인에서 기록·조회 가능, 설정 반영 |
| 10 | assertGuard 통과(단정 문구 0건), 데이터 부족 시 친절한 빈 상태 문구 |

각 엔진 단계는 **단위 테스트 통과**가 DoD에 포함된다(계산은 수동 확인 불가).

---

## 8. 위험한 구현 실수 목록 (미리 차단)

1. **원인추측 UI 재유입**: 시안의 "이유 같았던 건?"·"생리·주기 칩"을 무심코 포팅. → 기록 화면은 "오늘 있었던 일(사건)"만. 코드 리뷰 체크리스트화.
2. **생리를 요인 선택지로 노출**: 명세 위반. cycleLogs는 사실 기록만, cycleLoad는 엔진 계산.
3. **단정 문구**: "수면 부족 때문입니다" 류. → 항상 "함께 나타나는 경향/가능성". `assertGuard`로 자동 차단.
4. **괄호 문구 하드코딩**: "오늘 다 진심임" 고정. → `buildSubLabel` 동적.
5. **점수 정규화 누락/이중 정규화**: 가중합을 0~100으로 안 맞추거나 두 번 맞춤. → `normalize` 한 곳에서, 각 공식의 이론적 max를 문서화.
6. **데이터 부족인데 패턴 단정**: supportCount 적은데 공범/요인 카드 노출. → 최소 표본 임계(예: n≥5)와 null 반환 규칙.
7. **시간창 누수(데이터 리키지)**: "다음날 효과" 계산 시 미래 데이터를 당일 점수에 섞음. → 시간창별로 입력 날짜 범위 엄격 분리.
8. **주기 강제 적용**: 모든 사용자에게 주기 영향 크게 표기. → `cycleStrengthForUser`로 약하면 "강하지 않음".
9. **수면 입력 필드 미정의**: sleepLoad가 명세상 수면시간/질/각성/악몽을 요구하나 dailyLogs에 직접 필드가 없음. → **1단계 전 입력 스키마 확정 필요(아래 열린 질문)**.
10. **dailyScores 중복 행**: 하루 여러 번 기록 시 점수 행 중복. → date 유니크 + upsert.
11. **로컬 저장 유실**: IndexedDB는 브라우저가 비울 수 있음. → 내보내기(JSON 백업) 기능을 초기에 넣고 안내.
12. **타임존/날짜 경계**: 자정 전후 기록이 다른 날로. → 로컬 자정 기준 `ISODate` 통일, 유틸 한 곳.
13. **엔진에 React/DB 결합**: 계산 함수가 store나 Dexie를 직접 호출 → 테스트 불가. 순수 함수 유지.
14. **캘린더 아이콘 남발**: 명세 위반. 색+짧은 라벨만.
15. **모드 표준 라벨 vs 표시 별칭 혼동**: "식욕폭발" 같은 표기를 dayType 키로 사용. → 키는 표준(`appetite_swing`), 표시는 별칭 매핑.

### 1단계 전에 확정이 필요한 열린 질문 (블로커 후보)
- **수면 입력 스키마**: 수면시간/질/각성/악몽을 (a) DailyLog 필드 추가로 받을지 (b) eventLog 코드로 받을지. → 권장: 시간/질은 DailyLog 확장, 늦게잠/자주깸/악몽은 eventLog 코드. 1단계 답변 요청.
- **강도 입력 UI**: dailyLogs의 0~10 강도를 슬라이더로 받을지, 칩(없음/조금/많이)을 3~5단계 점수로 매핑할지. → 시안은 칩 중심이라 칩→점수 매핑 권장.

---

## 9. 다음 단계(1단계)에 줄 프롬프트 초안

> 아래는 사용자가 "1단계 시작" 시 그대로 쓰거나 다듬어 쓸 초안.

```
1단계 시작.

목표: MODE의 프로젝트 부트스트랩과 디자인 시스템 구축. 기능 로직·DB·엔진은 아직 만들지 않는다.
정적이지만 시안과 똑같이 보이는 5탭 셸까지가 이번 범위다.

스택: Vite + React + TypeScript, Zustand, Dexie(이번 단계엔 설치만), date-fns, vite-plugin-pwa(이번 단계엔 매니페스트 골격만).

할 일:
1. Vite+React+TS 프로젝트 초기화. eslint/prettier, 폴더 구조는 0단계 계획서(docs/PHASE-0-PLAN.md)의 구조를 따른다.
2. mode-design-concept.html의 :root 토큰을 src/design/tokens.css로, 배경 그라데이션/폰트를 global.css로 추출.
3. 공통 컴포넌트 포팅:
   - Mochi (얼굴 7종: happy/teary/sleepy/hungry/focus/confused 포함, gradient/size/delay prop)
   - Card (glass 변형 g-lav/g-mint/g-yellow), Chip(on 토글), TabBar(5탭+SVG 아이콘+활성)
4. 5탭 라우팅 셸(오늘/기록/캘린더/분석/예보) + 설정 진입. 각 화면은 시안 레이아웃을 흉내낸 정적 더미.
5. 오늘 화면을 시안 02처럼: ModeCard(괄호 라벨은 일단 정적 더미여도 됨, 단 "동적 예정" 주석), SuspectList, DayPlan, 회복추천 자리.
6. reduced-motion 대응, 모바일 폭(390px 프레임 불필요—실제 화면 채움) 반응형.

하지 마라:
- "이유 같았던 건?" / "생리·주기" 원인 칩 절대 포팅 금지.
- DB 읽기/쓰기, 점수 계산, 주기 계산, 분석 로직 금지(다음 단계).
- 단정 문구 금지.

완료 기준: 5탭 이동, 모찌 7종 렌더, 시안 색/카드/배경 일치, reduced-motion 동작.
먼저 수면 입력 스키마와 강도 입력 UI(슬라이더 vs 칩→점수) 두 가지 열린 질문에 대한 내 결정을 물어보고 시작해라.
```

---

*0단계 종료. "1단계 시작" 신호 전까지 구현하지 않음.*
