import {
  memo,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

const initialMarkdown = `# 읽기 좋은 마크다운 뷰어

왼쪽에서 마크다운을 작성하면 오른쪽에서 **바로 확인**할 수 있습니다.

## 가독성을 위한 시작점

- 편안한 본문 너비와 넉넉한 줄 간격
- 제목과 본문이 명확하게 구분되는 크기
- 표, 체크리스트, 코드 블록을 지원하는 GitHub Flavored Markdown

> 좋은 문서는 내용뿐 아니라 읽는 경험도 중요합니다.

### 작업 목록

- [x] 좌우 분할 화면 만들기
- [x] 실시간 미리보기 연결하기
- [ ] 로컬 마크다운 파일 열기
- [x] 글꼴과 테마 설정 추가하기

| 요소 | 상태 |
| --- | --- |
| 실시간 미리보기 | 준비됨 |
| 표와 체크리스트 | 준비됨 |

~~~ts
const message: string = "Aster에서 편안하게 읽기";
console.log(message);
~~~
`;

const markdownPlugins = [remarkGfm];
const markdownComponents = {
  table: ({ node, ...tableProps }) => {
    void node;

    return (
      <div className="table-scroll" role="region" aria-label="표" tabIndex={0}>
        <table {...tableProps} />
      </div>
    );
  },
} satisfies Components;
const minimumPaneWidth = 240;
const dividerWidth = 9;
const themeStorageKey = "aster:theme:v1";
const fontStorageKey = "aster:reading-font:v1";
const lineSpacingStorageKey = "aster:line-spacing:v1";
const readingZoomStorageKey = "aster:reading-zoom:v1";

const themes = [
  { value: "snow", label: "밝게" },
  { value: "paper", label: "종이" },
  { value: "solarized", label: "Solarized" },
  { value: "sepia", label: "세피아" },
  { value: "nord", label: "Nord" },
  { value: "dracula", label: "Dracula" },
  { value: "gruvbox", label: "Gruvbox" },
  { value: "night", label: "야간" },
] as const;

const readingFonts = [
  { value: "pretendard", label: "Pretendard" },
  { value: "noto-sans", label: "Noto Sans KR" },
  { value: "noto-serif", label: "Noto Serif KR" },
  { value: "system", label: "시스템 고딕" },
] as const;

const lineSpacings = [
  { value: "compact", label: "촘촘 1.5" },
  { value: "balanced", label: "기본 1.7" },
  { value: "relaxed", label: "여유 1.9" },
  { value: "wide", label: "넓게 2.1" },
] as const;

const readingZoomLevels = [
  { value: "80" },
  { value: "90" },
  { value: "100" },
  { value: "110" },
  { value: "120" },
  { value: "130" },
  { value: "140" },
  { value: "150" },
] as const;

type Theme = (typeof themes)[number]["value"];
type ReadingFont = (typeof readingFonts)[number]["value"];
type LineSpacing = (typeof lineSpacings)[number]["value"];
type ReadingZoom = (typeof readingZoomLevels)[number]["value"];

type PaneKind = "editor" | "preview";
type PaneSide = "left" | "right";

const oppositePane: Record<PaneKind, PaneKind> = {
  editor: "preview",
  preview: "editor",
};

function SwapPaneIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 6h11m-3-3 3 3-3 3M15 12H4m3-3-3 3 3 3" />
    </svg>
  );
}

function ReadingSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 5h5m4 0h5M3 10h9m4 0h1M3 15h2m4 0h8" />
      <circle cx="10" cy="5" r="2" />
      <circle cx="14" cy="10" r="2" />
      <circle cx="7" cy="15" r="2" />
    </svg>
  );
}

function LineSpacingGlyph() {
  return (
    <span className="line-spacing-glyph" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function loadPreference<T extends string>(
  storageKey: string,
  options: readonly { value: T }[],
  fallback: T,
): T {
  try {
    const storedValue = localStorage.getItem(storageKey);
    const isKnownValue = options.some((option) => option.value === storedValue);

    return isKnownValue ? (storedValue as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePreference(storageKey: string, value: string) {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
}

function getSteppedReadingZoom(
  currentZoom: ReadingZoom,
  direction: -1 | 1,
): ReadingZoom {
  const currentIndex = readingZoomLevels.findIndex(
    (option) => option.value === currentZoom,
  );
  const nextIndex = Math.min(
    readingZoomLevels.length - 1,
    Math.max(0, currentIndex + direction),
  );

  return readingZoomLevels[nextIndex].value;
}

const MarkdownPreview = memo(function MarkdownPreview({
  content,
}: {
  content: string;
}) {
  return (
    <article className="markdown-body">
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});

function Pane({
  side,
  activePane,
  markdown,
  previewMarkdown,
  isPreviewUpdating,
  onMarkdownChange,
}: {
  side: PaneSide;
  activePane: PaneKind;
  markdown: string;
  previewMarkdown: string;
  isPreviewUpdating: boolean;
  onMarkdownChange: (value: string) => void;
}) {
  const isEditor = activePane === "editor";
  const paneLabel = side === "left" ? "왼쪽" : "오른쪽";
  const paneTitle = isEditor ? "마크다운" : "미리보기";

  return (
    <section
      id={`${side}-pane`}
      className={`pane ${isEditor ? "editor-pane" : "preview-pane"}`}
      aria-label={`${paneLabel} ${paneTitle} 패널`}
    >
      <div className="pane-header">
        <span className="pane-title">{paneTitle}</span>
      </div>

      {isEditor ? (
        <textarea
          id="markdown-editor"
          name="markdown"
          className="markdown-editor"
          value={markdown}
          onChange={(event) => onMarkdownChange(event.currentTarget.value)}
          aria-label="마크다운 입력"
          autoComplete="off"
          spellCheck="false"
        />
      ) : (
        <div
          className={`preview-scroll${isPreviewUpdating ? " is-updating" : ""}`}
          aria-busy={isPreviewUpdating}
        >
          <MarkdownPreview content={previewMarkdown} />
        </div>
      )}
    </section>
  );
}

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() =>
    loadPreference(themeStorageKey, themes, "paper"),
  );
  const [readingFont, setReadingFont] = useState<ReadingFont>(() =>
    loadPreference(fontStorageKey, readingFonts, "pretendard"),
  );
  const [lineSpacing, setLineSpacing] = useState<LineSpacing>(() =>
    loadPreference(lineSpacingStorageKey, lineSpacings, "balanced"),
  );
  const [readingZoom, setReadingZoom] = useState<ReadingZoom>(() =>
    loadPreference(readingZoomStorageKey, readingZoomLevels, "100"),
  );
  const workspaceRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const splitPercentRef = useRef(50);
  const deferredMarkdown = useDeferredValue(markdown);
  const isPreviewUpdating = markdown !== deferredMarkdown;
  const rightPane = oppositePane[leftPane];
  const readingZoomStyle = {
    "--reading-font-size": `${(17 * Number(readingZoom)) / 100}px`,
  } as CSSProperties;
  const isMinimumZoom = readingZoom === readingZoomLevels[0].value;
  const isMaximumZoom =
    readingZoom === readingZoomLevels[readingZoomLevels.length - 1].value;

  useEffect(() => {
    function handleReadingZoomShortcut(event: globalThis.KeyboardEvent) {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) {
        return;
      }

      let nextZoom: ((currentZoom: ReadingZoom) => ReadingZoom) | undefined;

      if (event.key === "+" || event.key === "=") {
        nextZoom = (currentZoom) => getSteppedReadingZoom(currentZoom, 1);
      } else if (event.key === "-" || event.key === "_") {
        nextZoom = (currentZoom) => getSteppedReadingZoom(currentZoom, -1);
      } else if (event.key === "0") {
        nextZoom = () => "100";
      }

      if (!nextZoom) {
        return;
      }

      event.preventDefault();
      setReadingZoom((currentZoom) => {
        const updatedZoom = nextZoom(currentZoom);

        savePreference(readingZoomStorageKey, updatedZoom);
        return updatedZoom;
      });
    }

    window.addEventListener("keydown", handleReadingZoomShortcut);
    return () => window.removeEventListener("keydown", handleReadingZoomShortcut);
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        setIsSettingsOpen(false);
      }
    }

    function handleSettingsKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsSettingsOpen(false);
      settingsButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    window.addEventListener("keydown", handleSettingsKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.removeEventListener("keydown", handleSettingsKeyDown);
    };
  }, [isSettingsOpen]);

  function updateSplit(nextPercent: number) {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const workspaceWidth = workspace.getBoundingClientRect().width;
    const minimumPercent = (minimumPaneWidth / workspaceWidth) * 100;
    const maximumPercent =
      ((workspaceWidth - dividerWidth - minimumPaneWidth) / workspaceWidth) * 100;
    const clampedPercent = Math.min(
      maximumPercent,
      Math.max(minimumPercent, nextPercent),
    );

    splitPercentRef.current = clampedPercent;
    workspace.style.setProperty("--left-pane-width", `${clampedPercent}%`);
    dividerRef.current?.setAttribute(
      "aria-valuenow",
      Math.round(clampedPercent).toString(),
    );
  }

  function updateSplitFromPointer(clientX: number) {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const bounds = workspace.getBoundingClientRect();
    updateSplit(((clientX - bounds.left) / bounds.width) * 100);
  }

  function handleDividerPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    workspaceRef.current?.classList.add("is-resizing");
    updateSplitFromPointer(event.clientX);
  }

  function handleDividerPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    updateSplitFromPointer(event.clientX);
  }

  function handleDividerPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    workspaceRef.current?.classList.remove("is-resizing");
  }

  function handleDividerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2;
    let nextPercent = splitPercentRef.current;

    switch (event.key) {
      case "ArrowLeft":
        nextPercent -= step;
        break;
      case "ArrowRight":
        nextPercent += step;
        break;
      case "Home":
        nextPercent = 0;
        break;
      case "End":
        nextPercent = 100;
        break;
      default:
        return;
    }

    event.preventDefault();
    updateSplit(nextPercent);
  }

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    savePreference(themeStorageKey, nextTheme);
  }

  function handleReadingFontChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextFont = event.currentTarget.value as ReadingFont;

    setReadingFont(nextFont);
    savePreference(fontStorageKey, nextFont);
  }

  function selectLineSpacing(nextSpacing: LineSpacing) {
    setLineSpacing(nextSpacing);
    savePreference(lineSpacingStorageKey, nextSpacing);
  }

  function adjustReadingZoom(direction: -1 | 1) {
    setReadingZoom((currentZoom) => {
      const nextZoom = getSteppedReadingZoom(currentZoom, direction);

      savePreference(readingZoomStorageKey, nextZoom);
      return nextZoom;
    });
  }

  return (
    <div
      className="app-shell"
      data-theme={theme}
      data-font={readingFont}
      data-line-spacing={lineSpacing}
      style={readingZoomStyle}
    >
      <header className="app-header">
        <div className="brand" aria-label="Aster 마크다운 뷰어">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span>Aster</span>
        </div>
        <span className="document-name">새 문서.md</span>
        <div className="header-actions">
          <span className="character-count">
            {markdown.length.toLocaleString("ko-KR")}자
          </span>
          <div className="zoom-control" role="group" aria-label="미리보기 배율">
            <button
              type="button"
              className="zoom-button"
              aria-label="미리보기 축소"
              title="미리보기 축소 (⌘/Ctrl -)"
              disabled={isMinimumZoom}
              onClick={() => adjustReadingZoom(-1)}
            >
              −
            </button>
            <output
              className="zoom-value"
              aria-label={`미리보기 배율 ${readingZoom}%`}
              aria-live="polite"
            >
              {readingZoom}%
            </output>
            <button
              type="button"
              className="zoom-button"
              aria-label="미리보기 확대"
              title="미리보기 확대 (⌘/Ctrl +)"
              disabled={isMaximumZoom}
              onClick={() => adjustReadingZoom(1)}
            >
              +
            </button>
          </div>
          <div ref={settingsRef} className="settings-menu">
            <button
              ref={settingsButtonRef}
              className="settings-trigger"
              type="button"
              aria-label="읽기 설정"
              aria-expanded={isSettingsOpen}
              aria-controls="reading-settings-popover"
              title="읽기 설정"
              onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
            >
              <ReadingSettingsIcon />
            </button>

            {isSettingsOpen ? (
              <div
                id="reading-settings-popover"
                className="settings-popover"
                role="dialog"
                aria-labelledby="reading-settings-title"
              >
                <div className="settings-popover-header">
                  <h2 id="reading-settings-title">읽기 설정</h2>
                  <span>미리보기 모양</span>
                </div>

                <div className="settings-group">
                  <span id="theme-setting-label" className="settings-label">
                    테마
                  </span>
                  <div
                    className="theme-options"
                    role="group"
                    aria-labelledby="theme-setting-label"
                  >
                    {themes.map((themeOption) => (
                      <button
                        key={themeOption.value}
                        type="button"
                        className="theme-option"
                        data-theme-option={themeOption.value}
                        aria-label={themeOption.label}
                        aria-pressed={theme === themeOption.value}
                        title={themeOption.label}
                        onClick={() => selectTheme(themeOption.value)}
                      >
                        <span className="theme-swatch" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>

                <label className="settings-group">
                  <span className="settings-label">글꼴</span>
                  <select
                    className="settings-select"
                    name="reading-font"
                    value={readingFont}
                    onChange={handleReadingFontChange}
                  >
                    {readingFonts.map((fontOption) => (
                      <option key={fontOption.value} value={fontOption.value}>
                        {fontOption.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="settings-group">
                  <span
                    id="line-spacing-setting-label"
                    className="settings-label"
                  >
                    행간
                  </span>
                  <div
                    className="line-spacing-options"
                    role="group"
                    aria-labelledby="line-spacing-setting-label"
                  >
                    {lineSpacings.map((spacingOption) => (
                      <button
                        key={spacingOption.value}
                        type="button"
                        className="line-spacing-option"
                        data-spacing={spacingOption.value}
                        aria-label={spacingOption.label}
                        aria-pressed={lineSpacing === spacingOption.value}
                        title={spacingOption.label}
                        onClick={() => selectLineSpacing(spacingOption.value)}
                      >
                        <LineSpacingGlyph />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main ref={workspaceRef} className="workspace">
        <Pane
          side="left"
          activePane={leftPane}
          markdown={markdown}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onMarkdownChange={setMarkdown}
        />
        <div className="pane-divider">
          <div
            ref={dividerRef}
            className="pane-divider-handle"
            role="separator"
            aria-label="패널 너비 조절"
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={50}
            tabIndex={0}
            title="드래그하여 패널 너비 조절 · 더블 클릭하여 초기화"
            onDoubleClick={() => updateSplit(50)}
            onKeyDown={handleDividerKeyDown}
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerEnd}
            onPointerCancel={handleDividerPointerEnd}
          />
          <button
            className="pane-swap-button"
            type="button"
            aria-label="마크다운과 미리보기 위치 바꾸기"
            title="마크다운과 미리보기 위치 바꾸기"
            onClick={() =>
              setLeftPane((currentPane) => oppositePane[currentPane])
            }
          >
            <SwapPaneIcon />
          </button>
        </div>
        <Pane
          side="right"
          activePane={rightPane}
          markdown={markdown}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onMarkdownChange={setMarkdown}
        />
      </main>
    </div>
  );
}

export default App;
