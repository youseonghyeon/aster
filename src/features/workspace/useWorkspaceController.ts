import {
  useCallback,
  useDeferredValue,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { AppEventChannel } from "../../shared/app-events";
import { useActiveHeading } from "../../hooks/useActiveHeading";
import { usePaneSplit } from "../../hooks/usePaneSplit";
import { useScrollSync } from "../../hooks/useScrollSync";
import { getMarkdownOutline } from "../../lib/markdown-outline";
import type { SearchArea } from "../../lib/text-search";
import {
  createWorkspaceInteractionState,
  workspaceInteractionReducer,
} from "./workspace-interactions";
import { useWorkspaceSearch } from "./useWorkspaceSearch";
import { useWorkspaceEventBridge } from "./useWorkspaceEventBridge";
import { useWorkspaceResponsive } from "./useWorkspaceResponsive";
import { usePreviewFocusMode } from "./usePreviewFocusMode";
import { useWorkspaceKeyboardLayers } from "./useWorkspaceKeyboardLayers";
import type { PaneContent, PaneKind } from "./workspace-types";

const oppositePane: Record<PaneKind, PaneKind> = {
  editor: "preview",
  preview: "editor",
};

type UseWorkspaceControllerOptions = {
  events: AppEventChannel;
  markdown: string;
  isScrollSyncEnabled: boolean;
};

export function useWorkspaceController({
  events,
  markdown,
  isScrollSyncEnabled,
}: UseWorkspaceControllerOptions) {
  const [interaction, dispatch] = useReducer(
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
  } = interaction;
  const [leftPane, setLeftPane] = useState<PaneKind>("editor");
  const [previewScrollElement, setPreviewScrollElement] =
    useState<HTMLDivElement | null>(null);
  const [editorScrollElement, setEditorScrollElement] =
    useState<HTMLTextAreaElement | null>(null);

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
  const dismissNonPersistentStageSidebar = useCallback(() => {
    const shouldPreserveOutline =
      stageSidebarRef.current === "outline" && isSidebarInsetRef.current;
    stageSidebarRef.current = shouldPreserveOutline ? "outline" : null;
    isSettingsOpenRef.current = false;
    isPanelLayoutMenuOpenRef.current = false;
    dispatch({ type: "start-document-action" });
  }, []);

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

  const previewMarkdown = useDeferredValue(markdown);
  const isOutlineOpen = stageSidebar === "outline";
  const isRecentDocumentsOpen = stageSidebar === "recent";
  const isPreviewUpdating = markdown !== previewMarkdown;
  const outlineItems = useMemo(
    () => (isOutlineOpen ? getMarkdownOutline(previewMarkdown) : []),
    [isOutlineOpen, previewMarkdown],
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

  stageSidebarRef.current = stageSidebar;
  isSidebarInsetRef.current = isSidebarInset;
  isSettingsOpenRef.current = isSettingsOpen;
  isPanelLayoutMenuOpenRef.current = isPanelLayoutMenuOpen;
  isNotesOpenRef.current = isNotesOpen;
  isPreviewFocusModeRef.current = isPreviewFocusMode;

  const isScrollSyncAvailable = !isNotesOpen && !isPreviewFocusMode;
  const { suppressScrollSyncRestore } = useScrollSync({
    enabled: isScrollSyncEnabled,
    active: !isNotesOpen && !isPreviewFocusMode && !isPreviewUpdating,
    markdown: previewMarkdown,
    editorElement: editorScrollElement,
    previewElement: previewScrollElement,
  });

  const registerWorkspace = useCallback((element: HTMLElement | null) => {
    workspaceRef.current = element;
  }, []);
  const registerDivider = useCallback((element: HTMLDivElement | null) => {
    dividerRef.current = element;
  }, []);
  const registerSplitGuide = useCallback((element: HTMLDivElement | null) => {
    splitGuideRef.current = element;
  }, []);
  const registerOutlineButton = useCallback(
    (element: HTMLButtonElement | null) => {
      outlineButtonRef.current = element;
    },
    [],
  );
  const registerRecentDocumentsButton = useCallback(
    (element: HTMLButtonElement | null) => {
      recentDocumentsButtonRef.current = element;
    },
    [],
  );
  const registerExternalFileNotice = useCallback(
    (element: HTMLElement | null) => {
      externalFileNoticeRef.current = element;
    },
    [],
  );
  const registerSettings = useCallback((element: HTMLDivElement | null) => {
    settingsRef.current = element;
  }, []);
  const registerSettingsButton = useCallback(
    (element: HTMLButtonElement | null) => {
      settingsButtonRef.current = element;
    },
    [],
  );

  const handleSearchInputElementChange = useCallback(
    (area: SearchArea, element: HTMLInputElement | null) => {
      searchInputElementsRef.current[area] = element;
    },
    [searchInputElementsRef],
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
        const pendingSearchSnapshot = !searchSessionsRef.current[area].isOpen
          ? searchSnapshotsRef.current[area]
          : undefined;
        const restoredScrollTop =
          pendingSearchSnapshot?.scrollTop ??
          sourceScrollPositionsRef.current[area];
        suppressScrollSyncRestore();
        if (pendingSearchSnapshot) {
          const restored = restorePendingSourceSearchSnapshot(area, element);
          if (restored !== null) {
            sourceScrollPositionsRef.current[area] = restored;
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
    [
      contentElementsRef,
      restorePendingSourceSearchSnapshot,
      searchSessionsRef,
      searchSnapshotsRef,
      suppressScrollSyncRestore,
    ],
  );

  const openPanelLayoutMenu = useCallback(
    () => dispatch({ type: "open-panel-layout-menu" }),
    [],
  );
  const closePanelLayoutMenu = useCallback(
    () => dispatch({ type: "close-panel-layout-menu" }),
    [],
  );
  const closeSettings = useCallback(
    () => dispatch({ type: "close-settings" }),
    [],
  );
  const closeStageSidebar = useCallback(
    () => dispatch({ type: "close-stage-sidebar" }),
    [],
  );
  const setPreviewFocusMode = useCallback(
    (isOpen: boolean) =>
      dispatch({ type: "set-preview-focus", isOpen }),
    [],
  );
  const setSidebarInset = useCallback((isInset: boolean) => {
    isSidebarInsetRef.current = isInset;
    dispatch({ type: "set-sidebar-inset", isInset });
  }, []);
  const isWorkspaceStacked = useWorkspaceResponsive(setSidebarInset);

  useWorkspaceEventBridge({
    events,
    stageSidebarRef,
    recentDocumentsButtonRef,
    externalFileNoticeReturnFocusRef,
    contentElementsRef,
    lastSearchAreaRef,
    resetSearchSessions,
    closeStageSidebar,
  });

  const {
    exit: exitPreviewFocusMode,
    toggle: togglePreviewFocusMode,
  } = usePreviewFocusMode({
    contentElementsRef,
    isPreviewFocusModeRef,
    lastSearchAreaRef,
    sourceScrollPositionsRef,
    closeSourceSearches: closeSourceSearchesForPreviewFocus,
    dismissTransientLayers: dismissNonPersistentStageSidebar,
    restoreSourceSearchSnapshot: restorePendingSourceSearchSnapshot,
    setPreviewFocusMode,
    suppressScrollSyncRestore,
  });

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

  const selectSourceMode = useCallback((mode: "editor" | "notes") => {
    dismissNonPersistentStageSidebar();
    captureCurrentSourceScroll();
    requestSourceFocus(mode);
    dispatch({ type: "set-notes-open", isOpen: mode === "notes" });
    isNotesOpenRef.current = mode === "notes";
    lastSearchAreaRef.current = mode;
  }, [dismissNonPersistentStageSidebar, lastSearchAreaRef]);

  const swapPanes = useCallback(() => {
    captureCurrentSourceScroll();
    setLeftPane((currentPane) => oppositePane[currentPane]);
    swapSplit();
  }, [swapSplit]);

  const handleOutlineClose = useCallback(() => {
    stageSidebarRef.current = null;
    dispatch({ type: "close-stage-sidebar" });
    window.requestAnimationFrame(() => outlineButtonRef.current?.focus());
  }, []);

  const handleDocumentSidebarClose = useCallback(() => {
    stageSidebarRef.current = null;
    dispatch({ type: "close-stage-sidebar" });
    window.requestAnimationFrame(() =>
      recentDocumentsButtonRef.current?.focus(),
    );
  }, []);

  const handleOutlineNavigate = useCallback((
    headingId: string,
    shouldMoveFocus: boolean,
  ) => {
    const heading = navigateToHeading(headingId);
    if (!heading || isSidebarInset) return;
    stageSidebarRef.current = null;
    dispatch({ type: "close-stage-sidebar" });
    if (shouldMoveFocus) {
      window.requestAnimationFrame(() => heading.focus({ preventScroll: true }));
    }
  }, [isSidebarInset, navigateToHeading]);

  const toggleRecentDocuments = useCallback(() => {
    const willOpen = stageSidebarRef.current !== "recent";
    dispatch({ type: "toggle-stage-sidebar", sidebar: "recent" });
    if (willOpen) events.emit("recent-sidebar-opened", undefined);
  }, [events]);

  const toggleOutline = useCallback(
    () => dispatch({ type: "toggle-stage-sidebar", sidebar: "outline" }),
    [],
  );
  const toggleSettings = useCallback(
    () => dispatch({ type: "toggle-settings" }),
    [],
  );
  const resetSplit = useCallback(() => updateSplit(50), [updateSplit]);

  const toggleNotesFromShortcut = useCallback(() => {
    dismissNonPersistentStageSidebar();
    captureCurrentSourceScroll();
    const willOpen = !isNotesOpenRef.current;
    const nextArea = willOpen ? "notes" : "editor";
    requestSourceFocus(nextArea);
    isNotesOpenRef.current = willOpen;
    dispatch({ type: "set-notes-open", isOpen: willOpen });
    lastSearchAreaRef.current = nextArea;
  }, [dismissNonPersistentStageSidebar, lastSearchAreaRef]);

  useWorkspaceKeyboardLayers({
    stageSidebar,
    isSettingsOpen,
    stageSidebarRef,
    isSidebarInsetRef,
    isSettingsOpenRef,
    isPanelLayoutMenuOpenRef,
    isPreviewFocusModeRef,
    lastSearchAreaRef,
    searchSessionsRef,
    settingsRef,
    settingsButtonRef,
    onToggleNotes: toggleNotesFromShortcut,
    onOpenSearch: openSearch,
    onCloseSearch: closeSearch,
    onExitPreviewFocus: exitPreviewFocusMode,
    onCloseSettings: closeSettings,
    onClosePanelLayoutMenu: closePanelLayoutMenu,
    onCloseOutline: handleOutlineClose,
    onCloseRecentDocuments: handleDocumentSidebarClose,
  });

  return {
    state: {
      stageSidebar,
      isPreviewFocusMode,
      isSidebarInset,
      isSettingsOpen,
      isPanelLayoutMenuOpen,
      isWorkspaceStacked,
      isScrollSyncAvailable,
      isOutlineOpen,
      isRecentDocumentsOpen,
      leftPaneContent,
      rightPaneContent,
      previewMarkdown,
      isPreviewUpdating,
    },
    outline: { items: outlineItems, activeHeadingId },
    search: {
      sessions: searchSessions,
      update: updateSearchSession,
      activateArea: activateSearchArea,
      open: openSearch,
      close: closeSearch,
    },
    elements: {
      workspace: registerWorkspace,
      divider: registerDivider,
      splitGuide: registerSplitGuide,
      outlineButton: registerOutlineButton,
      recentDocumentsButton: registerRecentDocumentsButton,
      externalFileNotice: registerExternalFileNotice,
      settings: registerSettings,
      settingsButton: registerSettingsButton,
      previewScroll: setPreviewScrollElement,
      searchInput: handleSearchInputElementChange,
      content: handleContentElementChange,
    },
    divider: {
      onKeyDown: handleDividerKeyDown,
      onPointerDown: handleDividerPointerDown,
      onPointerMove: handleDividerPointerMove,
      onPointerUp: handleDividerPointerUp,
      onPointerCancel: handleDividerPointerCancel,
      onLostPointerCapture: handleDividerLostPointerCapture,
    },
    actions: {
      toggleRecentDocuments,
      toggleOutline,
      toggleSettings,
      closeDocumentSidebar: handleDocumentSidebarClose,
      closeOutline: handleOutlineClose,
      navigateOutline: handleOutlineNavigate,
      selectSourceMode,
      togglePreviewFocusMode,
      openPanelLayoutMenu,
      closePanelLayoutMenu,
      swapPanes,
      resetSplit,
    },
  };
}
