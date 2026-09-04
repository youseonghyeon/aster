import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import { useReadingLayoutPreservation } from "./useReadingLayoutPreservation";

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

describe("reading layout preservation", () => {
  it("restores the same reading point after a preference changes layout", async () => {
    const events = createAppEventChannel();
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const paragraph = document.createElement("p");
    paragraph.dataset.sourceOffset = "42";
    preview.append(paragraph);
    document.body.append(preview);
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    preview.scrollTop = 200;
    preview.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    let paragraphLayoutTop = 260;
    paragraph.getBoundingClientRect = () =>
      ({
        top: paragraphLayoutTop - preview.scrollTop,
        bottom: paragraphLayoutTop - preview.scrollTop + 240,
        height: 240,
      }) as DOMRect;
    const suppressScrollSyncRestore = vi.fn();
    const { unmount } = renderHook(() =>
      useReadingLayoutPreservation({
        events,
        previewElement: preview,
        suppressScrollSyncRestore,
      }),
    );

    act(() => {
      events.emit("reading-layout-will-change", undefined);
      paragraphLayoutTop = 320;
    });
    await act(async () => {
      await nextAnimationFrame();
      await nextAnimationFrame();
    });

    expect(preview.scrollTop).toBe(260);
    expect(suppressScrollSyncRestore).toHaveBeenCalled();
    unmount();
    preview.remove();
  });

  it("stops a pending restoration when the user takes scroll ownership", async () => {
    const events = createAppEventChannel();
    const preview = document.createElement("div");
    preview.className = "preview-scroll";
    const paragraph = document.createElement("p");
    paragraph.dataset.sourceOffset = "42";
    preview.append(paragraph);
    document.body.append(preview);
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 600 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    preview.scrollTop = 200;
    preview.getBoundingClientRect = () => ({ top: 0 } as DOMRect);
    let paragraphLayoutTop = 260;
    paragraph.getBoundingClientRect = () =>
      ({
        top: paragraphLayoutTop - preview.scrollTop,
        bottom: paragraphLayoutTop - preview.scrollTop + 240,
        height: 240,
      }) as DOMRect;
    const { unmount } = renderHook(() =>
      useReadingLayoutPreservation({
        events,
        previewElement: preview,
        suppressScrollSyncRestore: vi.fn(),
      }),
    );

    act(() => {
      events.emit("reading-layout-will-change", undefined);
      paragraphLayoutTop = 320;
      preview.dispatchEvent(new WheelEvent("wheel"));
    });
    await act(async () => {
      await nextAnimationFrame();
      await nextAnimationFrame();
    });

    expect(preview.scrollTop).toBe(200);
    unmount();
    preview.remove();
  });
});
