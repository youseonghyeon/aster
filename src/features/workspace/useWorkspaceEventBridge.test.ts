import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import { useWorkspaceEventBridge } from "./useWorkspaceEventBridge";
import type { StageSidebar } from "./workspace-interactions";
import type { WorkspaceContentElements } from "./workspace-types";

function createOptions(
  sidebar: StageSidebar = "recent",
  isSidebarInset = true,
) {
  return {
    events: createAppEventChannel(),
    stageSidebarRef: { current: sidebar },
    isSidebarInsetRef: { current: isSidebarInset },
    documentBrowserButtonRef: { current: null },
    externalFileNoticeReturnFocusRef: { current: null },
    contentElementsRef: {
      current: {
        editor: null,
        notes: null,
        preview: null,
      } as WorkspaceContentElements,
    },
    lastSearchAreaRef: { current: "editor" as const },
    isPreviewUpdating: false,
    resetSearchSessions: vi.fn(),
    closeStageSidebar: vi.fn(),
  };
}

describe("useWorkspaceEventBridge", () => {
  it.each([
    { source: "recent", outcome: "cancelled" },
    { source: "recent", outcome: "failed" },
    { source: "recent", outcome: "busy" },
  ] as const)(
    "keeps the sidebar for $source/$outcome open results",
    ({ source, outcome }) => {
      const options = createOptions();
      renderHook(() => useWorkspaceEventBridge(options));

      act(() => {
        options.events.emit("document-open-settled", { source, outcome });
      });

      expect(options.stageSidebarRef.current).toBe("recent");
      expect(options.closeStageSidebar).not.toHaveBeenCalled();
    },
  );

  it.each(["opened", "current"] as const)(
    "closes recent documents after a %s result",
    (outcome) => {
      const options = createOptions();
      renderHook(() => useWorkspaceEventBridge(options));

      act(() => {
        options.events.emit("document-open-settled", {
          source: "recent",
          outcome,
        });
      });

      expect(options.stageSidebarRef.current).toBeNull();
      expect(options.closeStageSidebar).toHaveBeenCalledOnce();
    },
  );

  it("keeps an inset file browser open after opening a document", () => {
    const options = createOptions("files", true);
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("document-open-settled", {
        source: "folder",
        outcome: "opened",
      });
    });

    expect(options.stageSidebarRef.current).toBe("files");
    expect(options.closeStageSidebar).not.toHaveBeenCalled();
  });

  it("closes an inset file browser when the current document is activated", () => {
    const options = createOptions("files", true);
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("document-open-settled", {
        source: "folder",
        outcome: "current",
      });
    });

    expect(options.stageSidebarRef.current).toBeNull();
    expect(options.closeStageSidebar).toHaveBeenCalledOnce();
  });

  it("closes a modal file browser after opening a document", () => {
    const options = createOptions("files", false);
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("document-open-settled", {
        source: "folder",
        outcome: "opened",
      });
    });

    expect(options.stageSidebarRef.current).toBeNull();
    expect(options.closeStageSidebar).toHaveBeenCalledOnce();
  });

  it("closes a modal outline after a document opens", () => {
    const options = createOptions("outline", false);
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("document-open-settled", {
        source: "picker",
        outcome: "opened",
      });
    });

    expect(options.stageSidebarRef.current).toBeNull();
    expect(options.closeStageSidebar).toHaveBeenCalledOnce();
  });

  it("unsubscribes from application events on unmount", () => {
    const options = createOptions();
    const { unmount } = renderHook(() => useWorkspaceEventBridge(options));
    unmount();

    act(() => {
      options.events.emit("document-committed", {
        kind: "open",
        previousPath: null,
        path: "/next.md",
      });
    });

    expect(options.resetSearchSessions).not.toHaveBeenCalled();
    expect(options.closeStageSidebar).not.toHaveBeenCalled();
  });

  it("restores editor focus, selection, and scroll after external content commits", () => {
    const options = createOptions();
    const editor = document.createElement("textarea");
    editor.value = "0123456789";
    document.body.append(editor);
    editor.focus();
    editor.setSelectionRange(3, 7, "forward");
    editor.scrollTop = 42;
    editor.scrollLeft = 8;
    options.contentElementsRef.current.editor = editor;
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("external-content-will-apply", { commitToken: 1 });
      editor.value = "abcdefghij";
      editor.setSelectionRange(0, 0);
      editor.scrollTop = 0;
      editor.scrollLeft = 0;
      options.events.emit("external-content-applied", { commitToken: 1 });
    });

    expect(document.activeElement).toBe(editor);
    expect(editor.selectionStart).toBe(3);
    expect(editor.selectionEnd).toBe(7);
    expect(editor.scrollTop).toBe(42);
    expect(editor.scrollLeft).toBe(8);
    editor.remove();
  });

  it("waits for deferred preview content before restoring external positions", () => {
    const options = createOptions();
    const editor = document.createElement("textarea");
    editor.value = "0123456789";
    document.body.append(editor);
    editor.setSelectionRange(2, 6);
    editor.scrollTop = 38;
    options.contentElementsRef.current.editor = editor;
    const { rerender } = renderHook(
      ({ isPreviewUpdating }) =>
        useWorkspaceEventBridge({ ...options, isPreviewUpdating }),
      { initialProps: { isPreviewUpdating: true } },
    );

    act(() => {
      options.events.emit("external-content-will-apply", { commitToken: 4 });
      editor.setSelectionRange(0, 0);
      editor.scrollTop = 0;
      options.events.emit("external-content-applied", { commitToken: 4 });
    });
    expect(editor.selectionStart).toBe(0);
    expect(editor.scrollTop).toBe(0);

    rerender({ isPreviewUpdating: false });
    expect(editor.selectionStart).toBe(2);
    expect(editor.selectionEnd).toBe(6);
    expect(editor.scrollTop).toBe(38);
    editor.remove();
  });
});
