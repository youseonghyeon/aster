import {
  createElement,
  isValidElement,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { message, open } from "@tauri-apps/plugin-dialog";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DocumentOutline } from "./components/DocumentOutline";
import { PaneSearchBar, SearchIcon } from "./components/PaneSearchBar";
import { SyntaxHighlightedCode } from "./components/SyntaxHighlightedCode";
import { useActiveHeading } from "./hooks/useActiveHeading";
import { usePreviewSearch } from "./hooks/usePreviewSearch";
import { useScrollSync } from "./hooks/useScrollSync";
import { useTextSearch } from "./hooks/useTextSearch";
import {
  getMarkdownHeadingId,
  getMarkdownOutline,
} from "./lib/markdown-outline";
import { rehypeMarkdownSourceOffsets } from "./lib/markdown-source-offsets";
import {
  emptySearchSession,
  normalizeSearchIndex,
  type SearchArea,
  type SearchSession,
} from "./lib/text-search";
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
const markdownRehypePlugins = [rehypeMarkdownSourceOffsets];
type MarkdownHeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  node?: {
    position?: {
      start: {
        offset?: number;
      };
    };
  };
};

function createMarkdownHeading(
  tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
) {
  return function MarkdownHeading({
    node,
    ...headingProps
  }: MarkdownHeadingProps) {
    const id = getMarkdownHeadingId(node?.position?.start.offset);

    return createElement(tagName, {
      ...headingProps,
      id,
      tabIndex: id ? -1 : undefined,
    });
  };
}

const MarkdownHeading1 = createMarkdownHeading("h1");
const MarkdownHeading2 = createMarkdownHeading("h2");
const MarkdownHeading3 = createMarkdownHeading("h3");
const MarkdownHeading4 = createMarkdownHeading("h4");
const MarkdownHeading5 = createMarkdownHeading("h5");
const MarkdownHeading6 = createMarkdownHeading("h6");

const markdownComponents = {
  h1: MarkdownHeading1,
  h2: MarkdownHeading2,
  h3: MarkdownHeading3,
  h4: MarkdownHeading4,
  h5: MarkdownHeading5,
  h6: MarkdownHeading6,
  pre: ({ node, children, ...preProps }) => {
    void node;
    const sourceOffset = (
      preProps as typeof preProps & { "data-source-offset"?: string | number }
    )["data-source-offset"];

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
            sourceOffset={sourceOffset}
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
    const sourceOffset = (
      tableProps as typeof tableProps & {
        "data-source-offset"?: string | number;
      }
    )["data-source-offset"];

    return (
      <div
        className="table-scroll"
        role="region"
        aria-label="표"
        tabIndex={0}
        data-source-offset={sourceOffset}
      >
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
const scrollSyncStorageKey = "aster:scroll-sync:v1";
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
  { value: "tight", label: "매우 촘촘 1.4" },
  { value: "compact", label: "촘촘 1.5" },
  { value: "balanced", label: "기본 1.7" },
  { value: "relaxed", label: "여유 1.9" },
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

const scrollSyncOptions = [{ value: "off" }, { value: "on" }] as const;

type Theme = (typeof themes)[number]["value"];
type ReadingFont = (typeof readingFonts)[number]["value"];
type LineSpacing = (typeof lineSpacings)[number]["value"];
type ReadingZoom = (typeof readingZoomLevels)[number]["value"];
type ScrollSyncPreference = (typeof scrollSyncOptions)[number]["value"];
type ReadingZoomCommand = "in" | "out" | "reset";

type PaneKind = "editor" | "preview";
type PaneContent = PaneKind | "notes";
type PaneSide = "left" | "right";
type NoteSaveStatus = "saved" | "saving" | "error";

type SearchSessions = Record<SearchArea, SearchSession>;

type SearchSnapshot = {
  activeElement: HTMLElement | null;
  activeElementKind:
    | "content"
    | "search-trigger"
    | "area-element"
    | "external";
  selectionStart?: number;
  selectionEnd?: number;
  selectionDirection?: "forward" | "backward" | "none";
  scrollTop: number;
  scrollLeft: number;
  nestedScrollPositions?: Array<{
    scrollTop: number;
    scrollLeft: number;
  }>;
};

type ScrollProgress = {
  top: number;
  left: number;
};

type PreviewScrollProgress = {
  outer: ScrollProgress;
  nested: ScrollProgress[];
};

type OpenedMarkdownFile = {
  path: string;
  name: string;
  content: string;
};

const oppositePane: Record<PaneKind, PaneKind> = {
  editor: "preview",
  preview: "editor",
};

function createEmptySearchSessions(): SearchSessions {
  return {
    editor: { ...emptySearchSession },
    notes: { ...emptySearchSession },
    preview: { ...emptySearchSession },
  };
}

function getScrollProgress(element: HTMLElement): ScrollProgress {
  const maximumTop = element.scrollHeight - element.clientHeight;
  const maximumLeft = element.scrollWidth - element.clientWidth;

  return {
    top: maximumTop > 0 ? element.scrollTop / maximumTop : 0,
    left: maximumLeft > 0 ? element.scrollLeft / maximumLeft : 0,
  };
}

function restoreScrollProgress(
  element: HTMLElement,
  progress: ScrollProgress,
) {
  element.scrollTop =
    progress.top * Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollLeft =
    progress.left * Math.max(0, element.scrollWidth - element.clientWidth);
}

function SwapPaneIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 6h11m-3-3 3 3-3 3M15 12H4m3-3-3 3 3 3" />
    </svg>
  );
}

function PreviewFocusIcon({ isActive }: { isActive: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {isActive ? (
        <path d="M3.5 7h3.5V3.5M16.5 7H13V3.5M3.5 13H7v3.5M16.5 13H13v3.5" />
      ) : (
        <path d="M7 3.5H3.5V7M13 3.5h3.5V7M7 16.5H3.5V13M13 16.5h3.5V13" />
      )}
    </svg>
  );
}

function ScrollSyncIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 4.25h4v11.5h-4zM12.5 4.25h4v11.5h-4z" />
      <path d="M10 5.5v9m-2-2 2 2 2-2M8 7.5l2-2 2 2" />
    </svg>
  );
}

function AsterBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.2 6.8c3.1-1 5.7-.7 7.8.8V18c-2.3-1.4-4.9-1.7-7.8-.8V6.8Z" />
      <path d="M19.8 6.8c-3.1-1-5.7-.7-7.8.8V18c2.3-1.4 4.9-1.7 7.8-.8V6.8Z" />
      <g className="brand-aster">
        <path d="M12 9v5" />
        <path d="m9.85 10.25 4.3 2.5" />
        <path d="m9.85 12.75 4.3-2.5" />
      </g>
    </svg>
  );
}

function ReadingSettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.25 5.25h4.1m3.3 0h6.1M3.25 10h8.1m3.3 0h2.1M3.25 14.75h2.1m3.3 0h8.1" />
      <circle cx="9" cy="5.25" r="1.65" />
      <circle cx="13" cy="10" r="1.65" />
      <circle cx="7" cy="14.75" r="1.65" />
    </svg>
  );
}

function OpenFileIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.25 6h4.4l1.5 1.75h7.6v7a1 1 0 0 1-1 1H4.25a1 1 0 0 1-1-1V6Z" />
      <path d="M3.25 8.75h13.5" />
    </svg>
  );
}

function DocumentOutlineIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5.25h1.5M8.25 5.25H16M4 10h1.5M8.25 10H16M4 14.75h1.5M8.25 14.75H13.5" />
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

function SelectChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
    </svg>
  );
}

function SelectedOptionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.25 2.75 2.75 6.25-6.25" />
    </svg>
  );
}

type ReadingFontSelectProps = {
  value: ReadingFont;
  onChange: (font: ReadingFont) => void;
};

function ReadingFontSelect({ value, onChange }: ReadingFontSelectProps) {
  const selectedIndex = readingFonts.findIndex((font) => font.value === value);
  const selectedFont = readingFonts[selectedIndex] ?? readingFonts[0];
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex(selectedIndex);

    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isOpen, selectedIndex]);

  function openMenu() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function selectFont(nextFont: ReadingFont) {
    onChange(nextFont);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
      return;
    }

    if (event.key === "Tab" && isOpen) {
      setIsOpen(false);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      if (!isOpen) {
        return;
      }

      event.preventDefault();
      selectFont(readingFonts[activeIndex].value);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!isOpen) {
        openMenu();
        return;
      }

      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (currentIndex) =>
          (currentIndex + direction + readingFonts.length) %
          readingFonts.length,
      );
      return;
    }

    if (isOpen && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : readingFonts.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="font-select">
      <button
        ref={triggerRef}
        type="button"
        className="font-select-trigger"
        aria-label="글꼴"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="reading-font-options"
        aria-activedescendant={
          isOpen
            ? `reading-font-option-${readingFonts[activeIndex].value}`
            : undefined
        }
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedFont.label}</span>
        <SelectChevronIcon />
      </button>

      {isOpen ? (
        <div
          id="reading-font-options"
          className="font-select-options"
          role="listbox"
          aria-label="글꼴 선택"
        >
          {readingFonts.map((fontOption, index) => (
            <button
              id={`reading-font-option-${fontOption.value}`}
              key={fontOption.value}
              type="button"
              role="option"
              tabIndex={-1}
              className="font-select-option"
              data-font-option={fontOption.value}
              aria-selected={value === fontOption.value}
              data-active={activeIndex === index ? "true" : undefined}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => selectFont(fontOption.value)}
            >
              <span>{fontOption.label}</span>
              {value === fontOption.value ? <SelectedOptionIcon /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

const maximumMeasuredTextareaPrefixLength = 250_000;

function scrollTextareaMatchIntoView(
  textarea: HTMLTextAreaElement,
  value: string,
  matchStart: number,
  matchEnd: number,
) {
  if (value.length === 0) {
    return;
  }

  if (matchStart > maximumMeasuredTextareaPrefixLength) {
    const scrollableHeight = Math.max(
      0,
      textarea.scrollHeight - textarea.clientHeight,
    );
    textarea.scrollTop = scrollableHeight * (matchStart / value.length);
    return;
  }

  const computedStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");

  mirror.setAttribute("aria-hidden", "true");
  Object.assign(mirror.style, {
    position: "fixed",
    top: "0",
    left: "-10000px",
    width: `${textarea.offsetWidth}px`,
    minHeight: "0",
    height: "auto",
    boxSizing: computedStyle.boxSizing,
    padding: computedStyle.padding,
    border: computedStyle.border,
    font: computedStyle.font,
    letterSpacing: computedStyle.letterSpacing,
    lineHeight: computedStyle.lineHeight,
    tabSize: computedStyle.tabSize,
    textIndent: computedStyle.textIndent,
    textTransform: computedStyle.textTransform,
    whiteSpace: "pre-wrap",
    overflowWrap: computedStyle.overflowWrap,
    wordBreak: computedStyle.wordBreak,
    visibility: "hidden",
    pointerEvents: "none",
  });
  mirror.append(document.createTextNode(value.slice(0, matchStart)));
  marker.textContent = value.slice(matchStart, matchEnd) || "\u200b";
  mirror.append(marker);
  document.body.append(mirror);

  textarea.scrollTop = Math.max(
    0,
    marker.offsetTop - textarea.clientHeight / 2 + marker.offsetHeight / 2,
  );
  mirror.remove();
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
        rehypePlugins={markdownRehypePlugins}
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
  isPreviewFocusMode,
  isHiddenByPreviewFocus,
  onMarkdownChange,
  onNoteChange,
  onSourceModeChange,
  onPreviewScrollElementChange,
  searchSession,
  onSearchOpen,
  onSearchClose,
  onSearchChange,
  onSearchAreaActivate,
  onSearchInputElementChange,
  onContentElementChange,
  onPreviewFocusModeToggle,
  isScrollSyncEnabled,
  onScrollSyncToggle,
}: {
  side: PaneSide;
  activePane: PaneContent;
  markdown: string;
  note: string;
  noteSaveStatus: NoteSaveStatus;
  previewMarkdown: string;
  isPreviewUpdating: boolean;
  isPreviewFocusMode: boolean;
  isHiddenByPreviewFocus: boolean;
  onMarkdownChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSourceModeChange: (mode: "editor" | "notes") => void;
  onPreviewScrollElementChange: (element: HTMLDivElement | null) => void;
  searchSession: SearchSession;
  onSearchOpen: (area: SearchArea) => void;
  onSearchClose: (area: SearchArea) => void;
  onSearchChange: (area: SearchArea, patch: Partial<SearchSession>) => void;
  onSearchAreaActivate: (area: SearchArea) => void;
  onSearchInputElementChange: (
    area: SearchArea,
    element: HTMLInputElement | null,
  ) => void;
  onContentElementChange: (
    area: SearchArea,
    element: HTMLTextAreaElement | HTMLDivElement | null,
  ) => void;
  onPreviewFocusModeToggle: () => void;
  isScrollSyncEnabled: boolean;
  onScrollSyncToggle: () => void;
}) {
  const isEditor = activePane === "editor";
  const isNotes = activePane === "notes";
  const isSourcePane = isEditor || isNotes;
  const hasNote = note.trim().length > 0;
  const paneLabel = side === "left" ? "왼쪽" : "오른쪽";
  const paneTitle = isEditor ? "마크다운" : isNotes ? "내 메모" : "미리보기";
  const searchArea: SearchArea = activePane;
  const searchAreaLabel = isEditor ? "마크다운" : isNotes ? "메모" : "미리보기";
  const sourceValue = isEditor ? markdown : isNotes ? note : "";
  const searchOptions = useMemo(
    () => ({
      isCaseSensitive: searchSession.isCaseSensitive,
      isRegex: searchSession.isRegex,
    }),
    [searchSession.isCaseSensitive, searchSession.isRegex],
  );
  const sourceSearchResult = useTextSearch(
    sourceValue,
    isSourcePane && searchSession.isOpen ? searchSession.query : "",
    searchOptions,
  );
  const [previewElement, setPreviewElement] = useState<HTMLDivElement | null>(null);
  const previewSearchResult = usePreviewSearch(
    previewElement,
    previewMarkdown,
    searchSession,
  );
  const searchResult = isSourcePane ? sourceSearchResult : previewSearchResult;
  const sourceElementRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputElementRef = useRef<HTMLInputElement | null>(null);
  const handleSourceElementChange = useCallback(
    (element: HTMLTextAreaElement | null) => {
      sourceElementRef.current = element;
      onContentElementChange(searchArea, element);
    },
    [onContentElementChange, searchArea],
  );
  const handlePreviewElementChange = useCallback(
    (element: HTMLDivElement | null) => {
      setPreviewElement(element);
      onPreviewScrollElementChange(element);
      onContentElementChange("preview", element);
    },
    [onContentElementChange, onPreviewScrollElementChange],
  );
  const handleSearchInputElementChange = useCallback(
    (element: HTMLInputElement | null) => {
      searchInputElementRef.current = element;
      onSearchInputElementChange(searchArea, element);
    },
    [onSearchInputElementChange, searchArea],
  );
  const noteSaveLabel =
    noteSaveStatus === "saving"
      ? "저장 중…"
      : noteSaveStatus === "error"
        ? "저장하지 못함"
        : "저장됨";

  useEffect(() => {
    const textarea = sourceElementRef.current;

    if (
      !isSourcePane ||
      !textarea ||
      !searchSession.isOpen ||
      searchResult.error ||
      searchResult.matches.length === 0
    ) {
      return;
    }

    const activeIndex = normalizeSearchIndex(
      searchSession.currentIndex,
      searchResult.matches.length,
    );
    const match = searchResult.matches[activeIndex];
    let inputFocusFrame: number | null = null;
    const selectionFrame = window.requestAnimationFrame(() => {
      textarea.setSelectionRange(match.start, match.end, "forward");
      scrollTextareaMatchIntoView(
        textarea,
        sourceValue,
        match.start,
        match.end,
      );
      textarea.focus();
      inputFocusFrame = window.requestAnimationFrame(() =>
        searchInputElementRef.current?.focus({ preventScroll: true }),
      );
    });

    return () => {
      window.cancelAnimationFrame(selectionFrame);

      if (inputFocusFrame !== null) {
        window.cancelAnimationFrame(inputFocusFrame);
      }
    };
  }, [
    isSourcePane,
    searchResult.error,
    searchResult.matches,
    searchSession.currentIndex,
    searchSession.isOpen,
    sourceValue,
  ]);

  function navigateSearch(direction: -1 | 1) {
    if (searchResult.matches.length === 0 || searchResult.error) {
      return;
    }

    const activeIndex = normalizeSearchIndex(
      searchSession.currentIndex,
      searchResult.matches.length,
    );
    onSearchChange(searchArea, { currentIndex: activeIndex + direction });
  }

  return (
    <section
      id={`${side}-pane`}
      className={`pane ${isEditor ? "editor-pane" : isNotes ? "notes-pane" : "preview-pane"}${searchSession.isOpen ? " has-search" : ""}${isHiddenByPreviewFocus ? " is-focus-hidden" : ""}`}
      aria-label={`${paneLabel} ${paneTitle} 패널`}
      aria-hidden={isHiddenByPreviewFocus || undefined}
      inert={isHiddenByPreviewFocus}
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
        <div className="pane-header-actions">
          {isNotes ? (
            <span
              className={`note-save-status is-${noteSaveStatus}`}
              aria-live="polite"
            >
              {noteSaveLabel}
            </span>
          ) : null}
          {isEditor ? (
            <button
              type="button"
              className="pane-search-trigger scroll-sync-trigger"
              aria-label={
                isScrollSyncEnabled
                  ? "스크롤 동기화 끄기"
                  : "스크롤 동기화 켜기"
              }
              aria-pressed={isScrollSyncEnabled}
              title={
                isScrollSyncEnabled
                  ? "마크다운·미리보기 스크롤 동기화 끄기"
                  : "마크다운·미리보기 스크롤 동기화 켜기"
              }
              onClick={onScrollSyncToggle}
            >
              <ScrollSyncIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="pane-search-trigger"
            aria-label={`${searchAreaLabel} 검색`}
            aria-expanded={searchSession.isOpen}
            title={`${searchAreaLabel} 검색 (⌘/Ctrl F)`}
            onClick={() => onSearchOpen(searchArea)}
          >
            <SearchIcon />
          </button>
          {!isSourcePane ? (
            <button
              type="button"
              className="pane-search-trigger preview-focus-trigger"
              aria-label={
                isPreviewFocusMode
                  ? "미리보기 집중 모드 종료"
                  : "미리보기 집중 모드"
              }
              aria-pressed={isPreviewFocusMode}
              title={
                isPreviewFocusMode
                  ? "미리보기 집중 모드 종료 (Escape)"
                  : "미리보기 집중 모드"
              }
              onClick={onPreviewFocusModeToggle}
            >
              <PreviewFocusIcon isActive={isPreviewFocusMode} />
            </button>
          ) : null}
        </div>
      </div>

      {searchSession.isOpen ? (
        <PaneSearchBar
          areaLabel={searchAreaLabel}
          session={searchSession}
          matchCount={searchResult.matches.length}
          error={searchResult.error}
          isTruncated={searchResult.isTruncated}
          onInputElementChange={handleSearchInputElementChange}
          onQueryChange={(query) =>
            onSearchChange(searchArea, { query, currentIndex: 0 })
          }
          onCaseSensitiveChange={(isCaseSensitive) =>
            onSearchChange(searchArea, { isCaseSensitive, currentIndex: 0 })
          }
          onRegexChange={(isRegex) =>
            onSearchChange(searchArea, { isRegex, currentIndex: 0 })
          }
          onNavigate={navigateSearch}
          onClose={() => onSearchClose(searchArea)}
          onActivate={() => onSearchAreaActivate(searchArea)}
        />
      ) : null}

      {isEditor ? (
        <textarea
          key="markdown-editor"
          ref={handleSourceElementChange}
          id="markdown-editor"
          name="markdown"
          className="markdown-editor"
          value={markdown}
          onChange={(event) => onMarkdownChange(event.currentTarget.value)}
          aria-label="마크다운 입력"
          autoComplete="off"
          spellCheck="false"
          onFocus={() => onSearchAreaActivate("editor")}
          onPointerDown={() => onSearchAreaActivate("editor")}
        />
      ) : isNotes ? (
        <textarea
          key="document-note"
          ref={handleSourceElementChange}
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
          onFocus={() => onSearchAreaActivate("notes")}
          onPointerDown={() => onSearchAreaActivate("notes")}
        />
      ) : (
        <div
          ref={handlePreviewElementChange}
          className={`preview-scroll${isPreviewUpdating ? " is-updating" : ""}`}
          aria-busy={isPreviewUpdating}
          aria-label="미리보기 내용"
          tabIndex={0}
          onFocus={() => onSearchAreaActivate("preview")}
          onPointerDown={() => onSearchAreaActivate("preview")}
        >
          <MarkdownPreview content={previewMarkdown} />
          {previewSearchResult.overlays.length > 0 ? (
            <div className="preview-search-overlays" aria-hidden="true">
              {previewSearchResult.overlays.map((overlay) => (
                <span
                  key={overlay.id}
                  className={`preview-search-overlay${overlay.isCurrent ? " is-current" : ""}`}
                  style={{
                    top: overlay.top,
                    left: overlay.left,
                    width: overlay.width,
                    height: overlay.height,
                  }}
                />
              ))}
            </div>
          ) : null}
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
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isPreviewFocusMode, setIsPreviewFocusMode] = useState(false);
  const [isOutlineInset, setIsOutlineInset] = useState(() =>
    window.matchMedia("(min-width: 1280px)").matches,
  );
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [note, setNote] = useState(() =>
    loadStoredText(untitledDocumentNoteStorageKey),
  );
  const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>("saved");
  const [searchSessions, setSearchSessions] = useState<SearchSessions>(
    createEmptySearchSessions,
  );
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
  const [scrollSyncPreference, setScrollSyncPreference] =
    useState<ScrollSyncPreference>(() =>
      loadPreference(scrollSyncStorageKey, scrollSyncOptions, "off"),
    );
  const workspaceRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const outlineButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const openFileRef = useRef<() => void>(() => undefined);
  const isOpeningFileRef = useRef(false);
  const searchSessionsRef = useRef(searchSessions);
  const lastSearchAreaRef = useRef<SearchArea>("preview");
  const searchSnapshotsRef = useRef<Partial<Record<SearchArea, SearchSnapshot>>>(
    {},
  );
  const searchInputElementsRef = useRef<
    Record<SearchArea, HTMLInputElement | null>
  >({ editor: null, notes: null, preview: null });
  const contentElementsRef = useRef<
    Record<SearchArea, HTMLTextAreaElement | HTMLDivElement | null>
  >({ editor: null, notes: null, preview: null });
  const sourceScrollPositionsRef = useRef({ editor: 0, notes: 0 });
  const pendingSourceFocusRef = useRef<"editor" | "notes" | null>(null);
  const isOutlineOpenRef = useRef(isOutlineOpen);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  const isNotesOpenRef = useRef(isNotesOpen);
  const isPreviewFocusModeRef = useRef(isPreviewFocusMode);
  const previewFocusReturnAreaRef = useRef<SearchArea>("preview");
  const requestedSplitPercentRef = useRef(50);
  const appliedSplitPercentRef = useRef(50);
  const [previewScrollElement, setPreviewScrollElement] =
    useState<HTMLDivElement | null>(null);
  const [editorScrollElement, setEditorScrollElement] =
    useState<HTMLTextAreaElement | null>(null);
  const deferredMarkdown = useDeferredValue(markdown);
  const isPreviewUpdating = markdown !== deferredMarkdown;
  const outlineItems = useMemo(
    () => (isOutlineOpen ? getMarkdownOutline(deferredMarkdown) : []),
    [deferredMarkdown, isOutlineOpen],
  );
  const outlineHeadingIds = useMemo(
    () => outlineItems.map((item) => item.id),
    [outlineItems],
  );
  const { activeHeadingId, navigateToHeading } = useActiveHeading(
    previewScrollElement,
    outlineHeadingIds,
  );
  const primaryPane: PaneContent = isNotesOpen ? "notes" : "editor";
  const leftPaneContent: PaneContent =
    leftPane === "editor" ? primaryPane : "preview";
  const rightPaneContent: PaneContent =
    leftPane === "editor" ? "preview" : primaryPane;
  const documentNoteStorageKey = getDocumentNoteStorageKey(documentPath);
  const readingZoomStyle = {
    "--reading-font-size": `${(17 * Number(readingZoom)) / 100}px`,
  } as CSSProperties;
  searchSessionsRef.current = searchSessions;
  isOutlineOpenRef.current = isOutlineOpen;
  isSettingsOpenRef.current = isSettingsOpen;
  isNotesOpenRef.current = isNotesOpen;
  isPreviewFocusModeRef.current = isPreviewFocusMode;
  const isScrollSyncEnabled = scrollSyncPreference === "on";
  const { suppressScrollSyncRestore } = useScrollSync({
    enabled: isScrollSyncEnabled,
    active:
      !isNotesOpen &&
      !isPreviewFocusMode &&
      !isPreviewUpdating,
    markdown: deferredMarkdown,
    editorElement: editorScrollElement,
    previewElement: previewScrollElement,
  });

  const handleSearchInputElementChange = useCallback(
    (area: SearchArea, element: HTMLInputElement | null) => {
      searchInputElementsRef.current[area] = element;
    },
    [],
  );

  const handleContentElementChange = useCallback(
    (
      area: SearchArea,
      element: HTMLTextAreaElement | HTMLDivElement | null,
    ) => {
      contentElementsRef.current[area] = element;

      if (area === "editor") {
        setEditorScrollElement(
          element instanceof HTMLTextAreaElement ? element : null,
        );
      }

      if (
        (area === "editor" || area === "notes") &&
        element instanceof HTMLTextAreaElement
      ) {
        suppressScrollSyncRestore();
        element.scrollTop = sourceScrollPositionsRef.current[area];
        window.requestAnimationFrame(() => {
          if (element.isConnected) {
            element.scrollTop = sourceScrollPositionsRef.current[area];
          }
        });

        if (pendingSourceFocusRef.current === area) {
          pendingSourceFocusRef.current = null;
          element.focus({ preventScroll: true });
        }
      }
    },
    [suppressScrollSyncRestore],
  );
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

      if (isPreviewFocusModeRef.current) {
        return;
      }

      setIsSettingsOpen(false);
      captureCurrentSourceScroll();
      const willOpen = !isNotesOpenRef.current;
      const nextArea = willOpen ? "notes" : "editor";
      requestSourceFocus(nextArea);
      isNotesOpenRef.current = willOpen;
      setIsNotesOpen(willOpen);
      lastSearchAreaRef.current = nextArea;
    }

    window.addEventListener("keydown", handleNoteShortcut);
    return () => window.removeEventListener("keydown", handleNoteShortcut);
  }, []);

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f";

      if (isFindShortcut) {
        event.preventDefault();
        setIsOutlineOpen(false);
        setIsSettingsOpen(false);
        openSearch(
          isPreviewFocusModeRef.current
            ? "preview"
            : lastSearchAreaRef.current,
        );
        return;
      }

      if (
        event.key !== "Escape" ||
        isOutlineOpenRef.current ||
        isSettingsOpenRef.current
      ) {
        return;
      }

      const activeArea = isPreviewFocusModeRef.current
        ? "preview"
        : lastSearchAreaRef.current;

      if (searchSessionsRef.current[activeArea].isOpen) {
        event.preventDefault();
        closeSearch(activeArea);
        return;
      }

      if (isPreviewFocusModeRef.current) {
        event.preventDefault();
        exitPreviewFocusMode();
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    const saveTimer = window.setTimeout(() => {
      const didSave = saveStoredText(documentNoteStorageKey, note);
      setNoteSaveStatus(didSave ? "saved" : "error");
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [documentNoteStorageKey, note]);

  useEffect(() => {
    const insetQuery = window.matchMedia("(min-width: 1280px)");
    const updateOutlineMode = () => setIsOutlineInset(insetQuery.matches);

    updateOutlineMode();
    insetQuery.addEventListener("change", updateOutlineMode);
    return () => insetQuery.removeEventListener("change", updateOutlineMode);
  }, []);

  useEffect(() => {
    if (!isOutlineOpen) {
      return;
    }

    function handleOutlineKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || isSettingsOpenRef.current) {
        return;
      }

      event.preventDefault();
      handleOutlineClose();
    }

    window.addEventListener("keydown", handleOutlineKeyDown);
    return () => window.removeEventListener("keydown", handleOutlineKeyDown);
  }, [isOutlineOpen]);

  useEffect(() => {
    if (!isOutlineInset && isOutlineOpen && isSettingsOpen) {
      const shouldRestoreSettingsFocus =
        document.activeElement instanceof Node &&
        settingsRef.current?.contains(document.activeElement);
      setIsSettingsOpen(false);

      if (shouldRestoreSettingsFocus) {
        window.requestAnimationFrame(() => settingsButtonRef.current?.focus());
      }
    }
  }, [isOutlineInset, isOutlineOpen, isSettingsOpen]);

  useEffect(() => {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      applySplit(requestedSplitPercentRef.current);
    });

    resizeObserver.observe(workspace);
    return () => resizeObserver.disconnect();
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

  function applySplit(requestedPercent: number) {
    const workspace = workspaceRef.current;

    if (!workspace) {
      return;
    }

    const workspaceWidth = workspace.getBoundingClientRect().width;
    const isStacked = window.matchMedia("(max-width: 720px)").matches;
    let appliedPercent = 50;

    if (!isStacked && workspaceWidth > minimumPaneWidth * 2 + dividerWidth) {
      const minimumPercent = (minimumPaneWidth / workspaceWidth) * 100;
      const maximumPercent =
        ((workspaceWidth - dividerWidth - minimumPaneWidth) / workspaceWidth) *
        100;
      appliedPercent = Math.min(
        maximumPercent,
        Math.max(minimumPercent, requestedPercent),
      );
    }

    workspace.style.setProperty("--left-pane-width", `${appliedPercent}%`);
    appliedSplitPercentRef.current = appliedPercent;
    dividerRef.current?.setAttribute(
      "aria-valuenow",
      Math.round(appliedPercent).toString(),
    );
  }

  function updateSplit(nextPercent: number) {
    requestedSplitPercentRef.current = nextPercent;
    applySplit(nextPercent);
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
    let nextPercent = appliedSplitPercentRef.current;

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

  function selectReadingFont(nextFont: ReadingFont) {
    setReadingFont(nextFont);
    savePreference(fontStorageKey, nextFont);
  }

  function selectLineSpacing(nextSpacing: LineSpacing) {
    setLineSpacing(nextSpacing);
    savePreference(lineSpacingStorageKey, nextSpacing);
  }

  function toggleScrollSync() {
    setScrollSyncPreference((currentPreference) => {
      const nextPreference = currentPreference === "on" ? "off" : "on";
      savePreference(scrollSyncStorageKey, nextPreference);
      return nextPreference;
    });
  }

  function handleNoteChange(value: string) {
    setNote(value);
    setNoteSaveStatus("saving");
  }

  function requestSourceFocus(mode: "editor" | "notes") {
    const existingElement = contentElementsRef.current[mode];

    if (existingElement instanceof HTMLTextAreaElement) {
      pendingSourceFocusRef.current = null;
      existingElement.focus({ preventScroll: true });
    } else {
      pendingSourceFocusRef.current = mode;
    }
  }

  function captureCurrentSourceScroll() {
    const area = isNotesOpenRef.current ? "notes" : "editor";
    const element = contentElementsRef.current[area];

    if (element instanceof HTMLTextAreaElement) {
      sourceScrollPositionsRef.current[area] = element.scrollTop;
    }
  }

  function selectSourceMode(mode: "editor" | "notes") {
    setIsSettingsOpen(false);
    captureCurrentSourceScroll();
    requestSourceFocus(mode);
    setIsNotesOpen(mode === "notes");
    isNotesOpenRef.current = mode === "notes";
    lastSearchAreaRef.current = mode;
  }

  function updateSearchSession(
    area: SearchArea,
    patch: Partial<SearchSession>,
  ) {
    setSearchSessions((currentSessions) => ({
      ...currentSessions,
      [area]: { ...currentSessions[area], ...patch },
    }));
  }

  function activateSearchArea(area: SearchArea) {
    lastSearchAreaRef.current = area;
  }

  function captureSearchSnapshot(area: SearchArea): SearchSnapshot {
    const contentElement = contentElementsRef.current[area];
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const paneElement = contentElement?.closest(".pane");
    const activeElementKind =
      activeElement === contentElement
        ? "content"
        : activeElement?.matches(".pane-search-trigger") &&
            paneElement?.contains(activeElement)
          ? "search-trigger"
          : activeElement && paneElement?.contains(activeElement)
            ? "area-element"
            : "external";

    if (contentElement instanceof HTMLTextAreaElement) {
      return {
        activeElement,
        activeElementKind,
        selectionStart: contentElement.selectionStart,
        selectionEnd: contentElement.selectionEnd,
        selectionDirection: contentElement.selectionDirection ?? "none",
        scrollTop: contentElement.scrollTop,
        scrollLeft: contentElement.scrollLeft,
      };
    }

    return {
      activeElement,
      activeElementKind,
      scrollTop: contentElement?.scrollTop ?? 0,
      scrollLeft: contentElement?.scrollLeft ?? 0,
      nestedScrollPositions:
        contentElement instanceof HTMLDivElement
          ? Array.from(
              contentElement.querySelectorAll<HTMLElement>(
                ".markdown-body pre, .markdown-body .table-scroll",
              ),
              (element) => ({
                scrollTop: element.scrollTop,
                scrollLeft: element.scrollLeft,
              }),
            )
          : undefined,
    };
  }

  function openSearch(area: SearchArea) {
    lastSearchAreaRef.current = area;

    if (searchSessionsRef.current[area].isOpen) {
      window.requestAnimationFrame(() => {
        const input = searchInputElementsRef.current[area];
        input?.focus({ preventScroll: true });
        input?.select();
      });
      return;
    }

    searchSnapshotsRef.current[area] = captureSearchSnapshot(area);
    updateSearchSession(area, { isOpen: true });
  }

  function closeSearch(area: SearchArea) {
    const snapshot = searchSnapshotsRef.current[area];
    updateSearchSession(area, { isOpen: false });

    window.requestAnimationFrame(() => {
      const contentElement = contentElementsRef.current[area];

      if (contentElement instanceof HTMLTextAreaElement && snapshot) {
        contentElement.setSelectionRange(
          snapshot.selectionStart ?? 0,
          snapshot.selectionEnd ?? 0,
          snapshot.selectionDirection,
        );
      }

      if (contentElement && snapshot) {
        contentElement.scrollTop = snapshot.scrollTop;
        contentElement.scrollLeft = snapshot.scrollLeft;
      }

      const currentNestedScrollElements =
        contentElement instanceof HTMLDivElement
          ? contentElement.querySelectorAll<HTMLElement>(
              ".markdown-body pre, .markdown-body .table-scroll",
            )
          : [];

      snapshot?.nestedScrollPositions?.forEach((nestedPosition, index) => {
        const element = currentNestedScrollElements[index];

        if (element) {
          element.scrollTop = nestedPosition.scrollTop;
          element.scrollLeft = nestedPosition.scrollLeft;
        }
      });

      const currentPaneElement = contentElement?.closest(".pane");
      const isSnapshotElementInCurrentArea = Boolean(
        snapshot?.activeElement?.isConnected &&
          currentPaneElement?.contains(snapshot.activeElement),
      );
      const focusTarget =
        snapshot?.activeElementKind === "search-trigger"
          ? currentPaneElement?.querySelector<HTMLElement>(
              ".pane-search-trigger",
            )
          : snapshot?.activeElementKind === "content"
            ? contentElement
            : snapshot?.activeElementKind === "external" &&
                snapshot.activeElement?.isConnected
              ? snapshot.activeElement
              : isSnapshotElementInCurrentArea
                ? snapshot?.activeElement
                : contentElement;
      focusTarget?.focus({ preventScroll: true });
      delete searchSnapshotsRef.current[area];
    });
  }

  function resetSearchSessions() {
    setSearchSessions(createEmptySearchSessions());
    searchSnapshotsRef.current = {};
    lastSearchAreaRef.current = "preview";
    CSS.highlights?.delete("aster-preview-search-match");
    CSS.highlights?.delete("aster-preview-search-current");
  }

  function swapPanes() {
    captureCurrentSourceScroll();
    setLeftPane((currentPane) => oppositePane[currentPane]);

    if (window.matchMedia("(min-width: 721px)").matches) {
      updateSplit(100 - requestedSplitPercentRef.current);
    }
  }

  function capturePreviewScrollProgress(): PreviewScrollProgress | null {
    const previewElement = contentElementsRef.current.preview;

    if (!(previewElement instanceof HTMLDivElement)) {
      return null;
    }

    return {
      outer: getScrollProgress(previewElement),
      nested: Array.from(
        previewElement.querySelectorAll<HTMLElement>(
          ".markdown-body pre, .markdown-body .table-scroll",
        ),
        getScrollProgress,
      ),
    };
  }

  function restorePreviewScrollProgress(
    progress: PreviewScrollProgress | null,
  ) {
    const previewElement = contentElementsRef.current.preview;

    if (!(previewElement instanceof HTMLDivElement) || !progress) {
      return;
    }

    restoreScrollProgress(previewElement, progress.outer);
    const nestedElements = previewElement.querySelectorAll<HTMLElement>(
      ".markdown-body pre, .markdown-body .table-scroll",
    );

    progress.nested.forEach((nestedProgress, index) => {
      const element = nestedElements[index];

      if (element) {
        restoreScrollProgress(element, nestedProgress);
      }
    });
  }

  function enterPreviewFocusMode() {
    const previewScrollProgress = capturePreviewScrollProgress();
    suppressScrollSyncRestore();
    previewFocusReturnAreaRef.current = lastSearchAreaRef.current;
    setIsSettingsOpen(false);
    setIsPreviewFocusMode(true);
    lastSearchAreaRef.current = "preview";

    window.requestAnimationFrame(() => {
      restorePreviewScrollProgress(previewScrollProgress);
      contentElementsRef.current.preview?.focus({ preventScroll: true });
    });
  }

  function exitPreviewFocusMode() {
    const previewScrollProgress = capturePreviewScrollProgress();
    suppressScrollSyncRestore();
    const returnArea = previewFocusReturnAreaRef.current;
    setIsPreviewFocusMode(false);
    lastSearchAreaRef.current = returnArea;

    window.requestAnimationFrame(() => {
      restorePreviewScrollProgress(previewScrollProgress);
      contentElementsRef.current[returnArea]?.focus({ preventScroll: true });
    });
  }

  function togglePreviewFocusMode() {
    if (isPreviewFocusModeRef.current) {
      exitPreviewFocusMode();
    } else {
      enterPreviewFocusMode();
    }
  }

  function handleOutlineClose() {
    setIsOutlineOpen(false);
    window.requestAnimationFrame(() => outlineButtonRef.current?.focus());
  }

  function handleOutlineNavigate(headingId: string, shouldMoveFocus: boolean) {
    const heading = navigateToHeading(headingId);

    if (!heading || isOutlineInset) {
      return;
    }

    setIsOutlineOpen(false);

    if (shouldMoveFocus) {
      window.requestAnimationFrame(() =>
        heading.focus({ preventScroll: true }),
      );
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
      resetSearchSessions();
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
            <AsterBrandIcon />
          </span>
          <span>Aster</span>
        </div>
        <span className="document-name" title={documentPath ?? documentName}>
          {documentName}
        </span>
        <div className="header-actions">
          <button
            ref={outlineButtonRef}
            className="header-icon-button outline-trigger"
            type="button"
            aria-label={isOutlineOpen ? "문서 목차 닫기" : "문서 목차 열기"}
            aria-expanded={isOutlineOpen}
            aria-controls="document-outline"
            title={isOutlineOpen ? "문서 목차 닫기" : "문서 목차 열기"}
            onClick={() => {
              if (!isOutlineInset) {
                setIsSettingsOpen(false);
              }

              setIsOutlineOpen((isOpen) => !isOpen);
            }}
          >
            <DocumentOutlineIcon />
          </button>
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
              onClick={() => {
                if (!isOutlineInset) {
                  setIsOutlineOpen(false);
                }

                setIsSettingsOpen((isOpen) => !isOpen);
              }}
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

                <div className="settings-group">
                  <span className="settings-label">글꼴</span>
                  <ReadingFontSelect
                    value={readingFont}
                    onChange={selectReadingFont}
                  />
                </div>

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

      <div className={`document-stage${isOutlineOpen ? " has-outline" : ""}`}>
        {isOutlineOpen ? (
          <>
            <DocumentOutline
              items={outlineItems}
              activeHeadingId={activeHeadingId}
              documentKey={documentPath ?? "untitled"}
              isModal={!isOutlineInset}
              onClose={handleOutlineClose}
              onNavigate={handleOutlineNavigate}
            />
            <button
              type="button"
              className="outline-scrim"
              tabIndex={-1}
              aria-label="목차 닫기"
              onClick={handleOutlineClose}
            />
          </>
        ) : null}

        <main
          ref={workspaceRef}
          className={`workspace${isPreviewFocusMode ? " is-preview-focus" : ""}`}
          inert={isOutlineOpen && !isOutlineInset}
        >
          <Pane
            side="left"
            activePane={leftPaneContent}
            markdown={markdown}
            note={note}
            noteSaveStatus={noteSaveStatus}
            previewMarkdown={deferredMarkdown}
            isPreviewUpdating={isPreviewUpdating}
            isPreviewFocusMode={isPreviewFocusMode}
            isHiddenByPreviewFocus={
              isPreviewFocusMode && leftPaneContent !== "preview"
            }
            onMarkdownChange={setMarkdown}
            onNoteChange={handleNoteChange}
            onSourceModeChange={selectSourceMode}
            onPreviewScrollElementChange={setPreviewScrollElement}
            searchSession={searchSessions[leftPaneContent]}
            onSearchOpen={openSearch}
            onSearchClose={closeSearch}
            onSearchChange={updateSearchSession}
            onSearchAreaActivate={activateSearchArea}
            onSearchInputElementChange={handleSearchInputElementChange}
            onContentElementChange={handleContentElementChange}
            onPreviewFocusModeToggle={togglePreviewFocusMode}
            isScrollSyncEnabled={isScrollSyncEnabled}
            onScrollSyncToggle={toggleScrollSync}
          />
          <div
            className="pane-divider"
            aria-hidden={isPreviewFocusMode || undefined}
            inert={isPreviewFocusMode}
          >
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
              aria-label={
                isNotesOpen
                  ? "메모와 미리보기 위치 바꾸기"
                  : "마크다운과 미리보기 위치 바꾸기"
              }
              title={
                isNotesOpen
                  ? "메모와 미리보기 위치 바꾸기"
                  : "마크다운과 미리보기 위치 바꾸기"
              }
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
            isPreviewFocusMode={isPreviewFocusMode}
            isHiddenByPreviewFocus={
              isPreviewFocusMode && rightPaneContent !== "preview"
            }
            onMarkdownChange={setMarkdown}
            onNoteChange={handleNoteChange}
            onSourceModeChange={selectSourceMode}
            onPreviewScrollElementChange={setPreviewScrollElement}
            searchSession={searchSessions[rightPaneContent]}
            onSearchOpen={openSearch}
            onSearchClose={closeSearch}
            onSearchChange={updateSearchSession}
            onSearchAreaActivate={activateSearchArea}
            onSearchInputElementChange={handleSearchInputElementChange}
            onContentElementChange={handleContentElementChange}
            onPreviewFocusModeToggle={togglePreviewFocusMode}
            isScrollSyncEnabled={isScrollSyncEnabled}
            onScrollSyncToggle={toggleScrollSync}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
