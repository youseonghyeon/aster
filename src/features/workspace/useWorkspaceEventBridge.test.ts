import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import { useWorkspaceEventBridge } from "./useWorkspaceEventBridge";
import type { StageSidebar } from "./workspace-interactions";
import type { WorkspaceContentElements } from "./workspace-types";

function createOptions() {
  return {
    events: createAppEventChannel(),
    stageSidebarRef: { current: "recent" as StageSidebar },
    recentDocumentsButtonRef: { current: null },
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
    { source: "picker", outcome: "current" },
    { source: "native", outcome: "current" },
    { source: "recent", outcome: "opened" },
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

  it("closes recent documents only when the selected document is already current", () => {
    const options = createOptions();
    renderHook(() => useWorkspaceEventBridge(options));

    act(() => {
      options.events.emit("document-open-settled", {
        source: "recent",
        outcome: "current",
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
