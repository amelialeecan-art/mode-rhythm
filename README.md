# MODE

오늘의 나를 읽고, 내일의 모드를 설계하는 개인 리듬 분석 앱.

사용자는 **사실만 기록**하고, 앱이 패턴을 분석한다. 원인은 단정하지 않고 **요인 후보와 신뢰도**로 보여준다. (의료 진단 앱 아님)

## 현재 단계: Phase 1 — 디자인 시스템 + 정적 화면 뼈대

이번 단계는 "앱의 껍데기와 디자인 시스템"만 단단히 만든 상태다. **모든 화면은 mock 데이터로 동작**하며, DB·점수 엔진·주기 계산·상관/회복/예보 로직은 아직 없다.

- 계획서: [`docs/PHASE-0-PLAN.md`](docs/PHASE-0-PLAN.md)
- 스택: React + TypeScript + Vite (PWA 지향), 로컬 우선 저장 예정(IndexedDB, 후속 단계)

## 실행

```bash
npm install
npm run dev        # 개발 서버
npm run build      # 타입체크 + 프로덕션 빌드
npm run preview    # 빌드 결과 미리보기
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```

## 구조

```
src/
  app/        라우팅 (5탭 + 온보딩/설정)
  design/     디자인 시스템 (tokens / components / mascot / charts)
  screens/    화면 (Today/Log/Calendar/Analysis/Forecast/Onboarding/Settings)
  data/       types + catalog 상수 (DB는 아직 없음 — 2단계)
  engine/     분석 엔진 (placeholder — 후속 단계)
  store/      상태관리 (placeholder — 후속 단계)
  copy/       문구 톤 헬퍼 (단정 금지 가드)
  lib/        유틸
```

## 핵심 규칙 (불변)

- 사용자는 원인을 추측하지 않는다 → "오늘 있었던 일"(사건/상황)만 기록
- 생리/주기는 사실만 기록, 구간은 앱이 자동 계산 (원인 칩 아님)
- 단정 금지 → "가능성 / 함께 나타나는 경향 / 신뢰도 / 데이터 부족"
