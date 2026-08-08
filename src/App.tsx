import {
  isValidElement,
  memo,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { message, open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlightedCode } from "./components/SyntaxHighlightedCode";
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
  pre: ({ node, children, ...preProps }) => {
    void node;

    if (
      isValidElement<{
        className?: string;
        children?: ReactNode;
      }>(children) &&
      children.type === "code"
    ) {
      const codeClassName = children.props.className;
      const language = /(?:^|\s)language-([^\s]+)/.exec(
        codeClassName ?? "",
      )?.[1];

      if (language && typeof children.props.children === "string") {
        return (
          <SyntaxHighlightedCode
            code={children.props.children.replace(/\n$/, "")}
            language={language}
            codeClassName={codeClassName}
            preProps={preProps}
          />
        );
      }
    }

    return (
      <pre {...preProps} tabIndex={0} translate="no">
        {children}
      </pre>
    );
  },
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
const untitledDocumentNoteStorageKey = "aster:document-note:untitled:v1";

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
type ReadingZoomCommand = "in" | "out" | "reset";

type PaneKind = "editor" | "preview";
type PaneContent = PaneKind | "notes";
type PaneSide = "left" | "right";
type NoteSaveStatus = "saved" | "saving" | "error";

type OpenedMarkdownFile = {
  path: string;
  name: string;
  content: string;
};

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

function OpenFileIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 5.5h5l1.4 1.8h6.6v8.2h-13z" />
      <path d="M3.5 8.2h13" />
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

function loadStoredText(storageKey: string): string {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

function saveStoredText(storageKey: string, value: string): boolean {
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

function getDocumentNoteStorageKey(filePath: string | null): string {
  return filePath
    ? `aster:document-note:file:v1:${filePath}`
    : untitledDocumentNoteStorageKey;
}

async function chooseMarkdownFile(): Promise<OpenedMarkdownFile | null> {
  const selectedPath = await open({
    title: "Markdown 파일 열기",
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  if (!selectedPath) {
    return null;
  }

  return invoke<OpenedMarkdownFile>("read_markdown_file", {
    path: selectedPath,
  });
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
  note,
  noteSaveStatus,
  previewMarkdown,
  isPreviewUpdating,
  onMarkdownChange,
  onNoteChange,
  onSourceModeChange,
}: {
  side: PaneSide;
  activePane: PaneContent;
  markdown: string;
  note: string;
  noteSaveStatus: NoteSaveStatus;
  previewMarkdown: string;
  isPreviewUpdating: boolean;
  onMarkdownChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSourceModeChange: (mode: "editor" | "notes") => void;
}) {
  const isEditor = activePane === "editor";
  const isNotes = activePane === "notes";
  const isSourcePane = isEditor || isNotes;
  const hasNote = note.trim().length > 0;
  const paneLabel = side === "left" ? "왼쪽" : "오른쪽";
  const paneTitle = isEditor ? "마크다운" : isNotes ? "내 메모" : "미리보기";
  const noteSaveLabel =
    noteSaveStatus === "saving"
      ? "저장 중…"
      : noteSaveStatus === "error"
        ? "저장하지 못함"
        : "저장됨";

  return (
    <section
      id={`${side}-pane`}
      className={`pane ${isEditor ? "editor-pane" : isNotes ? "notes-pane" : "preview-pane"}`}
      aria-label={`${paneLabel} ${paneTitle} 패널`}
    >
      <div className="pane-header">
        {isSourcePane ? (
          <div
            className="document-mode-tabs"
            role="group"
            aria-label="작성 화면 선택"
          >
            <button
              type="button"
              className="document-mode-tab"
              aria-pressed={isEditor}
              onClick={() => onSourceModeChange("editor")}
            >
              마크다운
            </button>
            <button
              type="button"
              className="document-mode-tab"
              aria-label={hasNote ? "메모, 작성된 내용 있음" : "메모"}
              aria-pressed={isNotes}
              title="메모 (⌘/Ctrl ⇧ M)"
              onClick={() => onSourceModeChange("notes")}
            >
              메모
              {hasNote ? (
                <span className="note-presence-dot" aria-hidden="true" />
              ) : null}
            </button>
          </div>
        ) : (
          <span className="pane-title">{paneTitle}</span>
        )}
        {isNotes ? (
          <span
            className={`note-save-status is-${noteSaveStatus}`}
            aria-live="polite"
          >
            {noteSaveLabel}
          </span>
        ) : null}
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
      ) : isNotes ? (
        <textarea
          id="document-note"
          name="document-note"
          className="note-editor"
          value={note}
          placeholder="이 문서를 읽으며 떠오른 생각이나 확인할 내용을 적어보세요."
          onChange={(event) => onNoteChange(event.currentTarget.value)}
          aria-label="이 문서에 대한 개인 메모"
          autoComplete="off"
          autoFocus
          spellCheck="true"
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
  const [documentName, setDocumentName] = useState("새 문서.md");
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [note, setNote] = useState(() =>
    loadStoredText(untitledDocumentNoteStorageKey),
  );
  const [noteSaveStatus, setNoteSaveStatus] =
    useState<NoteSaveStatus>("saved");
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
  const openFileRef = useRef<() => void>(() => undefined);
  const isOpeningFileRef = useRef(false);
  const splitPercentRef = useRef(50);
  const deferredMarkdown = useDeferredValue(markdown);
  const isPreviewUpdating = markdown !== deferredMarkdown;
  const primaryPane: PaneContent = isNotesOpen ? "notes" : "editor";
  const leftPaneContent: PaneContent =
    leftPane === "editor" ? primaryPane : "preview";
  const rightPaneContent: PaneContent =
    leftPane === "editor" ? "preview" : primaryPane;
  const documentNoteStorageKey = getDocumentNoteStorageKey(documentPath);
  const readingZoomStyle = {
    "--reading-font-size": `${(17 * Number(readingZoom)) / 100}px`,
  } as CSSProperties;
  useEffect(() => {
    let isDisposed = false;
    let stopListening: (() => void) | undefined;

    void listen("open-markdown-requested", () => {
      openFileRef.current();
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });

    return () => {
      isDisposed = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    let isDisposed = false;
    let stopListening: (() => void) | undefined;

    void listen<ReadingZoomCommand>("reading-zoom-requested", (event) => {
      setReadingZoom((currentZoom) => {
        const updatedZoom =
          event.payload === "in"
            ? getSteppedReadingZoom(currentZoom, 1)
            : event.payload === "out"
              ? getSteppedReadingZoom(currentZoom, -1)
              : "100";

        savePreference(readingZoomStorageKey, updatedZoom);
        return updatedZoom;
      });
    }).then((unlisten) => {
      if (isDisposed) {
        unlisten();
      } else {
        stopListening = unlisten;
      }
    });

    return () => {
      isDisposed = true;
      stopListening?.();
    };
  }, []);

  useEffect(() => {
    function handleNoteShortcut(event: globalThis.KeyboardEvent) {
      if (
        (!event.metaKey && !event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== "m"
      ) {
        return;
      }

      event.preventDefault();
      setIsSettingsOpen(false);
      setIsNotesOpen((isOpen) => !isOpen);
    }

    window.addEventListener("keydown", handleNoteShortcut);
    return () => window.removeEventListener("keydown", handleNoteShortcut);
  }, []);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      const didSave = saveStoredText(documentNoteStorageKey, note);
      setNoteSaveStatus(didSave ? "saved" : "error");
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [documentNoteStorageKey, note]);

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

  function handleNoteChange(value: string) {
    setNote(value);
    setNoteSaveStatus("saving");
  }

  function selectSourceMode(mode: "editor" | "notes") {
    setIsSettingsOpen(false);
    setIsNotesOpen(mode === "notes");
  }

  function swapPanes() {
    setLeftPane((currentPane) => oppositePane[currentPane]);

    if (window.matchMedia("(min-width: 721px)").matches) {
      updateSplit(100 - splitPercentRef.current);
    }
  }

  async function handleOpenFile() {
    if (isOpeningFileRef.current) {
      return;
    }

    isOpeningFileRef.current = true;
    setIsOpeningFile(true);

    try {
      const openedFile = await chooseMarkdownFile();

      if (!openedFile) {
        return;
      }

      saveStoredText(documentNoteStorageKey, note);

      const nextNoteStorageKey = getDocumentNoteStorageKey(openedFile.path);
      setDocumentName(openedFile.name);
      setDocumentPath(openedFile.path);
      setMarkdown(openedFile.content);
      setNote(loadStoredText(nextNoteStorageKey));
      setNoteSaveStatus("saved");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      try {
        await message(errorMessage, {
          title: "파일을 열 수 없습니다",
          kind: "error",
        });
      } catch {
        console.error("파일을 열 수 없습니다:", errorMessage);
      }
    } finally {
      isOpeningFileRef.current = false;
      setIsOpeningFile(false);
    }
  }

  openFileRef.current = handleOpenFile;

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
        <span className="document-name" title={documentPath ?? documentName}>
          {documentName}
        </span>
        <div className="header-actions">
          <button
            className="header-icon-button open-file-trigger"
            type="button"
            aria-label="Markdown 파일 열기"
            title="Markdown 파일 열기 (⌘/Ctrl O)"
            disabled={isOpeningFile}
            onClick={handleOpenFile}
          >
            <OpenFileIcon />
          </button>
          <div ref={settingsRef} className="settings-menu">
            <button
              ref={settingsButtonRef}
              className="header-icon-button settings-trigger"
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
          activePane={leftPaneContent}
          markdown={markdown}
          note={note}
          noteSaveStatus={noteSaveStatus}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onMarkdownChange={setMarkdown}
          onNoteChange={handleNoteChange}
          onSourceModeChange={selectSourceMode}
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
            aria-label={`${isNotesOpen ? "메모" : "마크다운"}와 미리보기 위치 바꾸기`}
            title={`${isNotesOpen ? "메모" : "마크다운"}와 미리보기 위치 바꾸기`}
            onClick={swapPanes}
          >
            <SwapPaneIcon />
          </button>
        </div>
        <Pane
          side="right"
          activePane={rightPaneContent}
          markdown={markdown}
          note={note}
          noteSaveStatus={noteSaveStatus}
          previewMarkdown={deferredMarkdown}
          isPreviewUpdating={isPreviewUpdating}
          onMarkdownChange={setMarkdown}
          onNoteChange={handleNoteChange}
          onSourceModeChange={selectSourceMode}
        />
      </main>
    </div>
  );
}

export default App;
