import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { AppHeader } from "./components/AppHeader";
import { DocumentStage } from "./components/DocumentStage";
import { PaneDivider } from "./components/PaneDivider";
import {
  lineSpacings,
  readingFonts,
  readingZoomLevels,
  themes,
  ReadingSettings,
  type LineSpacing,
  type ReadingFont,
  type ReadingZoom,
  type Theme,
} from "./components/ReadingSettings";
import {
  WorkspacePane,
  type NoteSaveStatus,
  type PaneContent,
  type PaneKind,
} from "./components/WorkspacePane";
import { useActiveHeading } from "./hooks/useActiveHeading";
import { usePaneSplit } from "./hooks/usePaneSplit";
import { useScrollSync } from "./hooks/useScrollSync";
import { useWorkspaceSearch } from "./hooks/useWorkspaceSearch";
import {
  useExternalFileStatus,
  type ExternalFileState,
} from "./hooks/useExternalFileStatus";
import {
  getDocumentNoteStorageKey,
  hasUnsavedMarkdown,
  isDocumentContextCurrent,
  loadDocumentNote,
  saveDocumentNote,
  untitledDocumentNoteStorageKey,
} from "./lib/document-session";
import { getMarkdownOutline } from "./lib/markdown-outline";
import {
  loadRecentDocuments,
  promoteRecentDocument,
  saveRecentDocuments,
  type RecentDocument,
} from "./lib/recent-documents";
import {
  type SearchArea,
} from "./lib/text-search";
import {
  createWorkspaceInteractionState,
  getEscapeOwner,
  workspaceInteractionReducer,
} from "./lib/workspace-interactions";
import {
  chooseMarkdownFilePath,
  confirmDocumentSwitchDiscard,
  confirmReloadDiscard,
  getMarkdownFileStatus,
  isDesktopRuntime,
  readMarkdownFile,
  showMarkdownMessage,
  type OpenedMarkdownFile,
} from "./services/markdown-files";
import "./styles/base.css";
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

const themeStorageKey = "aster:theme:v1";
const fontStorageKey = "aster:reading-font:v1";
const lineSpacingStorageKey = "aster:line-spacing:v1";
const readingZoomStorageKey = "aster:reading-zoom:v1";
const scrollSyncStorageKey = "aster:scroll-sync:v1";

const scrollSyncOptions = [{ value: "off" }, { value: "on" }] as const;

type ScrollSyncPreference = (typeof scrollSyncOptions)[number]["value"];
type ReadingZoomCommand = "in" | "out" | "reset";

function isEventInsideStageSidebar(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("#document-outline, #document-sidebar"))
  );
}
type DocumentOperation = "open" | "reload";

type ScrollProgress = {
  top: number;
  left: number;
};

type PreviewScrollProgress = {
  outer: ScrollProgress;
  nested: ScrollProgress[];
};

const oppositePane: Record<PaneKind, PaneKind> = {
  editor: "preview",
  preview: "editor",
};

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

function FileChangeIcon({ kind }: { kind: ExternalFileState["kind"] }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {kind === "modified" ? (
        <>
          <path d="M10 3.25a6.75 6.75 0 1 0 6.2 4.08" />
          <path d="M13.25 3.25H16.5V6.5M16.5 3.25l-3.7 3.7" />
        </>
      ) : (
        <>
          <path d="M10 3.25 17 16H3L10 3.25Z" />
          <path d="M10 7.4v4.2M10 14.1v.1" />
        </>
      )}
    </svg>
  );
}

type ExternalFileNoticeProps = {
  state: ExternalFileState;
  isReloading: boolean;
  noticeRef: RefObject<HTMLElement | null>;
  onReload: () => void;
  onDismiss: () => void;
};

function ExternalFileNotice({
  state,
  isReloading,
  noticeRef,
  onReload,
  onDismiss,
}: ExternalFileNoticeProps) {
  const messageText =
    state.kind === "modified"
      ? "원본 파일이 다른 앱에서 변경되었습니다."
      : "원본 파일을 확인할 수 없습니다. 현재 내용은 그대로 유지됩니다.";

  return (
    <aside
      ref={noticeRef}
      className={`external-file-notice is-${state.kind}`}
      aria-label="원본 파일 상태"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onDismiss();
        }
      }}
    >
      <span className="external-file-notice-icon">
        <FileChangeIcon kind={state.kind} />
      </span>
      <span className="external-file-notice-message" role="status" aria-live="polite">
        <strong>{state.kind === "modified" ? "새 변경 사항" : "파일 연결 끊김"}</strong>
        <span>{messageText}</span>
      </span>
      <button
        type="button"
        className="external-file-reload"
        disabled={isReloading}
        onClick={onReload}
      >
        {isReloading
          ? "확인 중…"
          : state.kind === "modified"
            ? "다시 불러오기"
            : "다시 확인"}
      </button>
      <button
        type="button"
        className="external-file-dismiss"
        aria-label="원본 파일 상태 알림 닫기"
        title="닫기"
        onClick={onDismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}

function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [loadedMarkdown, setLoadedMarkdown] = useState<string | null>(null);
  const [loadedRevision, setLoadedRevision] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("새 문서.md");
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [isReloadingFile, setIsReloadingFile] = useState(false);
  const [workspaceInteraction, dispatchWorkspaceInteraction] = useReducer(
    workspaceInteractionReducer,
    undefined,
    () =>
      createWorkspaceInteractionState(
        window.matchMedia("(min-width: 1280px)").matches,
      ),
  );
  const {
    stageSidebar,
    isPreviewFocusMode,
    isSidebarInset,
    isNotesOpen,
    isSettingsOpen,
    isPanelLayoutMenuOpen,
  } = workspaceInteraction;
  const [recentDocuments, setRecentDocuments] = useState<RecentDocument[]>(
    loadRecentDocuments,
  );
  const [unavailableRecentDocumentPaths, setUnavailableRecentDocumentPaths] =
    useState<Set<string>>(() => new Set());
  const [
    isRecentDocumentPersistenceLimited,
    setIsRecentDocumentPersistenceLimited,
  ] = useState(false);
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const [note, setNote] = useState(() =>
    loadDocumentNote(untitledDocumentNoteStorageKey),
  );
  const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>("saved");
  const [isWorkspaceStacked, setIsWorkspaceStacked] = useState(() =>
    window.matchMedia("(max-width: 720px)").matches,
  );
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
  const splitGuideRef = useRef<HTMLDivElement>(null);
  const outlineButtonRef = useRef<HTMLButtonElement>(null);
  const recentDocumentsButtonRef = useRef<HTMLButtonElement>(null);
  const externalFileNoticeRef = useRef<HTMLElement>(null);
  const externalFileNoticeReturnFocusRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const openFileRef = useRef<() => void>(() => undefined);
  const documentOperationRef = useRef<DocumentOperation | null>(null);
  const markdownRef = useRef(markdown);
  const loadedMarkdownRef = useRef(loadedMarkdown);
  const noteRef = useRef(note);
  const documentPathRef = useRef(documentPath);
  const documentGenerationRef = useRef(0);
  const markdownEditVersionRef = useRef(0);
  const recentDocumentsRef = useRef(recentDocuments);
  const recentStatusBatchRef = useRef(0);
  const sourceScrollPositionsRef = useRef({ editor: 0, notes: 0 });
  const pendingSourceFocusRef = useRef<"editor" | "notes" | null>(null);
  const stageSidebarRef = useRef(stageSidebar);
  const isSidebarInsetRef = useRef(isSidebarInset);
  const isSettingsOpenRef = useRef(isSettingsOpen);
  const isPanelLayoutMenuOpenRef = useRef(isPanelLayoutMenuOpen);
  const isNotesOpenRef = useRef(isNotesOpen);
  const isPreviewFocusModeRef = useRef(isPreviewFocusMode);
  const previewFocusReturnAreaRef = useRef<SearchArea>("preview");
  const {
    updateSplit,
    swapSplit,
    handleDividerKeyDown,
    handleDividerPointerDown,
    handleDividerPointerMove,
    handleDividerPointerUp,
    handleDividerPointerCancel,
    handleDividerLostPointerCapture,
  } = usePaneSplit({
    workspaceRef,
    dividerRef,
    splitGuideRef,
    isPreviewFocusMode,
  });
  const {
    externalFileState,
    visibleExternalFileState,
    setExternalFileState,
    setDismissedExternalObservationKey,
    resetExternalFileStatus,
  } = useExternalFileStatus({
    documentPath,
    loadedRevision,
    onBeforeNotice: () => {
      if (document.activeElement instanceof HTMLElement) {
        externalFileNoticeReturnFocusRef.current = document.activeElement;
      }
    },
  });
  const [previewScrollElement, setPreviewScrollElement] =
    useState<HTMLDivElement | null>(null);
  const [editorScrollElement, setEditorScrollElement] =
    useState<HTMLTextAreaElement | null>(null);
  const {
    searchSessions,
    searchSessionsRef,
    lastSearchAreaRef,
    searchSnapshotsRef,
    searchInputElementsRef,
    contentElementsRef,
    updateSearchSession,
    activateSearchArea,
    openSearch,
    closeSearch,
    closeSourceSearchesForPreviewFocus,
    restorePendingSourceSearchSnapshot,
    resetSearchSessions,
  } = useWorkspaceSearch(dismissNonPersistentStageSidebar);
  const deferredMarkdown = useDeferredValue(markdown);
  const isOutlineOpen = stageSidebar === "outline";
  const isRecentDocumentsOpen = stageSidebar === "recent";
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
  stageSidebarRef.current = stageSidebar;
  isSidebarInsetRef.current = isSidebarInset;
  isSettingsOpenRef.current = isSettingsOpen;
  isPanelLayoutMenuOpenRef.current = isPanelLayoutMenuOpen;
  isNotesOpenRef.current = isNotesOpen;
  isPreviewFocusModeRef.current = isPreviewFocusMode;
  markdownRef.current = markdown;
  loadedMarkdownRef.current = loadedMarkdown;
  noteRef.current = note;
  documentPathRef.current = documentPath;
  recentDocumentsRef.current = recentDocuments;
  const isScrollSyncEnabled = scrollSyncPreference === "on";
  const isScrollSyncAvailable = !isNotesOpen && !isPreviewFocusMode;
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
        const pendingSearchSnapshot =
          !searchSessionsRef.current[area].isOpen
            ? searchSnapshotsRef.current[area]
            : undefined;
        const restoredScrollTop =
          pendingSearchSnapshot?.scrollTop ??
          sourceScrollPositionsRef.current[area];
        suppressScrollSyncRestore();
        if (pendingSearchSnapshot) {
          const restoredScrollTop = restorePendingSourceSearchSnapshot(
            area,
            element,
          );
          if (restoredScrollTop !== null) {
            sourceScrollPositionsRef.current[area] = restoredScrollTop;
          }
        } else {
          element.scrollTop = restoredScrollTop;
          element.scrollLeft = 0;
        }

        window.requestAnimationFrame(() => {
          if (element.isConnected) {
            element.scrollTop = restoredScrollTop;
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
  const openPanelLayoutMenu = useCallback(() => {
    dispatchWorkspaceInteraction({ type: "open-panel-layout-menu" });
  }, []);
  const closePanelLayoutMenu = useCallback(() => {
    dispatchWorkspaceInteraction({ type: "close-panel-layout-menu" });
  }, []);

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

      dismissNonPersistentStageSidebar();
      captureCurrentSourceScroll();
      const willOpen = !isNotesOpenRef.current;
      const nextArea = willOpen ? "notes" : "editor";
      requestSourceFocus(nextArea);
      isNotesOpenRef.current = willOpen;
      dispatchWorkspaceInteraction({
        type: "set-notes-open",
        isOpen: willOpen,
      });
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
        dispatchWorkspaceInteraction({ type: "close-settings" });
        dispatchWorkspaceInteraction({ type: "close-panel-layout-menu" });
        openSearch(
          isPreviewFocusModeRef.current
            ? "preview"
            : lastSearchAreaRef.current,
        );
        return;
      }

      const activeArea = isPreviewFocusModeRef.current
        ? "preview"
        : lastSearchAreaRef.current;
      const hasWorkspaceLayer =
        searchSessionsRef.current[activeArea].isOpen ||
        isPreviewFocusModeRef.current;

      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isSettingsOpenRef.current ||
        isPanelLayoutMenuOpenRef.current ||
        getEscapeOwner({
          hasStageSidebar: stageSidebarRef.current !== null,
          isSidebarInset: isSidebarInsetRef.current,
          isEventInsideSidebar: isEventInsideStageSidebar(event.target),
          hasWorkspaceLayer,
        }) !== "workspace"
      ) {
        return;
      }

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
      const didSave = saveDocumentNote(documentNoteStorageKey, note);
      setNoteSaveStatus(didSave ? "saved" : "error");
    }, 350);

    return () => window.clearTimeout(saveTimer);
  }, [documentNoteStorageKey, note]);

  useEffect(() => {
    const insetQuery = window.matchMedia("(min-width: 1280px)");
    const updateSidebarMode = () => {
      const nextIsSidebarInset = insetQuery.matches;

      isSidebarInsetRef.current = nextIsSidebarInset;
      dispatchWorkspaceInteraction({
        type: "set-sidebar-inset",
        isInset: nextIsSidebarInset,
      });
    };

    updateSidebarMode();
    insetQuery.addEventListener("change", updateSidebarMode);
    return () => insetQuery.removeEventListener("change", updateSidebarMode);
  }, []);

  useEffect(() => {
    const stackedQuery = window.matchMedia("(max-width: 720px)");
    const updateWorkspaceMode = () =>
      setIsWorkspaceStacked(stackedQuery.matches);

    updateWorkspaceMode();
    stackedQuery.addEventListener("change", updateWorkspaceMode);
    return () =>
      stackedQuery.removeEventListener("change", updateWorkspaceMode);
  }, []);

  useEffect(() => {
    if (!stageSidebar) {
      return;
    }

    function handleSidebarKeyDown(event: globalThis.KeyboardEvent) {
      const activeArea = isPreviewFocusModeRef.current
        ? "preview"
        : lastSearchAreaRef.current;
      const escapeOwner = getEscapeOwner({
        hasStageSidebar: true,
        isSidebarInset: isSidebarInsetRef.current,
        isEventInsideSidebar: isEventInsideStageSidebar(event.target),
        hasWorkspaceLayer:
          searchSessionsRef.current[activeArea].isOpen ||
          isPreviewFocusModeRef.current,
      });

      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isSettingsOpenRef.current ||
        isPanelLayoutMenuOpenRef.current ||
        escapeOwner !== "sidebar"
      ) {
        return;
      }

      event.preventDefault();
      if (stageSidebar === "outline") {
        handleOutlineClose();
      } else {
        handleDocumentSidebarClose();
      }
    }

    window.addEventListener("keydown", handleSidebarKeyDown);
    return () => window.removeEventListener("keydown", handleSidebarKeyDown);
  }, [stageSidebar]);

  useEffect(() => {
    if (!isRecentDocumentsOpen || !isDesktopRuntime()) {
      return;
    }

    const batch = recentStatusBatchRef.current + 1;
    recentStatusBatchRef.current = batch;
    let isDisposed = false;

    void Promise.all(
      recentDocuments.map(async (document) => {
        try {
          const status = await getMarkdownFileStatus(document.path);
          return { path: document.path, status };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (isDisposed || batch !== recentStatusBatchRef.current) {
        return;
      }

      const recentPaths = new Set(
        recentDocuments.map((document) => document.path),
      );
      setUnavailableRecentDocumentPaths((currentPaths) => {
        const nextPaths = new Set(
          Array.from(currentPaths).filter((path) => recentPaths.has(path)),
        );

        for (const result of results) {
          if (!result) {
            continue;
          }

          if (result.status.kind === "unavailable") {
            nextPaths.add(result.path);
          } else {
            nextPaths.delete(result.path);
          }
        }

        return nextPaths;
      });
    });

    return () => {
      isDisposed = true;
    };
  }, [isRecentDocumentsOpen, recentDocuments]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        dispatchWorkspaceInteraction({ type: "close-settings" });
      }
    }

    function handleSettingsKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      dispatchWorkspaceInteraction({ type: "close-settings" });
      settingsButtonRef.current?.focus();
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    window.addEventListener("keydown", handleSettingsKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.removeEventListener("keydown", handleSettingsKeyDown);
    };
  }, [isSettingsOpen]);

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

  function dismissNonPersistentStageSidebar() {
    const shouldPreserveOutline =
      stageSidebarRef.current === "outline" && isSidebarInsetRef.current;
    stageSidebarRef.current = shouldPreserveOutline ? "outline" : null;
    isSettingsOpenRef.current = false;
    isPanelLayoutMenuOpenRef.current = false;
    dispatchWorkspaceInteraction({ type: "start-document-action" });
  }

  function selectSourceMode(mode: "editor" | "notes") {
    dismissNonPersistentStageSidebar();
    captureCurrentSourceScroll();
    requestSourceFocus(mode);
    dispatchWorkspaceInteraction({
      type: "set-notes-open",
      isOpen: mode === "notes",
    });
    isNotesOpenRef.current = mode === "notes";
    lastSearchAreaRef.current = mode;
  }

  function swapPanes() {
    captureCurrentSourceScroll();
    setLeftPane((currentPane) => oppositePane[currentPane]);
    swapSplit();
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
    closeSourceSearchesForPreviewFocus();
    dismissNonPersistentStageSidebar();
    dispatchWorkspaceInteraction({ type: "set-preview-focus", isOpen: true });
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
    dispatchWorkspaceInteraction({ type: "set-preview-focus", isOpen: false });
    lastSearchAreaRef.current = returnArea;

    window.requestAnimationFrame(() => {
      restorePreviewScrollProgress(previewScrollProgress);
      const returnElement = contentElementsRef.current[returnArea];
      const restoredSourceScrollPositions = (["editor", "notes"] as const)
        .map((area) => {
          const element = contentElementsRef.current[area];
          const scrollTop =
            element instanceof HTMLTextAreaElement
              ? restorePendingSourceSearchSnapshot(area, element)
              : null;
          if (scrollTop !== null) {
            sourceScrollPositionsRef.current[area] = scrollTop;
          }
          return element instanceof HTMLTextAreaElement && scrollTop !== null
            ? { element, scrollTop, scrollLeft: element.scrollLeft }
            : null;
        })
        .filter((restoredPosition) => restoredPosition !== null);
      returnElement?.focus({ preventScroll: true });

      if (restoredSourceScrollPositions.length > 0) {
        window.requestAnimationFrame(() => {
          restoredSourceScrollPositions.forEach(
            ({ element, scrollTop, scrollLeft }) => {
              element.scrollTop = scrollTop;
              element.scrollLeft = scrollLeft;
            },
          );
        });
      }
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
    stageSidebarRef.current = null;
    dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });
    window.requestAnimationFrame(() => outlineButtonRef.current?.focus());
  }

  function handleDocumentSidebarClose() {
    stageSidebarRef.current = null;
    dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });
    window.requestAnimationFrame(() =>
      recentDocumentsButtonRef.current?.focus(),
    );
  }

  function handleOutlineNavigate(headingId: string, shouldMoveFocus: boolean) {
    const heading = navigateToHeading(headingId);

    if (!heading || isSidebarInset) {
      return;
    }

    stageSidebarRef.current = null;
    dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });

    if (shouldMoveFocus) {
      window.requestAnimationFrame(() =>
        heading.focus({ preventScroll: true }),
      );
    }
  }

  function handleExternalFileNoticeDismiss() {
    if (!externalFileState) {
      return;
    }

    const returnFocusElement = externalFileNoticeReturnFocusRef.current;
    setDismissedExternalObservationKey(externalFileState.observationKey);

    window.requestAnimationFrame(() => {
      if (returnFocusElement?.isConnected) {
        returnFocusElement.focus({ preventScroll: true });
      } else {
        contentElementsRef.current[lastSearchAreaRef.current]?.focus({
          preventScroll: true,
        });
      }
    });
  }

  function handleMarkdownChange(nextMarkdown: string) {
    markdownEditVersionRef.current += 1;
    markdownRef.current = nextMarkdown;
    setMarkdown(nextMarkdown);
  }

  async function handleReloadExternalFile() {
    if (!documentPath || documentOperationRef.current !== null) {
      return;
    }

    const pathToReload = documentPath;
    const documentGenerationToReload = documentGenerationRef.current;
    const reloadContext = {
      generation: documentGenerationToReload,
      path: pathToReload,
    };
    documentOperationRef.current = "reload";
    setIsReloadingFile(true);

    try {
      if (
        loadedMarkdownRef.current !== null &&
        markdownRef.current !== loadedMarkdownRef.current
      ) {
        const shouldReload = await confirmReloadDiscard();

        if (!shouldReload) {
          return;
        }
      }

      if (
        !isDocumentContextCurrent(
          {
            generation: documentGenerationRef.current,
            path: documentPathRef.current,
          },
          reloadContext,
        )
      ) {
        return;
      }

      const approvedMarkdownEditVersion = markdownEditVersionRef.current;

      const reloadedFile = await readMarkdownFile(pathToReload);

      if (
        !isDocumentContextCurrent(
          {
            generation: documentGenerationRef.current,
            path: documentPathRef.current,
          },
          reloadContext,
        )
      ) {
        return;
      }

      if (markdownEditVersionRef.current !== approvedMarkdownEditVersion) {
        try {
          await showMarkdownMessage(
            "다시 불러오는 동안 Markdown이 수정되어 현재 내용을 유지했습니다. 최신 원본을 적용하려면 다시 시도해 주세요.",
            {
              title: "현재 변경 내용 유지",
              kind: "info",
            },
          );
        } catch {
          console.info("다시 불러오는 동안 수정된 Markdown을 유지했습니다.");
        }
        return;
      }

      setDocumentName(reloadedFile.name);
      markdownRef.current = reloadedFile.content;
      setMarkdown(reloadedFile.content);
      loadedMarkdownRef.current = reloadedFile.content;
      setLoadedMarkdown(reloadedFile.content);
      setLoadedRevision(reloadedFile.revision);
      resetExternalFileStatus();
      resetSearchSessions();
    } catch (error) {
      if (
        !isDocumentContextCurrent(
          {
            generation: documentGenerationRef.current,
            path: documentPathRef.current,
          },
          reloadContext,
        )
      ) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const nextState: ExternalFileState = {
        kind: "unavailable",
        message: errorMessage,
        observationKey: `unavailable:${errorMessage}`,
      };
      setExternalFileState(nextState);
      setDismissedExternalObservationKey(null);
    } finally {
      if (documentOperationRef.current === "reload") {
        documentOperationRef.current = null;
      }
      setIsReloadingFile(false);
    }
  }

  async function showDocumentOpenError(error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await showMarkdownMessage(errorMessage, {
        title: "파일을 열 수 없습니다",
        kind: "error",
      });
    } catch {
      console.error("파일을 열 수 없습니다:", errorMessage);
    }
  }

  function promoteOpenedDocument(
    openedFile: OpenedMarkdownFile,
    requestedPath: string,
  ) {
    const nextRecentDocuments = promoteRecentDocument(
      recentDocumentsRef.current,
      { path: openedFile.path, name: openedFile.name },
      [requestedPath],
    );
    recentDocumentsRef.current = nextRecentDocuments;
    setRecentDocuments(nextRecentDocuments);
    setIsRecentDocumentPersistenceLimited(
      !saveRecentDocuments(nextRecentDocuments),
    );
    setUnavailableRecentDocumentPaths((currentPaths) => {
      const nextPaths = new Set(currentPaths);
      nextPaths.delete(requestedPath);
      nextPaths.delete(openedFile.path);
      return nextPaths;
    });
  }

  async function switchToMarkdownDocument(
    requestedPath: string,
    markUnavailableOnFailure: boolean,
  ) {
    let openedFile: OpenedMarkdownFile;

    try {
      openedFile = await readMarkdownFile(requestedPath);
    } catch (error) {
      if (markUnavailableOnFailure && isDesktopRuntime()) {
        try {
          const status = await getMarkdownFileStatus(requestedPath);
          setUnavailableRecentDocumentPaths((currentPaths) => {
            const nextPaths = new Set(currentPaths);

            if (status.kind === "unavailable") {
              nextPaths.add(requestedPath);
            } else {
              nextPaths.delete(requestedPath);
            }

            return nextPaths;
          });
        } catch {
          // Transport failures do not prove that the document is unavailable.
        }
      }

      await showDocumentOpenError(error);
      return;
    }

    const documentGenerationBeforeConfirmation =
      documentGenerationRef.current;
    const documentPathBeforeConfirmation = documentPathRef.current;
    const markdownEditVersionBeforeConfirmation =
      markdownEditVersionRef.current;
    const hasUnsavedChanges = hasUnsavedMarkdown(
      markdownRef.current,
      loadedMarkdownRef.current,
      initialMarkdown,
    );

    if (hasUnsavedChanges) {
      let shouldSwitch: boolean;

      try {
        shouldSwitch = await confirmDocumentSwitchDiscard();
      } catch (error) {
        await showDocumentOpenError(error);
        return;
      }

      if (!shouldSwitch) {
        return;
      }
    }

    if (
      !isDocumentContextCurrent(
        {
          generation: documentGenerationRef.current,
          path: documentPathRef.current,
          markdownEditVersion: markdownEditVersionRef.current,
        },
        {
          generation: documentGenerationBeforeConfirmation,
          path: documentPathBeforeConfirmation,
          markdownEditVersion: markdownEditVersionBeforeConfirmation,
        },
      )
    ) {
      return;
    }

    const currentNoteStorageKey = getDocumentNoteStorageKey(
      documentPathRef.current,
    );
    if (!saveDocumentNote(currentNoteStorageKey, noteRef.current)) {
      setNoteSaveStatus("error");
      try {
        await showMarkdownMessage(
          "현재 문서의 메모를 저장하지 못해 문서 전환을 중단했습니다. 저장 공간을 확인한 뒤 다시 시도해 주세요.",
          {
            title: "메모를 보존할 수 없습니다",
            kind: "error",
          },
        );
      } catch {
        console.error("메모를 저장하지 못해 문서 전환을 중단했습니다.");
      }
      return;
    }

    const shouldRestoreRecentFocus = stageSidebarRef.current === "recent";
    const nextNoteStorageKey = getDocumentNoteStorageKey(openedFile.path);
    documentGenerationRef.current += 1;
    setDocumentName(openedFile.name);
    documentPathRef.current = openedFile.path;
    setDocumentPath(openedFile.path);
    markdownRef.current = openedFile.content;
    setMarkdown(openedFile.content);
    loadedMarkdownRef.current = openedFile.content;
    setLoadedMarkdown(openedFile.content);
    setLoadedRevision(openedFile.revision);
    resetExternalFileStatus();
    const nextNote = loadDocumentNote(nextNoteStorageKey);
    noteRef.current = nextNote;
    setNote(nextNote);
    setNoteSaveStatus("saved");
    resetSearchSessions();
    promoteOpenedDocument(openedFile, requestedPath);
    stageSidebarRef.current = null;
    dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });

    if (shouldRestoreRecentFocus) {
      window.requestAnimationFrame(() =>
        recentDocumentsButtonRef.current?.focus(),
      );
    }
  }

  async function handleOpenFile() {
    if (documentOperationRef.current !== null) {
      return;
    }

    documentOperationRef.current = "open";
    setIsOpeningFile(true);

    try {
      const selectedPath = await chooseMarkdownFilePath();

      if (!selectedPath) {
        return;
      }

      await switchToMarkdownDocument(selectedPath, false);
    } catch (error) {
      await showDocumentOpenError(error);
    } finally {
      if (documentOperationRef.current === "open") {
        documentOperationRef.current = null;
      }
      setIsOpeningFile(false);
    }
  }

  async function handleRecentDocumentSelect(document: RecentDocument) {
    if (document.path === documentPathRef.current) {
      handleDocumentSidebarClose();
      return;
    }

    if (documentOperationRef.current !== null) {
      return;
    }

    documentOperationRef.current = "open";
    setIsOpeningFile(true);

    try {
      await switchToMarkdownDocument(document.path, true);
    } catch (error) {
      await showDocumentOpenError(error);
    } finally {
      if (documentOperationRef.current === "open") {
        documentOperationRef.current = null;
      }
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
      <AppHeader
        documentName={documentName}
        documentPath={documentPath}
        isRecentDocumentsOpen={isRecentDocumentsOpen}
        isOutlineOpen={isOutlineOpen}
        isBusy={isOpeningFile || isReloadingFile}
        isSettingsOpen={isSettingsOpen}
        recentDocumentsButtonRef={recentDocumentsButtonRef}
        outlineButtonRef={outlineButtonRef}
        settingsRef={settingsRef}
        settingsButtonRef={settingsButtonRef}
        onRecentDocumentsToggle={() =>
          dispatchWorkspaceInteraction({
            type: "toggle-stage-sidebar",
            sidebar: "recent",
          })
        }
        onOutlineToggle={() =>
          dispatchWorkspaceInteraction({
            type: "toggle-stage-sidebar",
            sidebar: "outline",
          })
        }
        onOpenFile={handleOpenFile}
        onSettingsToggle={() =>
          dispatchWorkspaceInteraction({ type: "toggle-settings" })
        }
        settings={
          <ReadingSettings
            theme={theme}
            readingFont={readingFont}
            lineSpacing={lineSpacing}
            onThemeChange={selectTheme}
            onReadingFontChange={selectReadingFont}
            onLineSpacingChange={selectLineSpacing}
          />
        }
      />

      <DocumentStage
        stageSidebar={stageSidebar}
        isSidebarInset={isSidebarInset}
        recentDocuments={recentDocuments}
        documentPath={documentPath}
        unavailableRecentDocumentPaths={unavailableRecentDocumentPaths}
        isBusy={isOpeningFile || isReloadingFile}
        isRecentDocumentPersistenceLimited={
          isRecentDocumentPersistenceLimited
        }
        outlineItems={outlineItems}
        activeHeadingId={activeHeadingId}
        onDocumentSidebarClose={handleDocumentSidebarClose}
        onOpenFile={handleOpenFile}
        onRecentDocumentSelect={handleRecentDocumentSelect}
        onOutlineClose={handleOutlineClose}
        onOutlineNavigate={handleOutlineNavigate}
      >
        <main
          ref={workspaceRef}
          className={`workspace${isPreviewFocusMode ? " is-preview-focus" : ""}`}
          inert={stageSidebar !== null && !isSidebarInset}
        >
          <div
            ref={splitGuideRef}
            className="split-resize-guide"
            aria-hidden="true"
          />
          <WorkspacePane
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
            onMarkdownChange={handleMarkdownChange}
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
          />
          <PaneDivider
            dividerRef={dividerRef}
            isPreviewFocusMode={isPreviewFocusMode}
            isMenuOpen={isPanelLayoutMenuOpen}
            isScrollSyncEnabled={isScrollSyncEnabled}
            isScrollSyncAvailable={isScrollSyncAvailable}
            isStacked={isWorkspaceStacked}
            onMenuOpen={openPanelLayoutMenu}
            onMenuClose={closePanelLayoutMenu}
            onScrollSyncToggle={toggleScrollSync}
            onSwapPanes={swapPanes}
            onResetSplit={() => updateSplit(50)}
            onKeyDown={handleDividerKeyDown}
            onPointerDown={handleDividerPointerDown}
            onPointerMove={handleDividerPointerMove}
            onPointerUp={handleDividerPointerUp}
            onPointerCancel={handleDividerPointerCancel}
            onLostPointerCapture={handleDividerLostPointerCapture}
          />
          <WorkspacePane
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
            onMarkdownChange={handleMarkdownChange}
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
          />
          {visibleExternalFileState ? (
            <ExternalFileNotice
              state={visibleExternalFileState}
              isReloading={isReloadingFile}
              noticeRef={externalFileNoticeRef}
              onReload={handleReloadExternalFile}
              onDismiss={handleExternalFileNoticeDismiss}
            />
          ) : null}
        </main>
      </DocumentStage>
    </div>
  );
}

export default App;
