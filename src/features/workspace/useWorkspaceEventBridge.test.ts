import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import { useWorkspaceEventBridge } from "./useWorkspaceEventBridge";
import type { StageSidebar } from "./workspace-interactions";

function createOptions() {
  return {
    events: createAppEventChannel(),
    stageSidebarRef: { current: "recent" as StageSidebar },
    recentDocumentsButtonRef: { current: null },
    externalFileNoticeReturnFocusRef: { current: null },
    contentElementsRef: {
      current: { editor: null, notes: null, preview: null },
    },
    lastSearchAreaRef: { current: "editor" as const },
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
});
