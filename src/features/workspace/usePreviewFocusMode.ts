import { useCallback, useRef, type RefObject } from "react";
import type { SearchArea } from "../../lib/text-search";
import {
  getScrollProgress,
  restoreScrollProgress,
  type PreviewScrollProgress,
} from "./workspace-scroll";
import type {
  SourceArea,
  WorkspaceContentElements,
} from "./workspace-types";

type UsePreviewFocusModeOptions = {
  contentElementsRef: RefObject<WorkspaceContentElements>;
  isPreviewFocusModeRef: RefObject<boolean>;
  lastSearchAreaRef: RefObject<SearchArea>;
  sourceScrollPositionsRef: RefObject<Record<SourceArea, number>>;
  closeSourceSearches: () => void;
  dismissTransientLayers: () => void;
  restoreSourceSearchSnapshot: (
    area: SourceArea,
    element: HTMLTextAreaElement,
  ) => number | null;
  setPreviewFocusMode: (isOpen: boolean) => void;
  suppressScrollSyncRestore: () => void;
};

export function usePreviewFocusMode({
  contentElementsRef,
  isPreviewFocusModeRef,
  lastSearchAreaRef,
  sourceScrollPositionsRef,
  closeSourceSearches,
  dismissTransientLayers,
  restoreSourceSearchSnapshot,
  setPreviewFocusMode,
  suppressScrollSyncRestore,
}: UsePreviewFocusModeOptions) {
  const returnAreaRef = useRef<SearchArea>("preview");

  const capturePreviewScrollProgress = useCallback(() => {
    const previewElement = contentElementsRef.current.preview;
    if (!(previewElement instanceof HTMLDivElement)) return null;
    return {
      outer: getScrollProgress(previewElement),
      nested: Array.from(
        previewElement.querySelectorAll<HTMLElement>(
          ".markdown-body pre, .markdown-body .table-scroll",
        ),
        getScrollProgress,
      ),
    } satisfies PreviewScrollProgress;
  }, [contentElementsRef]);

  const restorePreviewScrollProgress = useCallback(
    (progress: PreviewScrollProgress | null) => {
      const previewElement = contentElementsRef.current.preview;
      if (!(previewElement instanceof HTMLDivElement) || !progress) return;
      restoreScrollProgress(previewElement, progress.outer);
      const nestedElements = previewElement.querySelectorAll<HTMLElement>(
        ".markdown-body pre, .markdown-body .table-scroll",
      );
      progress.nested.forEach((nestedProgress, index) => {
        const element = nestedElements[index];
        if (element) restoreScrollProgress(element, nestedProgress);
      });
    },
    [contentElementsRef],
  );

  const enter = useCallback(() => {
    const previewScrollProgress = capturePreviewScrollProgress();
    suppressScrollSyncRestore();
    returnAreaRef.current = lastSearchAreaRef.current;
    closeSourceSearches();
    dismissTransientLayers();
    setPreviewFocusMode(true);
    lastSearchAreaRef.current = "preview";
    window.requestAnimationFrame(() => {
      restorePreviewScrollProgress(previewScrollProgress);
      contentElementsRef.current.preview?.focus({ preventScroll: true });
    });
  }, [
    capturePreviewScrollProgress,
    closeSourceSearches,
    contentElementsRef,
    dismissTransientLayers,
    lastSearchAreaRef,
    restorePreviewScrollProgress,
    setPreviewFocusMode,
    suppressScrollSyncRestore,
  ]);

  const exit = useCallback(() => {
    const previewScrollProgress = capturePreviewScrollProgress();
    suppressScrollSyncRestore();
    const returnArea = returnAreaRef.current;
    setPreviewFocusMode(false);
    lastSearchAreaRef.current = returnArea;
    window.requestAnimationFrame(() => {
      restorePreviewScrollProgress(previewScrollProgress);
      const returnElement = contentElementsRef.current[returnArea];
      const restoredPositions = (["editor", "notes"] as const)
        .map((area) => {
          const element = contentElementsRef.current[area];
          const scrollTop =
            element instanceof HTMLTextAreaElement
              ? restoreSourceSearchSnapshot(area, element)
              : null;
          if (scrollTop !== null) {
            sourceScrollPositionsRef.current[area] = scrollTop;
          }
          return element instanceof HTMLTextAreaElement && scrollTop !== null
            ? { element, scrollTop, scrollLeft: element.scrollLeft }
            : null;
        })
        .filter((position) => position !== null);
      returnElement?.focus({ preventScroll: true });
      if (restoredPositions.length > 0) {
        window.requestAnimationFrame(() => {
          restoredPositions.forEach(({ element, scrollTop, scrollLeft }) => {
            element.scrollTop = scrollTop;
            element.scrollLeft = scrollLeft;
          });
        });
      }
    });
  }, [
    capturePreviewScrollProgress,
    contentElementsRef,
    lastSearchAreaRef,
    restorePreviewScrollProgress,
    restoreSourceSearchSnapshot,
    setPreviewFocusMode,
    sourceScrollPositionsRef,
    suppressScrollSyncRestore,
  ]);

  const toggle = useCallback(() => {
    if (isPreviewFocusModeRef.current) exit();
    else enter();
  }, [enter, exit, isPreviewFocusModeRef]);

  return { enter, exit, toggle };
}
