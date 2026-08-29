import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
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
  type PaneContent,
  type PaneKind,
} from "./components/WorkspacePane";
import { useActiveHeading } from "./hooks/useActiveHeading";
import { usePaneSplit } from "./hooks/usePaneSplit";
import { useScrollSync } from "./hooks/useScrollSync";
import { useWorkspaceSearch } from "./hooks/useWorkspaceSearch";
import type { RecentDocument } from "./features/documents/recent-documents";
import { ExternalFileNotice } from "./features/documents/ExternalFileNotice";
import { useDocumentSession } from "./features/documents/useDocumentSession";
import { getMarkdownOutline } from "./lib/markdown-outline";
import {
  type SearchArea,
} from "./lib/text-search";
import {
  createWorkspaceInteractionState,
  getEscapeOwner,
  workspaceInteractionReducer,
} from "./lib/workspace-interactions";
import {
  createAppEventChannel,
  type AppEventChannel,
} from "./shared/app-events";
import "./styles/base.css";
import "./App.css";

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

function App() {
  const appEventsRef = useRef<AppEventChannel | null>(null);
  if (appEventsRef.current === null) {
    appEventsRef.current = createAppEventChannel();
  }
  const appEvents = appEventsRef.current;
  const documentSession = useDocumentSession({ events: appEvents });
  const {
    document: { markdown, name: documentName, path: documentPath },
    note: { value: note, saveStatus: noteSaveStatus },
    recent: {
      documents: recentDocuments,
      unavailablePaths: unavailableRecentDocumentPaths,
      persistenceLimited: isRecentDocumentPersistenceLimited,
    },
    externalFileState,
    visibleExternalFileState,
    isReloading: isReloadingFile,
    isBusy: isDocumentBusy,
    editMarkdown: handleMarkdownChange,
    editNote: handleNoteChange,
    openFromPicker,
    openDocument,
    reloadDocument: handleReloadExternalFile,
    dismissExternalFileNotice,
  } = documentSession;
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
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
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
  const readingZoomStyle = {
    "--reading-font-size": `${(17 * Number(readingZoom)) / 100}px`,
  } as CSSProperties;
  stageSidebarRef.current = stageSidebar;
  isSidebarInsetRef.current = isSidebarInset;
  isSettingsOpenRef.current = isSettingsOpen;
  isPanelLayoutMenuOpenRef.current = isPanelLayoutMenuOpen;
  isNotesOpenRef.current = isNotesOpen;
  isPreviewFocusModeRef.current = isPreviewFocusMode;
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

  useEffect(() => {
    const unsubscribeDocumentCommitted = appEvents.subscribe(
      "document-committed",
      () => {
        const shouldRestoreRecentFocus = stageSidebarRef.current === "recent";
        resetSearchSessions();
        stageSidebarRef.current = null;
        dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });
        if (shouldRestoreRecentFocus) {
          window.requestAnimationFrame(() =>
            recentDocumentsButtonRef.current?.focus(),
          );
        }
      },
    );
    const unsubscribeOpenSettled = appEvents.subscribe(
      "document-open-settled",
      ({ source, outcome }) => {
        if (source !== "recent" || outcome !== "current") {
          return;
        }
        stageSidebarRef.current = null;
        dispatchWorkspaceInteraction({ type: "close-stage-sidebar" });
        window.requestAnimationFrame(() =>
          recentDocumentsButtonRef.current?.focus(),
        );
      },
    );
    const unsubscribeExternalWillShow = appEvents.subscribe(
      "external-notice-will-show",
      () => {
        if (document.activeElement instanceof HTMLElement) {
          externalFileNoticeReturnFocusRef.current = document.activeElement;
        }
      },
    );
    const unsubscribeExternalDismissed = appEvents.subscribe(
      "external-notice-dismissed",
      () => {
        const returnFocusElement = externalFileNoticeReturnFocusRef.current;
        window.requestAnimationFrame(() => {
          if (returnFocusElement?.isConnected) {
            returnFocusElement.focus({ preventScroll: true });
          } else {
            contentElementsRef.current[lastSearchAreaRef.current]?.focus({
              preventScroll: true,
            });
          }
        });
      },
    );

    return () => {
      unsubscribeDocumentCommitted();
      unsubscribeOpenSettled();
      unsubscribeExternalWillShow();
      unsubscribeExternalDismissed();
    };
  }, [appEvents, resetSearchSessions]);
  const openPanelLayoutMenu = useCallback(() => {
    dispatchWorkspaceInteraction({ type: "open-panel-layout-menu" });
  }, []);
  const closePanelLayoutMenu = useCallback(() => {
    dispatchWorkspaceInteraction({ type: "close-panel-layout-menu" });
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
    dismissExternalFileNotice();
  }

  function handleRecentDocumentSelect(document: RecentDocument) {
    void openDocument(document.path, "recent");
  }


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
        isBusy={isDocumentBusy}
        isSettingsOpen={isSettingsOpen}
        recentDocumentsButtonRef={recentDocumentsButtonRef}
        outlineButtonRef={outlineButtonRef}
        settingsRef={settingsRef}
        settingsButtonRef={settingsButtonRef}
        onRecentDocumentsToggle={() => {
          const willOpen = stageSidebarRef.current !== "recent";
          dispatchWorkspaceInteraction({
            type: "toggle-stage-sidebar",
            sidebar: "recent",
          });
          if (willOpen) {
            appEvents.emit("recent-sidebar-opened", undefined);
          }
        }}
        onOutlineToggle={() =>
          dispatchWorkspaceInteraction({
            type: "toggle-stage-sidebar",
            sidebar: "outline",
          })
        }
        onOpenFile={() => void openFromPicker("picker")}
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
        isBusy={isDocumentBusy}
        isRecentDocumentPersistenceLimited={
          isRecentDocumentPersistenceLimited
        }
        outlineItems={outlineItems}
        activeHeadingId={activeHeadingId}
        onDocumentSidebarClose={handleDocumentSidebarClose}
        onOpenFile={() => void openFromPicker("picker")}
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
