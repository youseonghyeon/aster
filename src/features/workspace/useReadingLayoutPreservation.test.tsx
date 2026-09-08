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

// These tests exercise the controller lifecycle; jsdom geometry is supplied explicitly.
function readingFixture() {
  const events = createAppEventChannel();
  const preview = document.createElement("div");
  preview.className = "preview-scroll";
  preview.dataset.documentPath = "/document.md";
  const body = document.createElement("article"); body.className = "markdown-body";
  const paragraph = document.createElement("p"); paragraph.dataset.sourceOffset = "6";
  paragraph.textContent = "읽던 한글 문장입니다";
  body.append(paragraph); preview.append(body); document.body.append(preview);
  let width = 600; let height = 3000; let top = 1120;
  Object.defineProperties(preview, {
    clientHeight: {get: () => 600}, clientWidth: {get: () => width}, scrollHeight: {get: () => height},
  });
  preview.scrollTop = 1000;
  preview.getBoundingClientRect = () => ({top: 0} as DOMRect);
  body.getBoundingClientRect = () => ({width, height} as DOMRect);
  paragraph.getBoundingClientRect = () => ({top: top-preview.scrollTop, bottom: top-preview.scrollTop+100,height:100} as DOMRect);
  const suppress = vi.fn();
  const initial = {previewElement: preview, markdown: "head\n\n읽던 한글 문장입니다\n\nend", documentPath: "/document.md", isPreviewUpdating: false, layoutKey: ""};
  const hook = renderHook(props => useReadingLayoutPreservation({
    ...props, events, suppressScrollSyncRestore: suppress,
  }), {initialProps: initial});
  return {events, preview, paragraph, body, initial, hook, suppress,
    move(nextTop: number, nextWidth = width, nextHeight = height) {top = nextTop; width = nextWidth; height = nextHeight;},
    dispose() {hook.unmount(); preview.remove();}};
}

async function settleReadingLayout() {
  await act(async () => {await nextAnimationFrame(); await nextAnimationFrame();});
}

describe("unified reading preservation", () => {
  it("remaps an external insertion only after the deferred Markdown commits", () => {
    const fixture = readingFixture();
    act(() => fixture.events.emit("external-content-will-apply", {commitToken: 1}));
    fixture.hook.rerender({...fixture.initial, isPreviewUpdating: true});
    fixture.move(1420); fixture.paragraph.dataset.sourceOffset = "9";
    expect(fixture.preview.scrollTop).toBe(1000);
    fixture.hook.rerender({...fixture.initial, markdown: "추가\n"+fixture.initial.markdown});
    expect(fixture.preview.scrollTop).toBe(1300);
    expect(fixture.paragraph.getBoundingClientRect().top).toBe(120);
    fixture.dispose();
  });

  it("uses the cached reading anchor after native width reflow", async () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
      observe() {} unobserve() {} disconnect() {}
    });
    const fixture = readingFixture();
    fixture.move(1720, 400, 5000);
    act(() => callbacks.forEach(callback => callback([], {} as ResizeObserver)));
    await settleReadingLayout();
    expect(fixture.preview.scrollTop).toBe(1600);
    expect(fixture.paragraph.getBoundingClientRect().top).toBe(120);
    fixture.dispose(); vi.unstubAllGlobals();
  });

  it("restores focus/sidebar layout commits without a whole-document ratio", () => {
    const fixture = readingFixture();
    fixture.move(1420, 1000, 5400);
    fixture.hook.rerender({...fixture.initial, layoutKey: "focus"});
    expect(fixture.preview.scrollTop).toBe(1300);
    fixture.move(1120, 600, 3000);
    fixture.hook.rerender({...fixture.initial, layoutKey: "split"});
    expect(fixture.preview.scrollTop).toBe(1000);
    fixture.dispose();
  });

  it("preserves late asset changes after the former one-second deadline", async () => {
    vi.useFakeTimers();
    const fixture = readingFixture();
    act(() => fixture.events.emit("reading-layout-will-change", undefined));
    await act(async () => vi.advanceTimersByTimeAsync(1500));
    fixture.move(1520, 600, 3400);
    fixture.preview.dispatchEvent(new Event("load"));
    await act(async () => vi.advanceTimersByTimeAsync(50));
    expect(fixture.preview.scrollTop).toBe(1400);
    fixture.dispose(); vi.useRealTimers();
  });

  it("tracks the new user reading position instead of pulling back after late load", async () => {
    const fixture = readingFixture();
    act(() => {
      fixture.events.emit("reading-layout-will-change", undefined);
      fixture.preview.dispatchEvent(new WheelEvent("wheel"));
      fixture.preview.scrollTop = 1050;
      fixture.preview.dispatchEvent(new Event("scroll"));
    });
    await settleReadingLayout();
    fixture.move(1420, 600, 3300);
    fixture.preview.dispatchEvent(new Event("load"));
    await settleReadingLayout();
    expect(fixture.preview.scrollTop).toBe(1350);
    fixture.dispose();
  });

  it("does not apply a pending external anchor after user navigation", () => {
    const fixture = readingFixture();
    act(() => {
      fixture.events.emit("external-content-will-apply", {commitToken:1});
      fixture.events.emit("reading-navigation-will-change", undefined);
    });
    fixture.move(1520); fixture.preview.scrollTop = 800;
    fixture.hook.rerender({...fixture.initial, markdown:"prefix\n"+fixture.initial.markdown});
    expect(fixture.preview.scrollTop).toBe(800);
    fixture.dispose();
  });

  it("invalidates stale restores on document switch and unmount", async () => {
    const fixture = readingFixture();
    act(() => fixture.events.emit("external-content-will-apply", {commitToken:1}));
    fixture.preview.dataset.documentPath = "/next.md"; fixture.preview.scrollTop = 50;
    fixture.hook.rerender({...fixture.initial, documentPath:"/next.md", markdown:"next"});
    act(() => fixture.events.emit("external-content-applied", {commitToken:1}));
    await settleReadingLayout();
    expect(fixture.preview.scrollTop).toBe(50);
    fixture.move(1800);
    fixture.preview.dispatchEvent(new Event("load"));
    fixture.hook.unmount();
    await settleReadingLayout();
    expect(fixture.preview.scrollTop).toBe(50);
    fixture.preview.remove();
  });

  it("maps each consecutive reload from the currently rendered document", () => {
    const fixture = readingFixture();
    for (const index of [1,2]) {
      act(() => fixture.events.emit("external-content-will-apply", {commitToken:index}));
      fixture.move(1120 + index*300);
      fixture.paragraph.dataset.sourceOffset = String(6+index*3);
      fixture.hook.rerender({...fixture.initial, markdown:"추가\n".repeat(index)+fixture.initial.markdown});
      expect(fixture.preview.scrollTop).toBe(1000+index*300);
    }
    fixture.dispose();
  });
});


it("rebinds the reading snapshot when the preview pane DOM is replaced", () => {
  const fixture = readingFixture();
  act(() => fixture.events.emit("reading-layout-will-change", undefined));
  const replacement = fixture.preview.cloneNode(true) as HTMLDivElement;
  Object.defineProperties(replacement, {clientHeight:{value:600},scrollHeight:{value:3300},clientWidth:{value:700}});
  replacement.getBoundingClientRect = () => ({top:0} as DOMRect);
  const paragraph = replacement.querySelector("p")!;
  paragraph.getBoundingClientRect = () => ({top:1420-replacement.scrollTop,bottom:1520-replacement.scrollTop,height:100} as DOMRect);
  fixture.preview.replaceWith(replacement);
  fixture.hook.rerender({...fixture.initial,previewElement:replacement,layoutKey:"swapped"});
  expect(replacement.scrollTop).toBe(1300);
  fixture.dispose(); replacement.remove();
});

it("keeps the original anchor across rapid layout changes before a frame can restore", async () => {
  const fixture = readingFixture();
  act(() => {
    fixture.events.emit("reading-layout-will-change", undefined);
    fixture.move(1420, 500, 3300);
    fixture.events.emit("reading-layout-will-change", undefined);
    fixture.move(1720, 400, 3600);
  });
  await settleReadingLayout();
  expect(fixture.preview.scrollTop).toBe(1600);
  fixture.dispose();
});
