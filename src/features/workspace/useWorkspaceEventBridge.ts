import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AppEventChannel } from "../../shared/app-events";
import type { SearchArea } from "../../lib/text-search";
import type { StageSidebar } from "./workspace-interactions";
import type { WorkspaceContentElements } from "./workspace-types";
import {
  captureSearchSnapshot,
  restoreTextareaSnapshot,
  type SearchSnapshot,
} from "./useWorkspaceSearch";

type UseWorkspaceEventBridgeOptions = {
  events: AppEventChannel;
  stageSidebarRef: RefObject<StageSidebar>;
  recentDocumentsButtonRef: RefObject<HTMLButtonElement | null>;
  externalFileNoticeReturnFocusRef: RefObject<HTMLElement | null>;
  contentElementsRef: RefObject<WorkspaceContentElements>;
  lastSearchAreaRef: RefObject<SearchArea>;
  isPreviewUpdating: boolean;
  resetSearchSessions: () => void;
  closeStageSidebar: () => void;
};

export function useWorkspaceEventBridge({
  events,
  stageSidebarRef,
  recentDocumentsButtonRef,
  externalFileNoticeReturnFocusRef,
  contentElementsRef,
  lastSearchAreaRef,
  isPreviewUpdating,
  resetSearchSessions,
  closeStageSidebar,
}: UseWorkspaceEventBridgeOptions) {
  const externalSnapshotsRef = useRef<
    Partial<Record<SearchArea, SearchSnapshot>> | null
  >(null);
  const externalCommitTokenRef = useRef<number | null>(null);
  const [appliedExternalCommitToken, setAppliedExternalCommitToken] = useState<
    number | null
  >(null);

  useLayoutEffect(() => {
    if (
      appliedExternalCommitToken === null ||
      isPreviewUpdating ||
      externalCommitTokenRef.current !== appliedExternalCommitToken ||
      !externalSnapshotsRef.current
    ) {
      return;
    }
    const snapshots = externalSnapshotsRef.current;
    for (const area of ["editor", "notes", "preview"] as const) {
      const element = contentElementsRef.current[area];
      const snapshot = snapshots[area];
      if (!element || !snapshot) continue;
      if (element instanceof HTMLTextAreaElement) {
        restoreTextareaSnapshot(element, snapshot);
      } else {
        element.scrollTop = snapshot.scrollTop;
        element.scrollLeft = snapshot.scrollLeft;
        const nested = element.querySelectorAll<HTMLElement>(
          ".markdown-body pre, .markdown-body .table-scroll",
        );
        snapshot.nestedScrollPositions?.forEach((position, index) => {
          if (nested[index]) {
            nested[index].scrollTop = position.scrollTop;
            nested[index].scrollLeft = position.scrollLeft;
          }
        });
      }
      if (snapshot.activeElementKind === "content") {
        element.focus({ preventScroll: true });
      } else if (snapshot.activeElement?.isConnected) {
        snapshot.activeElement.focus({ preventScroll: true });
      }
    }
    externalSnapshotsRef.current = null;
    externalCommitTokenRef.current = null;
  }, [appliedExternalCommitToken, contentElementsRef, isPreviewUpdating]);

  useEffect(() => {
    function closeRecentAndRestoreFocus() {
      stageSidebarRef.current = null;
      closeStageSidebar();
      window.requestAnimationFrame(() =>
        recentDocumentsButtonRef.current?.focus(),
      );
    }

    const unsubscribeDocumentCommitted = events.subscribe(
      "document-committed",
      () => {
        const shouldRestoreRecentFocus = stageSidebarRef.current === "recent";
        resetSearchSessions();
        stageSidebarRef.current = null;
        closeStageSidebar();
        if (shouldRestoreRecentFocus) {
          window.requestAnimationFrame(() =>
            recentDocumentsButtonRef.current?.focus(),
          );
        }
      },
    );
    const unsubscribeOpenSettled = events.subscribe(
      "document-open-settled",
      ({ source, outcome }) => {
        if (source === "recent" && outcome === "current") {
          closeRecentAndRestoreFocus();
        }
      },
    );
    const unsubscribeExternalWillShow = events.subscribe(
      "external-notice-will-show",
      () => {
        if (document.activeElement instanceof HTMLElement) {
          externalFileNoticeReturnFocusRef.current = document.activeElement;
        }
      },
    );
    const unsubscribeExternalDismissed = events.subscribe(
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
    const unsubscribeExternalWillApply = events.subscribe(
      "external-content-will-apply",
      ({ commitToken }) => {
        externalCommitTokenRef.current = commitToken;
        externalSnapshotsRef.current = {
          editor: captureSearchSnapshot(
            "editor",
            contentElementsRef.current.editor,
          ),
          notes: captureSearchSnapshot(
            "notes",
            contentElementsRef.current.notes,
          ),
          preview: captureSearchSnapshot(
            "preview",
            contentElementsRef.current.preview,
          ),
        };
      },
    );
    const unsubscribeExternalApplied = events.subscribe(
      "external-content-applied",
      ({ commitToken }) => setAppliedExternalCommitToken(commitToken),
    );

    return () => {
      unsubscribeDocumentCommitted();
      unsubscribeOpenSettled();
      unsubscribeExternalWillShow();
      unsubscribeExternalDismissed();
      unsubscribeExternalWillApply();
      unsubscribeExternalApplied();
    };
  }, [
    closeStageSidebar,
    contentElementsRef,
    events,
    externalFileNoticeReturnFocusRef,
    lastSearchAreaRef,
    recentDocumentsButtonRef,
    resetSearchSessions,
    stageSidebarRef,
  ]);
}
