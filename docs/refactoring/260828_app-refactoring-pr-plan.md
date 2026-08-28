# Aster 앱 리팩터링 PR 계획

- 상태: Implemented — 6개 로컬 커밋 완료, 실제 화면 자동 조작 검증만 환경 문제로 보류
- 작성일: 2026-08-28
- 기준 커밋: `4a632f7`
- 실행 방식: GitHub 연결을 사용하지 않고 PR 단위마다 로컬 커밋 1개로 대체

## 1. 배경과 목적

이번 리팩터링의 목적은 파일 크기를 줄이는 것 자체가 아니다. 기능이 추가될 때 사이드바, 검색, 포커스, 집중 모드와 반응형 상태의 조합이 반복해서 깨졌으므로 다음 변경에서 같은 문제가 재발하지 않도록 제어하는 것이 목적이다.

진행 원칙은 다음과 같다.

1. 반복된 문제를 자동 테스트로 먼저 고정한다.
2. 여러 위치에서 직접 변경되는 상태를 명시적인 전이 경계로 모은다.
3. DOM·Tauri·localStorage 의존성을 분리해 정상·경계·오류를 각각 테스트할 수 있게 한다.
4. 각 단계는 독립적으로 빌드와 테스트를 통과하며, 다음 단계 없이도 되돌릴 수 있는 커밋으로 만든다.
5. 제품 동작과 시각 디자인은 바꾸지 않는다.

## 2. 현재 구조와 반복 문제

### 정량적 상태

- `src/App.tsx`: 3,363줄
- `src/App.css`: 2,004줄
- `App` 내부 `useState`: 30개
- `App` 내부 `useRef`: 36개
- `App` 내부 `useEffect`: 14개
- `App` 내부 함수: 49개
- 사이드바·설정·검색·집중 모드·메모 상태를 변경하는 위치: 42곳

### 반복 회귀 이력

- `947869a`: 넓은 화면에서 목차와 읽기 설정 공존을 복구
- `6e17e18`: 최근 문서 사이드바 일반화 과정에서 기존 목차 공존 정책 회귀
- `d8c96fc`: inset 사이드바와 설정 공존 재복구
- `cde40a3`: 메모·검색·집중 모드에서 목차 유지, Escape 순서, 검색 선택·스크롤 복원 재복구
- `e72f8ff`: 패널 드래그 중 전체 레이아웃을 계속 다시 계산하던 성능 문제 수정

문제의 공통 원인은 하나의 사용자 동작이 여러 `useState`, ref, effect와 DOM 후처리를 동시에 바꾸는데 그 조합을 검증하는 자동 테스트가 없다는 점이다.

## 3. 보존해야 할 제품 계약

- `.md`, `.markdown` UTF-8 파일만 열고 10MB를 초과한 파일은 거부한다.
- 메모는 원본을 수정하지 않고 문서 경로별 localStorage에 저장한다.
- 기존 localStorage 키와 저장 형식을 변경하지 않는다.
- 패널 위치 교환 시 사용자가 정한 너비 비율도 함께 교환한다.
- 1280px 이상에서는 열린 목차를 집중 모드, Markdown/메모 전환과 검색 중 유지한다.
- 1280px 미만에서는 사이드바를 모달로 취급하고 작업 공간 조작 전 닫는다.
- 집중 모드로 가려지는 Markdown·메모 검색은 선택·스크롤을 복원하며 닫고 미리보기 검색은 유지한다.
- 넓은 화면에서는 목차 또는 최근 문서를 먼저 연 뒤 읽기 설정을 열고 닫아도 사이드바를 유지한다.
- 작은 화면에서는 사이드바와 읽기 설정을 동시에 열지 않는다.
- `Escape`는 현재 포커스와 보이는 계층을 기준으로 검색, 집중 모드, 사이드바 순서를 지킨다.
- UI의 한글, 테마, 창 크기, 키보드 포커스와 닫기 동작을 유지한다.

## 4. 제외 범위

- 새 기능 추가
- 시각 디자인 개편
- React 상태관리 라이브러리 도입
- localStorage 데이터 마이그레이션
- Markdown 렌더러 또는 Tauri 프레임워크 교체
- 기존 공개 동작의 단순화 또는 삭제
- GitHub push와 실제 PR 생성

## 5. 목표 구조

```text
App
├── document session
│   ├── markdown file gateway
│   ├── open / switch / reload
│   ├── external file status
│   └── note / recent persistence
├── workspace interactions
│   ├── sidebar / settings / panel menu
│   ├── source mode / preview focus
│   └── responsive transition policy
├── workspace search
│   ├── sessions
│   ├── selection / scroll snapshots
│   └── focus restoration
├── pane split controller
└── view components
    ├── AppHeader
    ├── ReadingSettings
    ├── DocumentStage
    ├── WorkspacePane
    └── PaneDivider
```

컨트롤러는 독립적인 의존성 범위를 가지며, 드래그 좌표처럼 렌더링에 필요 없는 고빈도 값은 ref에 유지한다. 하나의 거대한 Context로 모든 상태를 다시 묶지 않는다.

## 6. 커밋 계획

### Commit 1 — `test(frontend): establish regression coverage`

#### 목표

제품 코드를 분리하기 전에 현재 동작과 반복 회귀를 실행 가능한 테스트로 고정한다.

#### 변경

- Vitest, jsdom, React Testing Library, user-event 추가
- `pnpm test`, `pnpm test:watch` 명령 추가
- `matchMedia`, `ResizeObserver`, `requestAnimationFrame`, Worker, CSS Highlights와 Tauri API 테스트 대역 구성
- 기존 순수 로직과 핵심 화면 상호작용 특성화 테스트 작성

#### 테스트

- 1440px에서 목차와 읽기 설정 공존
- 1200px에서 사이드바와 설정 상호 배타
- 목차를 유지한 메모·검색·집중 모드 전환
- `Escape`의 검색 → 집중 모드 → 목차 순서
- 최근 문서 정규화, 중복 제거, 최대 10개와 저장 실패
- 텍스트 검색의 literal, case, regex, Unicode, zero-length, truncation, index 순환
- Markdown 목차 ID와 계층 생성

#### 완료 기준

- 제품 동작 변경 없음
- 신규 테스트와 `pnpm build` 통과
- 반복 회귀마다 이를 직접 설명하는 테스트 이름 존재

### Commit 2 — `refactor(workspace): centralize interaction transitions`

#### 목표

사이드바·설정·패널 메뉴·메모·집중 모드·반응형 상태의 전이를 한 곳에서 결정한다.

#### 변경

- `workspace-interactions` 순수 reducer 또는 동등한 전이 모듈 추가
- 여러 handler와 effect에 흩어진 직접 상태 변경을 의미 있는 action으로 교체
- 현재 상태를 callback에서 안전하게 읽는 단일 최신 상태 ref 제공
- 외부 상태관리 의존성은 추가하지 않음

#### 테스트

- inset/modal × outline/recent × settings 조합
- note/search/focus 작업 시작 시 outline과 recent의 서로 다른 유지 정책
- 1279px ↔ 1280px 전환
- settings/panel menu/sidebar 상호 배타와 공존 정책
- 포커스 위치에 따른 Escape 처리 소유권

#### 완료 기준

- 상태 정책 테스트가 DOM 없이 결정적으로 실행됨
- 기존 화면 특성화 테스트 유지
- UI·저장 형식 변경 없음

### Commit 3 — `refactor(search): isolate search focus restoration`

#### 목표

검색 session과 DOM snapshot·포커스 복원 책임을 `App`에서 분리한다.

#### 변경

- 검색 session 업데이트, open/close, 현재 영역 추적을 전용 hook으로 이동
- textarea selection과 가로·세로 스크롤 snapshot을 별도 모듈로 이동
- preview의 코드 블록·표 중첩 스크롤 복원 유지
- `Pane`을 별도 컴포넌트로 이동하고 검색 컨트롤러의 명시적인 API만 전달

#### 테스트

- 검색 전 selection과 `scrollTop`/`scrollLeft` 복원
- 검색어·대소문자·정규식 옵션 보존
- 집중 모드 진입 시 source 검색 종료와 지연 복원
- 미리보기 검색 유지
- hidden pane 재등장 시 복원
- 검색 trigger/content/external element별 포커스 반환

#### 완료 기준

- 검색과 포커스 복원 테스트 통과
- 검색 UI와 키보드 동작 변화 없음
- `App`이 검색 DOM 세부 구현을 직접 소유하지 않음

### Commit 4 — `refactor(documents): isolate document session lifecycle`

#### 목표

Tauri IPC, 문서 열기·전환·재로딩, 외부 파일 감시, 메모·최근 문서 보존을 테스트 가능한 경계로 분리한다.

#### 변경

- Markdown file gateway로 Tauri `invoke`와 dialog 호출 격리
- document session hook으로 open/switch/reload 경쟁 제어 이동
- 외부 파일 polling을 별도 hook으로 이동
- note/recent persistence는 기존 키와 형식을 유지한 adapter로 분리

#### 테스트

- 수정된 Markdown의 전환·재로딩 확인과 취소
- 확인 이후 새 편집이 생기면 오래된 비동기 결과 무시
- 동시에 open/reload 실행 방지
- 메모 저장 실패 시 문서 전환 중단
- 외부 수정·삭제·복구와 연속 unavailable 관찰
- 최근 문서 alias 제거와 persistence 제한 상태
- Tauri 오류에서도 현재 내용 보존

#### 완료 기준

- 기존 Rust 파일 검증 테스트 포함 전체 검증 통과
- 브라우저와 Tauri 경계가 명시적임
- 문서 데이터와 localStorage 형식 변화 없음

### Commit 5 — `refactor(layout): isolate pane resize controller`

#### 목표

패널 너비 계산, 드래그 lifecycle과 DOM 반영을 독립된 컨트롤러로 옮겨 성능 회귀를 방지한다.

#### 변경

- split 비율 clamp와 pointer 계산을 순수 함수로 이동
- pointer capture, animation frame, 취소와 commit 동작을 전용 hook으로 이동
- 렌더링에 필요 없는 드래그 중간값은 ref 유지

#### 테스트

- 최소 240px 폭과 stacked 50:50
- 2px 미만 이동 무시
- drag 종료 시에만 pane 폭 commit
- cancel/lost capture/blur/visibility/resize/focus mode 처리
- 키보드 2%, Shift 10%, Home/End
- pane swap 시 요청 비율 반전

#### 완료 기준

- 드래그 중 pane 전체 재배치가 발생하지 않음
- 포인터와 키보드 동작 유지
- 관련 단위·화면 테스트 통과

### Commit 6 — `refactor(ui): decompose app shell and styles`

#### 목표

컨트롤러 분리가 끝난 뒤 `App`을 조합 책임만 갖도록 정리하고 스타일 소유권을 맞춘다.

#### 변경

- `AppHeader`, `ReadingSettings`, `DocumentStage`, `WorkspacePane`, `PaneDivider` 분리
- 전역 테마 token과 컴포넌트 스타일 분리
- 정적 Markdown renderer와 icon을 적절한 모듈로 이동
- 불필요한 prop 재생성을 피하되 검증 없는 `memo` 남용은 하지 않음

#### 테스트와 실제 화면 검증

- 800px, 1200px, 1440px
- 밝게, 세피아, 야간
- 한글 장문, 표, 코드 블록
- 마우스와 키보드
- 목차·최근 문서·검색·설정·집중 모드 조합
- 브라우저 console 오류 없음

#### 완료 기준

- `App`은 각 컨트롤러 연결과 화면 조합만 담당

## 7. 실행 결과

계획한 6개 단위는 다음 로컬 커밋으로 구현했다.

1. `c00354f` — 회귀 테스트 기반
2. `195eda8` — 작업 공간 상태 전이
3. `623f8d5` — 검색과 포커스 복원
4. `c78b49d` — 문서 파일·메모·외부 상태 경계
5. `dbac747` — 패널 분할 컨트롤러
6. `2b68dc5` — 화면 컴포넌트와 전역 기반 스타일 분리

최종 자동 검증은 프런트엔드 11개 파일 45개 테스트, TypeScript/Vite 빌드, Rust fmt·clippy와 Rust 3개 테스트가 통과했다. `App.tsx`는 계획 시점 3,363줄에서 1,545줄로 줄었고, 반복 회귀의 핵심인 사이드바 전이, Escape 계층, 문서 전환 취소·오류·중복 실행, 검색 snapshot, 외부 파일 관찰과 패널 비율 정책을 자동 테스트로 고정했다.

개발 산출물은 `Aster Dev` 이름과 `com.yuseonghyeon.aster.dev` 식별자로 빌드해 기존 `/Applications/Aster Dev.app`만 교체하고 실행했다. 다만 Python Playwright 부재, 인앱 브라우저 미연결, Computer Use 클라이언트 버전 불일치로 800/1200/1440px 및 대표 테마를 자동 조작하는 실제 화면 검증은 수행하지 못했다. 앱 제어 환경이 복구된 뒤 이 항목을 최종 확인한다.
- UI와 접근 가능한 이름·포커스 순서 변화 없음
- 전체 테스트, build, Rust 검사와 실제 화면 검증 통과

## 7. 공통 검증 게이트

각 커밋 전에 다음을 실행한다.

```bash
pnpm test -- --run
pnpm build
git diff --check
```

Rust를 변경하거나 최종 검증할 때는 다음을 추가한다.

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
```

UI 구조를 변경한 커밋은 실제 브라우저 또는 Tauri 화면 검증을 추가한다. 빌드 성공만으로 UI 완료를 주장하지 않는다.

## 8. 커밋과 중단 기준

- 각 커밋은 위 순서를 따른다.
- 커밋 사이에 push, fetch, 원격 권한 검사를 하지 않는다.
- 테스트를 통과시키기 위해 제품 계약을 변경하지 않는다.
- 숨겨진 제약 때문에 제품 동작이나 설계 방향을 바꿔야 하면 구현을 멈추고 사용자에게 영향과 대안을 보고한다.
- 테스트 한계로 보장할 수 없는 scroll/layout 동작은 실제 화면 검증 결과를 별도로 기록한다.

## 9. 현재 작업 상태

사용자 승인에 따라 Commit 1부터 순서대로 진행한다. 각 단계는 검증을 통과한 뒤 로컬 커밋으로 확정한다.
