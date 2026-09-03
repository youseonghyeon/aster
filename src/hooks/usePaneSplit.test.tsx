import { act, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePaneSplit } from "./usePaneSplit";

function elementRef<T>(element: T): RefObject<T> {
  return { current: element };
}

describe("pane split controller", () => {
  it("applies a restored split and reports committed changes", () => {
    const workspace = document.createElement("main");
    const divider = document.createElement("div");
    const splitGuide = document.createElement("div");
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 600,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });
    const onSplitChange = vi.fn();

    const { result } = renderHook(() =>
      usePaneSplit({
        workspaceRef: elementRef(workspace),
        dividerRef: elementRef(divider),
        splitGuideRef: elementRef(splitGuide),
        isPreviewFocusMode: false,
        initialSplitPercent: 64,
        onSplitChange,
      }),
    );

    expect(workspace.style.getPropertyValue("--left-pane-width")).toBe("64%");
    expect(onSplitChange).not.toHaveBeenCalled();

    act(() => result.current.updateSplit(58));
    expect(workspace.style.getPropertyValue("--left-pane-width")).toBe("58%");
    expect(onSplitChange).toHaveBeenCalledWith(58);
  });
});
