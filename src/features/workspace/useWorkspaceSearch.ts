import { useCallback, useRef, useState } from "react";
import {
  emptySearchSession,
  type SearchArea,
  type SearchSession,
} from "../../lib/text-search";

type SearchSessions = Record<SearchArea, SearchSession>;

export type SearchSnapshot = {
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

function createEmptySearchSessions(): SearchSessions {
  return {
    editor: { ...emptySearchSession },
    notes: { ...emptySearchSession },
    preview: { ...emptySearchSession },
  };
}

export function captureSearchSnapshot(
  area: SearchArea,
  contentElement: HTMLTextAreaElement | HTMLDivElement | null,
): SearchSnapshot {
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
      area === "preview" && contentElement instanceof HTMLDivElement
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

export function restoreTextareaSnapshot(
  element: HTMLTextAreaElement,
  snapshot: SearchSnapshot,
) {
  element.setSelectionRange(
    snapshot.selectionStart ?? 0,
    snapshot.selectionEnd ?? 0,
    snapshot.selectionDirection,
  );
  element.scrollTop = snapshot.scrollTop;
  element.scrollLeft = snapshot.scrollLeft;
}

export function useWorkspaceSearch(onOpen: () => void) {
  const [searchSessions, setSearchSessions] = useState<SearchSessions>(
    createEmptySearchSessions,
  );
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
  searchSessionsRef.current = searchSessions;

  const updateSearchSession = useCallback(
    (area: SearchArea, patch: Partial<SearchSession>) => {
      setSearchSessions((currentSessions) => ({
        ...currentSessions,
        [area]: { ...currentSessions[area], ...patch },
      }));
    },
    [],
  );

  const activateSearchArea = useCallback((area: SearchArea) => {
    lastSearchAreaRef.current = area;
  }, []);

  const openSearch = useCallback(
    (area: SearchArea) => {
      lastSearchAreaRef.current = area;
      onOpen();

      if (searchSessionsRef.current[area].isOpen) {
        window.requestAnimationFrame(() => {
          const input = searchInputElementsRef.current[area];
          input?.focus({ preventScroll: true });
          input?.select();
        });
        return;
      }

      searchSnapshotsRef.current[area] = captureSearchSnapshot(
        area,
        contentElementsRef.current[area],
      );
      updateSearchSession(area, { isOpen: true });
    },
    [onOpen, updateSearchSession],
  );

  const closeSearch = useCallback(
    (
      area: SearchArea,
      {
        restoreFocus = true,
        deferRestore = false,
      }: { restoreFocus?: boolean; deferRestore?: boolean } = {},
    ) => {
      const snapshot = searchSnapshotsRef.current[area];
      updateSearchSession(area, { isOpen: false });

      if (deferRestore) {
        return;
      }

      window.requestAnimationFrame(() => {
        const contentElement = contentElementsRef.current[area];

        if (area === "notes") {
          if (contentElement instanceof HTMLTextAreaElement && snapshot) {
            restoreTextareaSnapshot(contentElement, snapshot);
          } else if (contentElement && snapshot) {
            contentElement.scrollTop = snapshot.scrollTop;
            contentElement.scrollLeft = snapshot.scrollLeft;
          }

          const nestedElements =
            contentElement instanceof HTMLDivElement
              ? contentElement.querySelectorAll<HTMLElement>(
                  ".markdown-body pre, .markdown-body .table-scroll",
                )
              : [];
          snapshot?.nestedScrollPositions?.forEach((position, index) => {
            const element = nestedElements[index];
            if (element) {
              element.scrollTop = position.scrollTop;
              element.scrollLeft = position.scrollLeft;
            }
          });
        }

        const paneElement = contentElement?.closest(".pane");
        const isSnapshotElementInArea = Boolean(
          snapshot?.activeElement?.isConnected &&
            paneElement?.contains(snapshot.activeElement),
        );
        const focusTarget =
          snapshot?.activeElementKind === "search-trigger"
            ? paneElement?.querySelector<HTMLElement>(".pane-search-trigger")
            : snapshot?.activeElementKind === "content"
              ? contentElement
              : snapshot?.activeElementKind === "external" &&
                  snapshot.activeElement?.isConnected
                ? snapshot.activeElement
                : isSnapshotElementInArea
                  ? snapshot?.activeElement
                  : contentElement;
        if (restoreFocus) {
          focusTarget?.focus({ preventScroll: true });
        }

        if (!contentElement && snapshot && !restoreFocus) {
          return;
        }
        delete searchSnapshotsRef.current[area];
      });
    },
    [updateSearchSession],
  );

  const closeSourceSearchesForPreviewFocus = useCallback(() => {
    (["editor", "notes"] as const).forEach((area) => {
      if (searchSessionsRef.current[area].isOpen) {
        closeSearch(area, { restoreFocus: false, deferRestore: true });
      }
    });
  }, [closeSearch]);

  const restorePendingSourceSearchSnapshot = useCallback(
    (area: "editor" | "notes", element: HTMLTextAreaElement) => {
      const snapshot = searchSnapshotsRef.current[area];
      if (!snapshot || searchSessionsRef.current[area].isOpen) {
        return null;
      }

      restoreTextareaSnapshot(element, snapshot);
      delete searchSnapshotsRef.current[area];
      return snapshot.scrollTop;
    },
    [],
  );

  const resetSearchSessions = useCallback(() => {
    setSearchSessions(createEmptySearchSessions());
    searchSnapshotsRef.current = {};
    lastSearchAreaRef.current = "preview";
    CSS.highlights?.delete("aster-preview-search-match");
    CSS.highlights?.delete("aster-preview-search-current");
  }, []);

  return {
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
  };
}
