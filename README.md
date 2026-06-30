# MODE

오늘의 나를 읽고, 매일의 리듬을 기록·분석하는 개인 리듬 앱.

사용자는 **사실만 기록**하고, 앱이 패턴을 분석한다. 원인은 단정하지 않고 **요인 후보·신뢰도·경향**으로 보여준다.

> ⚠️ MODE는 **의료 진단 앱이 아니다.** 우울증·불안장애·PMS 등을 진단하지 않으며, 원인을 단정하지 않는다. 모든 해석은 "가능성 / 함께 나타나는 경향 / 신뢰도 / 데이터 부족" 중심이다.

## 5탭 구조

| 탭 | 역할 |
|---|---|
| **오늘** | 오늘의 모드·요인 후보·리듬 부하·4줄 설계·회복 추천 |
| **기록** | 오늘 상태 / 오늘 있었던 일 / 생리 기록 / 회복 행동 입력 (사실만) |
| **리듬** | 최근 30일 실제 기록 기반 다중 선그래프 + 주기 오버레이 |
| **캘린더** | 월간 히트맵 지도 + 날짜별 기록 상세 |
| **분석** | 반복 패턴·요인 효과·공범 구조·미제 사건·회복 효과 후보 |

## 핵심 규칙 (불변)

- 사용자는 원인을 추측하지 않는다 → "오늘 있었던 일"(사건/상황)만 기록
- 생리/주기는 **사실만 기록**하고, 구간(생리 중/월경 전/배란 추정)은 앱이 날짜로 자동 계산 (원인 칩 아님)
- 단정 금지 → "원인입니다/때문입니다/확실/반드시/치료/진단" 사용 안 함
- **로컬 우선**: 모든 기록은 이 기기(IndexedDB)에 저장. 계정·클라우드·서버 동기화 없음

## 저장 / 프라이버시

- **로컬 우선 (IndexedDB / Dexie)** — 기록은 기기에만 저장되고 서버로 보내지 않는다.
- 설정 → 데이터에서 **JSON 내보내기**(기기에 파일 저장)와 **로컬 데이터 초기화**(확인 후, 되돌릴 수 없음) 가능.

## 설치 / 실행

```bash
npm install
npm run dev        # 개발 서버
npm run build      # 타입체크 + 프로덕션 빌드 (PWA 포함)
npm run preview    # 빌드 결과 미리보기
npm run test       # Vitest 단위 테스트
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## PWA

- `vite-plugin-pwa`로 설치형 PWA를 구성한다. `npm run build` 시 `manifest.webmanifest` + 서비스워커(`sw.js`)가 생성된다.
- manifest: name/short_name `MODE`, `display: standalone`, `orientation: portrait`, theme `#A985E8`, background `#EBE3FA`.
- 아이콘은 `public/icons/icon.svg` · `public/icons/maskable.svg` (모찌 캐릭터 기반 **placeholder SVG**). 추후 PNG(192/512)로 교체 가능.
- 서비스워커는 **앱 셸만 프리캐시**한다. 개인 기록(IndexedDB)은 캐시 대상이 아니며 로컬에 남는다. 개발 중 캐시 꼬임 방지를 위해 dev에서는 SW를 켜지 않는다.

## 구조

```
src/
  app/        라우팅 (5탭 + 온보딩/설정, 첫 실행 온보딩 게이트)
  design/     디자인 시스템 (tokens / components / mascot / charts)
  screens/    화면 (Today/Log/Rhythm/Calendar/Analysis/Onboarding/Settings)
  data/       Dexie 저장 계층 (models / repositories / services / catalog)
  engine/     순수 함수 분석 엔진 (scoring/cycle/classify/correlation/patterns/recovery/...)
  copy/       문구 톤 헬퍼 (단정 금지 가드)
  lib/        날짜·온보딩 유틸
```

엔진(`engine/`)은 React·Dexie·repository를 모르는 **순수 함수**다. 서비스 계층이 repository에서 데이터를 모아 엔진에 넣는다.

## 개발 단계 요약

1. 부트스트랩 + 디자인 시스템 + 정적 화면
2. 로컬 저장 계층 (Dexie 7테이블 + repositories + seed/reset)
3. 기록 화면 실제 저장 연결
4. 점수 엔진 + 생리주기 context + 모드 분류 + Today 실연결
5. 캘린더 실제 dailyScores 연결
6. 상관/패턴 분석 + Analysis 실연결
7. 회복 행동 효과 분석 + recoveryScore
8. Forecast 탭 제거 → **리듬**(기록 기반 선그래프) 탭으로 대체
9. PWA / 온보딩 / 설정 실연결 / 데이터 관리 / 마감 1차

## 아직 후순위인 기능

- **예측 / 내일 예보** (현재 보류 — 리듬은 "기록 기반 흐름"이지 예측이 아님)
- 클라우드 동기화 / 계정
- 기록 알림(푸시) — 설정값만 저장, 권한 요청 미구현
- 데이터 **가져오기**(JSON) — 내보내기만 구현됨
