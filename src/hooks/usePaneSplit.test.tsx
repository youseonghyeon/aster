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

it("captures reading geometry before keyboard and pointer resize commits", () => {
  const workspace = document.createElement("main");
  const divider = document.createElement("div");
  workspace.getBoundingClientRect = () => ({left:0,width:1000} as DOMRect);
  divider.setPointerCapture = vi.fn();
  divider.releasePointerCapture = vi.fn();
  divider.hasPointerCapture = () => true;
  const before: string[] = [];
  const {result} = renderHook(() => usePaneSplit({
    workspaceRef:elementRef(workspace),dividerRef:elementRef(divider),splitGuideRef:elementRef(null),
    isPreviewFocusMode:false,
    onBeforeSplitChange:() => before.push(workspace.style.getPropertyValue("--left-pane-width")),
  }));
  act(() => result.current.handleDividerKeyDown({key:"ArrowRight",shiftKey:false,preventDefault:vi.fn()} as never));
  expect(before).toEqual(["50%"]);
  const afterKeyboard = workspace.style.getPropertyValue("--left-pane-width");
  act(() => {
    result.current.handleDividerPointerDown({isPrimary:true,button:0,pointerId:1,clientX:500,
      currentTarget:divider,preventDefault:vi.fn()} as never);
    result.current.handleDividerPointerUp({pointerId:1,clientX:600} as never);
  });
  expect(before).toEqual(["50%",afterKeyboard]);
  expect(workspace.style.getPropertyValue("--left-pane-width")).toBe("60%");
});
