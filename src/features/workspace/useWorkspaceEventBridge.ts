import { useEffect, type RefObject } from "react";
import type { AppEventChannel } from "../../shared/app-events";
import type { SearchArea } from "../../lib/text-search";
import type { StageSidebar } from "./workspace-interactions";
import type { WorkspaceContentElements } from "./workspace-types";

type UseWorkspaceEventBridgeOptions = {
  events: AppEventChannel;
  stageSidebarRef: RefObject<StageSidebar>;
  recentDocumentsButtonRef: RefObject<HTMLButtonElement | null>;
  externalFileNoticeReturnFocusRef: RefObject<HTMLElement | null>;
  contentElementsRef: RefObject<WorkspaceContentElements>;
  lastSearchAreaRef: RefObject<SearchArea>;
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
  resetSearchSessions,
  closeStageSidebar,
}: UseWorkspaceEventBridgeOptions) {
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

    return () => {
      unsubscribeDocumentCommitted();
      unsubscribeOpenSettled();
      unsubscribeExternalWillShow();
      unsubscribeExternalDismissed();
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
