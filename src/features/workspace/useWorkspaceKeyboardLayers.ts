import { useEffect, type RefObject } from "react";
import type { SearchArea } from "../../lib/text-search";
import { getEscapeOwner, type StageSidebar } from "./workspace-interactions";
import type { SearchSessions } from "./useWorkspaceSearch";

type UseWorkspaceKeyboardLayersOptions = {
  isBlockingModalOpen: () => boolean;
  stageSidebar: StageSidebar;
  isSettingsOpen: boolean;
  stageSidebarRef: RefObject<StageSidebar>;
  isSidebarInsetRef: RefObject<boolean>;
  isSettingsOpenRef: RefObject<boolean>;
  isPanelLayoutMenuOpenRef: RefObject<boolean>;
  isPreviewFocusModeRef: RefObject<boolean>;
  lastSearchAreaRef: RefObject<SearchArea>;
  searchSessionsRef: RefObject<SearchSessions>;
  settingsRef: RefObject<HTMLDivElement | null>;
  settingsButtonRef: RefObject<HTMLButtonElement | null>;
  onToggleNotes: () => void;
  onOpenSearch: (area: SearchArea) => void;
  onCloseSearch: (area: SearchArea) => void;
  onExitPreviewFocus: () => void;
  onCloseSettings: () => void;
  onClosePanelLayoutMenu: () => void;
  onCloseOutline: () => void;
  onCloseRecentDocuments: () => void;
};

function isEventInsideStageSidebar(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("#document-outline, #document-sidebar"))
  );
}

export function useWorkspaceKeyboardLayers({
  isBlockingModalOpen,
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
  onToggleNotes,
  onOpenSearch,
  onCloseSearch,
  onExitPreviewFocus,
  onCloseSettings,
  onClosePanelLayoutMenu,
  onCloseOutline,
  onCloseRecentDocuments,
}: UseWorkspaceKeyboardLayersOptions) {
  useEffect(() => {
    function handleNoteShortcut(event: globalThis.KeyboardEvent) {
      if (isBlockingModalOpen()) return;
      if (
        (!event.metaKey && !event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== "m"
      ) {
        return;
      }
      event.preventDefault();
      if (!isPreviewFocusModeRef.current) onToggleNotes();
    }
    window.addEventListener("keydown", handleNoteShortcut);
    return () => window.removeEventListener("keydown", handleNoteShortcut);
  }, [isBlockingModalOpen, isPreviewFocusModeRef, onToggleNotes]);

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      if (isBlockingModalOpen()) return;
      const isFindShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "f";
      if (isFindShortcut) {
        event.preventDefault();
        onCloseSettings();
        onClosePanelLayoutMenu();
        onOpenSearch(
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
        onCloseSearch(activeArea);
      } else if (isPreviewFocusModeRef.current) {
        event.preventDefault();
        onExitPreviewFocus();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [
    isPanelLayoutMenuOpenRef,
    isBlockingModalOpen,
    isPreviewFocusModeRef,
    isSettingsOpenRef,
    isSidebarInsetRef,
    lastSearchAreaRef,
    onClosePanelLayoutMenu,
    onCloseSearch,
    onCloseSettings,
    onExitPreviewFocus,
    onOpenSearch,
    searchSessionsRef,
    stageSidebarRef,
  ]);

  useEffect(() => {
    if (!stageSidebar) return;
    function handleSidebarKeyDown(event: globalThis.KeyboardEvent) {
      if (isBlockingModalOpen()) return;
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
      if (stageSidebar === "outline") onCloseOutline();
      else onCloseRecentDocuments();
    }
    window.addEventListener("keydown", handleSidebarKeyDown);
    return () => window.removeEventListener("keydown", handleSidebarKeyDown);
  }, [
    isPanelLayoutMenuOpenRef,
    isBlockingModalOpen,
    isPreviewFocusModeRef,
    isSettingsOpenRef,
    isSidebarInsetRef,
    lastSearchAreaRef,
    onCloseOutline,
    onCloseRecentDocuments,
    searchSessionsRef,
    stageSidebar,
  ]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    function handleOutsidePointerDown(event: globalThis.PointerEvent) {
      if (isBlockingModalOpen()) return;
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target)
      ) {
        onCloseSettings();
      }
    }
    function handleSettingsKeyDown(event: globalThis.KeyboardEvent) {
      if (isBlockingModalOpen()) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseSettings();
      settingsButtonRef.current?.focus();
    }
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    window.addEventListener("keydown", handleSettingsKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      window.removeEventListener("keydown", handleSettingsKeyDown);
    };
  }, [
    isSettingsOpen,
    isBlockingModalOpen,
    onCloseSettings,
    settingsButtonRef,
    settingsRef,
  ]);
}
