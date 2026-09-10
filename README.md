# Aster

읽기 좋은 Markdown을 위한 데스크톱 뷰어.

긴 문서를 편하게 읽고, 필요한 내용을 빠르게 찾고, 떠오른 생각을 메모하세요. 글꼴과 테마부터 화면 배치까지 나에게 맞는 읽기 환경을 만들 수 있습니다.

![Aster의 문서 목차, Markdown 편집기와 미리보기 개별 검색](assets/aster-overview.png)

## 설치

### Homebrew · macOS

```sh
brew install --cask youseonghyeon/aster/aster
```

### 직접 다운로드

[최신 버전 다운로드](https://github.com/youseonghyeon/aster/releases/latest)

| 운영체제 | 설치 파일 |
| --- | --- |
| macOS · Apple Silicon / Intel | Universal `.dmg` |
| Windows · x64 | `-setup.exe` |

macOS는 DMG를 열어 Aster를 Applications 폴더로 옮기고, Windows는 설치 파일을 실행하면 됩니다.

## 주요 기능

### 편안한 읽기 환경

다양한 테마와 글꼴, 본문 크기와 행간을 제공합니다. 미리보기만 넓게 보는 집중 모드로 긴 문서에도 몰입할 수 있습니다.

### 빠른 문서 탐색

파일 목록과 문서 목차로 원하는 곳을 찾아가세요. 본문 검색과 현재 읽고 있는 위치 표시가 문서 탐색을 도와줍니다.

### Markdown과 미리보기를 나란히

원문을 편집하면서 미리보기를 함께 확인할 수 있습니다. 패널의 위치와 너비를 조절하고 양쪽 스크롤을 동기화할 수 있습니다.

### 원문과 분리된 개인 메모

문서마다 메모를 남길 수 있습니다. 메모는 원본 파일을 변경하지 않으며 기기에 자동 저장됩니다.

### 풍부한 Markdown 표현

표, 체크 목록, 코드 구문 강조와 Mermaid 다이어그램을 지원합니다.

## 시작하기

Aster에서 Markdown 파일이나 문서가 있는 폴더를 열어보세요. `.md`, `.markdown` 파일을 지원합니다.

읽기 설정에서 편한 테마와 글꼴을 선택하면 다음 실행에도 유지됩니다. 마지막으로 읽던 문서와 화면 배치도 다시 이어집니다.

## 주요 단축키

| 기능 | macOS | Windows |
| --- | --- | --- |
| 파일 열기 | `⌘ O` | `Ctrl+O` |
| 저장 | `⌘ S` | `Ctrl+S` |
| 현재 영역 검색 | `⌘ F` | `Ctrl+F` |
| 메모 열기·닫기 | `⌘ ⇧ M` | `Ctrl+Shift+M` |
| 확대·축소 | `⌘ =` / `⌘ -` | `Ctrl+=` / `Ctrl+-` |
| 실제 크기 | `⌘ 0` | `Ctrl+0` |

## 개발

Tauri 2, React, TypeScript와 Rust로 만들었습니다. [Tauri 개발 환경](https://v2.tauri.app/start/prerequisites/)을 준비한 뒤 실행할 수 있습니다.

```sh
pnpm install
pnpm tauri dev
```

## 의견과 제안

불편한 점이나 필요한 기능이 있다면 [GitHub Issues](https://github.com/youseonghyeon/aster/issues)에 남겨주세요.

## 라이선스

[MIT License](LICENSE)
