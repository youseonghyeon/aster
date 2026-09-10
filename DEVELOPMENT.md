# Aster 개발 안내

[← Aster 소개와 설치](README.md)

## 개발 환경

Aster는 Tauri 2, React 19, TypeScript와 Rust로 만들어졌습니다.

### 준비 사항

- Node.js
- pnpm
- Rust toolchain
- 운영체제별 Tauri 빌드 의존성

자세한 준비 과정은 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)에서 확인할 수 있습니다.

### 실행

```bash
pnpm install
pnpm tauri dev
```

`pnpm tauri dev`는 **Aster Dev** (`com.yuseonghyeon.aster.dev`)로 실행합니다.
테스트 번들은 **Aster Preview** (`com.yuseonghyeon.aster.preview`), 정식 배포는
**Aster** (`com.yuseonghyeon.aster`)로 고정합니다. 역할별 데이터는 분리되며,
충돌 시 이름이나 식별자를 바꾸지 않고 점유 프로세스·포트 등의 원인을 해결합니다.
개발 시 `pnpm exec tauri`로 실행 설정을 우회하지 않습니다.

브라우저에서 프런트엔드만 확인하려면 다음 명령을 사용합니다.

```bash
pnpm dev
```

### 빌드

```bash
# 프런트엔드 검사와 빌드
pnpm build

# 테스트용 Aster Preview (.app만, DMG 없음)
pnpm build:preview

# 정식 Aster 배포 번들 생성
pnpm tauri build
```

## 로드맵과 읽기 위치 설계

Aster는 읽기 경험을 흐리지 않는 범위에서 다음 기능을 확장할 예정입니다.

- [x] 현재 위치를 강조하는 문서 목차
- [x] 마크다운·메모·미리보기 개별 검색
- [x] 마크다운·메모 영역을 숨기는 미리보기 집중 모드
- [x] 최근 문서와 목차를 전환할 수 있는 사이드바
- [x] 선택한 폴더를 탐색하는 파일 사이드바
- [x] 상대 경로 문서 링크와 뒤로·앞으로 이동
- [x] Mermaid 다이어그램 미리보기
- [ ] 문장에 연결하는 개인 메모
- [x] 외부 파일 변경 감지
- [x] 선택 가능한 입력·미리보기 스크롤 동기화
- [x] 읽기 설정을 바꿔도 현재 보고 있던 본문 위치 유지
- [x] 목차 이동 시 선택한 제목을 화면 상단의 읽기 좋은 위치에 배치

### 읽기 위치 설계 기준

화면에서 편안한 시선 위치를 하나의 고정 비율로 단정하지 않는다. [OSHA의 모니터 배치 지침](https://www.osha.gov/etools/computer-workstations/components/monitors)은 모니터 중앙을 수평 시선보다 15~20도 아래에 두도록 권하지만, 이는 물리적인 모니터 배치 기준이므로 콘텐츠의 세로 좌표로 그대로 환산할 수 없다. 장문 화면 읽기를 조사한 [CHI 2010 연구](https://doi.org/10.1145/1753846.1753976)에서도 선호하는 읽기 영역의 위치와 크기가 사용자마다 다르게 나타났다. 따라서 창의 가로·세로 비율이 아니라 실제 미리보기 스크롤 영역의 높이를 기준으로 적응시키고, 극단적으로 짧거나 긴 창에서는 픽셀 상·하한을 적용한다.

#### 설정 변경 중 읽던 위치 유지

- 글꼴, 글자 크기, 줄 간격, 확대, 테마와 다이어그램 선 변경 직전에 현재 보이는 본문 블록의 원문 위치, 블록 내부 진행률과 화면상 세로 위치를 함께 기록한다.
- 레이아웃과 지연 렌더링이 안정된 뒤 같은 원문 위치를 같은 화면 높이로 복원한다. 해당 블록을 찾을 수 없으면 정규화된 문서 진행률, 기존 `scrollTop` 순으로 안전하게 대체한다.
- 기존 `data-source-offset` 기반 미리보기 앵커를 공통 복원 경로로 확장한다. 이는 레이아웃 변경 중 사용자가 보던 지점을 고정한다는 [W3C Scroll Anchoring의 목적](https://www.w3.org/TR/css-scroll-anchoring/)과, 자동 스크롤을 문맥 유지에 필요한 만큼만 수행하라는 [Apple Scroll View 지침](https://developer.apple.com/design/human-interface-guidelines/scroll-views)에 맞춘다.
- 스크롤 동기화가 켜진 경우 복원 중 상호 피드백을 잠시 막고 새 레이아웃의 동기화 지도를 다시 계산한다. 검색 선택, 포커스와 사용자가 직접 시작한 스크롤은 덮어쓰지 않는다.
- 완료 기준은 레이아웃 안정 후 같은 의미 블록이 계속 보이고 기준점의 이동이 렌더링된 본문 한 줄 이내인 것이다. 문서 시작·끝에서는 유효 스크롤 범위 안에서만 복원한다.

#### 목차 이동의 읽기 기준선

- 기준선은 `clamp(72px, 미리보기 높이의 20%, 180px)`로 계산한다. 보통 창에서는 상단 1/5 지점에 두고, 아주 짧은 창에서는 최소 여백을, 세로로 긴 창에서는 과도하게 아래로 내려가지 않도록 최대 여백을 적용한다.
- 선택한 제목이 이미 기준선에서 본문 한 줄 정도인 24px 안에 있으면 불필요하게 움직이지 않는다. 그 밖에는 위 기준선으로 이동하되 문서 시작·끝에서는 가능한 범위까지만 움직인다.
- 현재 목차를 판정하는 기준선과 클릭 후 도착 기준선을 같은 계산으로 통일해, 이동 직후 이전 제목이 활성 상태로 남지 않게 한다. 키보드 포커스의 `preventScroll`과 모션 감소 설정은 유지한다.
- 가로 폭은 기준 비율에 직접 사용하지 않고 줄바꿈으로 생긴 실제 레이아웃 변화에만 반영한다. 검증은 최소 창 `800×600`, 기본 창 `1200×800`, 세로형 `900×1200`, 가로형 `1600×700`과 전체화면에서 수행한다.
- 문서의 시작·중간·끝, 긴 문단, 표, 코드, 이미지와 Mermaid 전후의 제목을 대상으로 실제 창 크기별 동작을 확인한다.

## 제품 원칙

새로운 기능은 다음 기준을 만족해야 합니다.

1. 긴 문서를 더 편하게 읽게 하는가?
2. 원문을 건드리지 않고 사용자의 생각을 보존하는가?
3. 기존 화면을 복잡하게 만들지 않는가?
4. 사용하지 않을 때 읽는 화면에서 물러나 있는가?
5. 본문 너비, 행간과 스크롤의 안정성을 해치지 않는가?

Aster는 기능의 수보다 읽는 경험의 완성도를 우선합니다.

## 앱 내 업데이트 배포

정식 Aster는 새 버전 안내에서 다운로드한 뒤 사용자가 `설치하고 재시작`을 선택할 수 있습니다.
메모와 복구 초안 저장이 실패하면 설치하지 않습니다. Dev와 Preview는 정식 업데이트를 설치하지 않습니다.
기능 도입 전 버전에서는 이 기능이 포함된 첫 버전까지 한 번 수동 설치가 필요합니다.

배포 빌드에는 업데이트 서명 키를 `TAURI_SIGNING_PRIVATE_KEY`로 전달합니다. 필요한 경우
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`도 지정합니다. 개인 키는 Git에 저장하지 않습니다.
Windows 수동 빌드 workflow에는 동일한 이름의 GitHub Actions secrets를 등록해야 합니다.
일반 macOS Developer ID 서명·Apple 공증과 업데이트 서명은 각각 수행해야 합니다.

- macOS는 Universal 빌드의 `Aster.app.tar.gz`와 `.sig`, Windows는 설치 `.exe`와 `.sig`를 준비합니다.
- macOS 앱을 공증·staple한 뒤 아래 전용 명령으로 업데이트 파일을 다시 만들고 최종 압축 파일에 업데이트 서명합니다. 기본 macOS tar의 `._` 메타데이터가 들어가면 설치기의 압축 해제가 실패하므로 일반 압축 명령으로 대체하지 않습니다.

```bash
node scripts/package-macos-updater.mjs PATH/Aster.app ARTIFACT_DIRECTORY/Aster.app.tar.gz
pnpm tauri signer sign --private-key-path KEY_PATH ARTIFACT_DIRECTORY/Aster.app.tar.gz
```
- 최종 파일을 한 디렉토리에 모으고 아래 명령으로 플랫폼별 다운로드 정보를 생성합니다.

```bash
node scripts/updater-manifest.mjs VERSION ARTIFACT_DIRECTORY Aster.app.tar.gz Aster_VERSION_x64-setup.exe
node --test scripts/updater-manifest.check.mjs
```

`latest.json`, 두 업데이트 파일과 각 `.sig`를 **같은 버전의 draft 릴리스**에 먼저 올리고 검증한 뒤 공개합니다.
macOS Universal 파일을 두 아키텍처에 연결하므로 단일 아키텍처 빌드로 대체하지 않습니다.
최초 업데이트 배포 전에 실제 이전 버전에서 설치·재시작·메모 및 읽기 위치 복원을 확인합니다.
