# MODE

오늘의 나를 읽고, 매일의 리듬을 기록·분석하는 개인 리듬 앱.

사용자는 **사실만 기록**하고, 앱이 패턴을 분석한다. 원인은 단정하지 않고 **요인 후보·신뢰도·경향**으로 보여준다.

> ⚠️ MODE는 **의료 진단 앱이 아니다.** 우울증·불안장애·PMS 등을 진단하지 않으며, 원인을 단정하지 않는다. 모든 해석은 "가능성 / 함께 나타나는 경향 / 신뢰도 / 데이터 부족" 중심의 **기록 기반 패턴 해석**이다.

## 앱 목적

매일의 기분·식욕·수면·몸 상태·생리 주기·사건·회복 행동을 30초로 기록하면, 앱이 오늘의 모드를 읽고 반복 패턴을 찾아 보여준다. "원인을 맞히는 앱"이 아니라 **사실을 모아 흐름을 비춰주는 앱**이다.

## 5탭 구조

| 탭 | 역할 |
|---|---|
| **오늘** | 오늘의 모드·요인 후보·리듬 부하·4줄 설계·회복 추천·내일 참고 카드 |
| **기록** | 오늘 상태 / 오늘 있었던 일 / 생리 기록 / 회복 행동 입력 (사실만) |
| **리듬** | 최근 30일 실제 기록 기반 다중 선그래프 + 주기 오버레이 + 다음 3일 흐름 참고 |
| **캘린더** | 월간 히트맵 지도 + 날짜별 기록 상세 |
| **분석** | 반복 패턴·요인 효과·공범 구조·미제 사건·회복 효과 후보 |

### 가까운 리듬 참고

Today의 "내일 참고"와 Rhythm의 "다음 3일 흐름"은 **확정 예측이 아니라, 최근 기록과 주기 위치를 바탕으로 한 참고 카드**다. 별도 예보 탭은 없고, 그래프에 미래 점선도 그리지 않는다. 문구는 항상 "가능성이 있어요 / 확정은 아니에요"로 표현한다.

## 핵심 규칙 (불변)

- 사용자는 원인을 추측하지 않는다 → "오늘 있었던 일"(사건/상황)만 기록
- 생리/주기는 **사실만 기록**하고, 구간(생리 중/월경 전/배란 추정)은 앱이 날짜로 자동 계산 (원인 칩 아님)
- 단정 금지 → "원인입니다/때문입니다/확실/반드시/치료/진단/예측됩니다" 사용 안 함 (`copy/tone.ts` 가드 + 테스트로 강제)
- **로컬 우선**: 모든 기록은 이 기기(IndexedDB)에 저장. 계정·클라우드·서버 동기화 없음

## 저장 / 프라이버시

- **로컬 우선 (IndexedDB / Dexie)** — 기록은 기기에만 저장되고 서버로 보내지 않는다.
- 설정 → 데이터에서 **JSON 내보내기**(민감 데이터, 기기에 파일 저장)와 **로컬 데이터 초기화**(확인 모달 후, 되돌릴 수 없음, 초기화 후 기본 설정 재생성) 가능.

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

## 폰트

외부 CDN(Pretendard)에 의존하지 않는다. 시스템 산세리프 스택(`-apple-system`, `Apple SD Gothic Neo`, `Noto Sans KR`, `Segoe UI`, `system-ui` …)을 사용하므로 오프라인/설치형에서도 안정적으로 읽힌다. (Pretendard가 기기에 설치돼 있으면 자동으로 우선 사용된다.)

## PWA

- `vite-plugin-pwa`로 설치형 PWA를 구성한다. `npm run build` 시 `manifest.webmanifest` + 서비스워커(`sw.js`)가 생성된다.
- manifest: name/short_name `MODE`, `display: standalone`, `orientation: portrait`, theme `#A985E8`, background `#EBE3FA`.
- 아이콘은 `public/icons/icon.svg` · `public/icons/maskable.svg` (모찌 캐릭터 기반 **placeholder SVG**). 추후 PNG(192/512)로 교체 가능.
- 서비스워커는 **앱 셸만 프리캐시**한다. 개인 기록(IndexedDB)은 캐시 대상이 아니며 로컬에 남는다. 개발 중 캐시 꼬임 방지를 위해 dev에서는 SW를 켜지 않는다.
- **캐시 주의**: 새 버전이 바로 반영되지 않으면 앱 안의 업데이트 배너 또는 설정 → 앱 버전 → 업데이트 확인으로 갱신한다(브라우저 탭이라면 새로고침도 가능). 설치형 PWA를 삭제·재설치하는 방식은 기록(IndexedDB) 손실 위험이 있어 권장하지 않는다 — 아래 "업데이트" 안내를 따른다.

### 업데이트 (기존 설치본 유지 — 특히 iOS 홈 화면)

- 새 버전이 배포되면 앱 안에 **"새 버전이 있어요" 배너**가 뜬다. "지금 업데이트"를 누르면 기록(IndexedDB)은 그대로 두고 앱 셸만 교체된다.
- 배너가 안 보이면 **설정 → 앱 버전 → 업데이트 확인**을 누른다. 앱을 백그라운드에서 다시 열 때도 자동으로 새 버전을 확인한다.
- **iOS 홈 화면 앱은 삭제 후 재설치하지 말 것.** 홈 화면 앱을 삭제하면 그 앱의 기록(IndexedDB)까지 함께 삭제될 수 있다. 항상 기존 설치본 안에서 위 배너/업데이트 확인으로 업데이트한다. (재설치가 꼭 필요하면 먼저 설정 → 데이터 내보내기로 백업할 것)
- manifest에 고정 `id`(`/mode-rhythm/`)가 있어, 같은 주소의 새 배포는 새 앱이 아니라 기존 설치본의 업데이트로 인식된다.

## GitHub Pages 배포

이 앱은 GitHub Pages(프로젝트 페이지)에서 PWA로 사용할 수 있다. 저장소 이름이 `mode-rhythm`이라 빌드 시 base 경로가 `/mode-rhythm/`로 설정된다 (`vite.config.ts`). 사용자/조직 루트 페이지(`<user>.github.io`)로 배포하려면 `vite.config.ts`의 build base를 `/`로 바꾼다.

`.github/workflows/deploy.yml`이 main push 시 빌드→Pages 배포를 수행한다(클라이언트 라우팅 폴백용으로 `404.html`도 생성). SPA 라우터 basename은 Vite base와 자동 연동된다.

**활성화 방법 (저장소 소유자가 GitHub에서):**

1. 이 브랜치를 `main`에 병합한다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정한다.
3. main push가 일어나면 Actions가 빌드·배포한다. 배포 URL은 `https://<user>.github.io/mode-rhythm/`.

## 구조

```
src/
  app/        라우팅 (5탭 + 온보딩/설정, 첫 실행 온보딩 게이트, Pages base basename)
  design/     디자인 시스템 (tokens / components / mascot / charts)
  screens/    화면 (Today/Log/Rhythm/Calendar/Analysis/Onboarding/Settings)
  data/       Dexie 저장 계층 (models / repositories / services / catalog)
  engine/     순수 함수 분석 엔진 (scoring/cycle/classify/correlation/patterns/recovery/forecast)
  copy/       문구 톤 + 단정 금지 가드 (테스트로 강제)
  lib/        날짜·온보딩·tone 유틸
```

엔진(`engine/`)은 React·Dexie·repository를 모르는 **순수 함수**다. 서비스 계층이 repository에서 데이터를 모아 엔진에 넣는다. 가까운 리듬 참고(forecast)는 DB에 저장하지 않고 즉석 ViewModel로만 계산한다.

## 의료/단정 안내

- MODE는 **의료 진단 앱이 아니다.** 어떤 병명도 진단하지 않는다.
- 분석은 **원인 단정이 아니라 기록 기반 패턴 해석**이다. "함께 나타나는 경향 / 가능성 / 신뢰도"로만 표현한다.
- 말투(calm/witty/direct) 설정을 바꿔도 단정 표현은 생기지 않는다.

## 아직 후순위인 기능

- 데이터 **가져오기**(JSON import) — 내보내기만 구현됨
- 클라우드 동기화 / 계정 백업
- 기록 알림(푸시) — 설정값만 저장, 권한 요청 미구현
- 앱 아이콘 고도화 (현재 placeholder SVG)
- 더 정교한 리듬 참고/예보 (현재는 가벼운 규칙 기반 참고 카드)
