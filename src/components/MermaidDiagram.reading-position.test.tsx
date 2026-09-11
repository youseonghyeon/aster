import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "./MermaidDiagram";
import { useReadingLayoutPreservation } from "../features/workspace/useReadingLayoutPreservation";
import { useScrollSync } from "../hooks/useScrollSync";
import { previewLayoutChangeEvent } from "../lib/preview-layout-events";
import { createAppEventChannel } from "../shared/app-events";

vi.mock("../lib/mermaid-renderer", () => ({
  renderMermaidDiagram: vi.fn(() => Promise.resolve(
    '<svg viewBox="0 0 900 400"><text>위치 보존 도표</text></svg>',
  )),
}));

// Geometry is supplied explicitly: these tests exercise the actual component
// and reading controller together, not WebKit layout or native event timing.
async function fixture(capped = false) {
  const view = render(
    <div className="preview-scroll" data-document-path="/a.md">
      <article className="markdown-body">
        <MermaidDiagram source="A" sourceOffset={12} appearanceKey="paper" curve="curved" />
      </article>
    </div>,
  );
  await screen.findByText("위치 보존 도표");
  const preview = view.container.querySelector<HTMLDivElement>(".preview-scroll")!;
  const body = preview.querySelector<HTMLElement>(".markdown-body")!;
  const frame = preview.querySelector<HTMLElement>(".mermaid-diagram")!;
  const region = preview.querySelector<HTMLElement>(".mermaid-diagram-scroll")!;
  const canvas = region.querySelector<HTMLElement>(".mermaid-diagram-canvas")!;
  const svg = () => region.querySelector("svg")!;
  const contentHeight = () => Number.parseFloat(svg().style.height) + 40;
  const viewportHeight = () => capped ? 200 : contentHeight();
  const frameHeight = () => 58 + viewportHeight();
  let frameTop = 640;
  Object.defineProperties(preview, {
    clientHeight: { value: 600 }, clientWidth: { value: 600 },
    scrollHeight: { get: () => 2000 + frameHeight() },
  });
  Object.defineProperties(region, {
    clientWidth: { value: 300 }, clientHeight: { get: viewportHeight },
    scrollWidth: { get: () => Number.parseFloat(svg().style.width) + 40 },
    scrollHeight: { get: contentHeight },
  });
  preview.scrollTop = 600;
  region.scrollLeft = 320;
  region.scrollTop = capped ? 120 : 0;
  preview.getBoundingClientRect = () => ({ top: 0, width: 600, height: 600 } as DOMRect);
  body.getBoundingClientRect = () => ({
    top: -preview.scrollTop, width: 600, height: 2000 + frameHeight(),
  } as DOMRect);
  frame.getBoundingClientRect = () => ({
    top: frameTop - preview.scrollTop, bottom: frameTop - preview.scrollTop + frameHeight(),
    height: frameHeight(),
  } as DOMRect);
  let nextFrame = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.set(++nextFrame, callback); return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  const flush = async () => {
    await act(async () => {
      const batch = [...frames.values()]; frames.clear();
      batch.forEach(callback => callback(performance.now()));
      await Promise.resolve();
    });
  };
  const settle = async () => { await flush(); await flush(); await flush(); };
  const events = createAppEventChannel();
  const suppress = vi.fn();
  const initial = { previewElement: preview, markdown: "some title\n\n```mermaid\nA\n```", documentPath: "/a.md" };
  const hook = renderHook(props => useReadingLayoutPreservation({
    ...props, events, suppressScrollSyncRestore: suppress,
  }), { initialProps: initial });
  const zoom = async (name: string, pressAcrossFrame = true) => {
    const button = screen.getByRole("button", { name });
    fireEvent.pointerDown(button, { button: 0, isPrimary: true });
    if (pressAcrossFrame) await flush();
    fireEvent.pointerUp(button);
    fireEvent.click(button);
    await settle();
  };
  return { preview, frame, region, canvas, svg, events, suppress, hook, initial,
    flush, settle, zoom,
    moveFrame(top: number) { frameTop = top; },
    dispose() { hook.unmount(); view.unmount(); },
  };
}

describe("diagram controls with reading position preservation", () => {
  it.each([false, true])("preserves zoom center and frame top with capped height=%s", async capped => {
    const f = await fixture(capped);
    await f.zoom("다이어그램 확대");
    expect(f.region.scrollLeft).toBe(365);
    expect(f.region.scrollTop).toBe(capped ? 140 : 0);
    expect(f.preview.scrollTop).toBe(600);
    expect(f.frame.getBoundingClientRect().top).toBe(40);
    await f.settle();
    expect(f.region.scrollLeft).toBe(365);
    f.dispose();
  });

  it("keeps the frame top through repeated zoom and explicit fitting", async () => {
    const f = await fixture();
    for (let index = 0; index < 4; index += 1) {
      await f.zoom("다이어그램 확대", index % 2 === 0);
      expect(f.frame.getBoundingClientRect().top).toBe(40);
    }
    for (let index = 0; index < 4; index += 1) {
      await f.zoom("다이어그램 축소");
      expect(f.frame.getBoundingClientRect().top).toBe(40);
    }
    await f.zoom("너비 맞춤");
    expect(f.frame.getBoundingClientRect().top).toBe(40);
    const left = f.region.scrollLeft;
    await f.zoom("너비 맞춤"); // A no-op must not leave restoration suspended.
    act(() => f.events.emit("reading-layout-will-change", undefined));
    f.moveFrame(740);
    await f.settle();
    expect(f.preview.scrollTop).toBe(700);
    expect(f.region.scrollLeft).toBe(left);
    f.dispose();
  });

  it("retains the new zoom position through later document layout restoration", async () => {
    const f = await fixture(true);
    await f.zoom("다이어그램 확대");
    expect(f.region.scrollLeft).toBe(365);
    act(() => f.events.emit("reading-layout-will-change", undefined));
    f.moveFrame(740);
    await f.settle();
    expect(f.preview.scrollTop).toBe(700);
    expect(f.region.scrollLeft).toBe(365);
    f.dispose();
  });
  it.each(["pointerUp", "pointerCancel", "lostPointerCapture", "blur"] as const)(
    "keeps drag position and resumes reading preservation after %s",
    async finish => {
      const f = await fixture(true);
      const originalSvg = f.svg();
      fireEvent.pointerDown(f.canvas, {
        isPrimary: true, pointerId: 1, button: 0, clientX: 200, clientY: 160,
      });
      await f.flush();
      fireEvent.pointerMove(f.canvas, {
        isPrimary: true, pointerId: 1, clientX: 150, clientY: 100,
      });
      await f.settle();
      expect(f.region.scrollLeft).toBe(370);
      expect(f.region.scrollTop).toBe(180);
      expect(f.svg()).toBe(originalSvg);
      if (finish === "blur") fireEvent.blur(window);
      else fireEvent[finish](f.canvas, { pointerId: 1 });
      await f.settle();
      expect(f.region.scrollLeft).toBe(370);
      expect(f.region.scrollTop).toBe(180);
      expect(f.preview.scrollTop).toBe(600);
      fireEvent.click(f.canvas);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      act(() => f.events.emit("reading-layout-will-change", undefined));
      f.moveFrame(740);
      await f.settle();
      expect(f.preview.scrollTop).toBe(700);
      expect(f.region.scrollLeft).toBe(370);
      expect(f.svg()).toBe(originalSvg);
      f.dispose();
    },
  );

  it("does not pull the preview back after the user scrolls during a drag", async () => {
    const f = await fixture(true);
    fireEvent.pointerDown(f.canvas, {
      isPrimary: true, pointerId: 1, button: 0, clientX: 200, clientY: 160,
    });
    await f.flush();
    fireEvent.pointerMove(f.canvas, {
      isPrimary: true, pointerId: 1, clientX: 150, clientY: 100,
    });
    fireEvent.wheel(f.preview);
    f.preview.scrollTop = 650;
    fireEvent.scroll(f.preview);
    fireEvent.pointerUp(f.canvas, { pointerId: 1 });
    await f.settle();
    expect(f.preview.scrollTop).toBe(650);
    expect(f.region.scrollLeft).toBe(370);
    f.dispose();
  });

  it("preserves the new view when external content is inserted after zoom", async () => {
    const f = await fixture(true);
    await f.zoom("다이어그램 확대");
    act(() => f.events.emit("external-content-will-apply", { commitToken: 1 }));
    f.frame.dataset.sourceOffset = "14";
    f.moveFrame(740);
    f.hook.rerender({ ...f.initial, markdown: "x\n" + f.initial.markdown });
    act(() => f.events.emit("external-content-applied", { commitToken: 1 }));
    await f.settle();
    expect(f.region.scrollLeft).toBe(365);
    expect(f.region.scrollTop).toBe(140);
    expect(f.preview.scrollTop).toBe(700);
    f.dispose();
  });

  it("cannot restore the previous document when a drag ends after navigation", async () => {
    const f = await fixture(true);
    fireEvent.pointerDown(f.canvas, {
      isPrimary: true, pointerId: 1, button: 0, clientX: 200, clientY: 160,
    });
    await f.flush();
    fireEvent.pointerMove(f.canvas, {
      isPrimary: true, pointerId: 1, clientX: 150, clientY: 100,
    });
    act(() => f.events.emit("reading-navigation-will-change", undefined));
    f.preview.dataset.documentPath = "/b.md";
    f.preview.scrollTop = 25;
    f.hook.rerender({ ...f.initial, documentPath: "/b.md", markdown: "B" });
    fireEvent.pointerUp(f.canvas, { pointerId: 1 });
    await f.settle();
    expect(f.preview.scrollTop).toBe(25);
    f.dispose();
  });

  it("does not move again when later layout notifications arrive without input", async () => {
    const f = await fixture(true);
    await f.zoom("다이어그램 확대");
    for (let index = 0; index < 12; index += 1) {
      fireEvent(f.region, new Event(previewLayoutChangeEvent, { bubbles: true }));
      await f.settle();
      expect(f.preview.scrollTop).toBe(600);
      expect(f.region.scrollLeft).toBe(365);
      expect(f.region.scrollTop).toBe(140);
    }
    f.dispose();
  });

  it("cancels pending editor synchronization while a diagram zoom commits", async () => {
    const f = await fixture();
    const editor = document.createElement("textarea");
    editor.value = f.initial.markdown;
    document.body.append(editor);
    Object.defineProperties(editor, {
      clientHeight: { value: 600 }, clientWidth: { value: 400 }, scrollHeight: { value: 2400 },
    });
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true, value: () => ({ top: 100 } as DOMRect),
    });
    editor.scrollTo = vi.fn(options => {
      editor.scrollTop = typeof options === "object" ? options.top ?? 0 : 0;
      fireEvent.scroll(editor);
    });
    f.preview.scrollTo = vi.fn(options => {
      f.preview.scrollTop = typeof options === "object" ? options.top ?? 0 : 0;
      fireEvent.scroll(f.preview);
    });
    const sync = renderHook(() => useScrollSync({
      enabled: true, active: true, markdown: f.initial.markdown,
      editorElement: editor, previewElement: f.preview,
    }));
    f.suppress.mockImplementation(sync.result.current.suppressScrollSyncRestore);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)); });
    editor.scrollTop = 1300;
    fireEvent.scroll(editor);
    // No frame between the pending editor scroll and the explicit zoom command.
    fireEvent.click(screen.getByRole("button", { name: "다이어그램 확대" }));
    await f.settle();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 160)); });
    await f.settle();
    expect(f.preview.scrollTop).toBe(600);
    expect(f.region.scrollLeft).toBe(365);
    expect(f.suppress).toHaveBeenCalled();
    sync.unmount(); editor.remove(); f.dispose();
    delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  });

  it("lets an external update replace a drag transaction without reviving its old anchor", async () => {
    const f = await fixture(true);
    fireEvent.pointerDown(f.canvas, {
      isPrimary: true, pointerId: 1, button: 0, clientX: 200, clientY: 160,
    });
    await f.flush();
    fireEvent.pointerMove(f.canvas, {
      isPrimary: true, pointerId: 1, clientX: 150, clientY: 100,
    });
    act(() => f.events.emit("external-content-will-apply", { commitToken: 1 }));
    f.frame.dataset.sourceOffset = "14";
    f.moveFrame(740);
    f.hook.rerender({ ...f.initial, markdown: "x\n" + f.initial.markdown });
    act(() => f.events.emit("external-content-applied", { commitToken: 1 }));
    await f.settle();
    fireEvent.pointerUp(f.canvas, { pointerId: 1 });
    await f.settle();
    expect(f.preview.scrollTop).toBe(700);
    expect(f.region.scrollLeft).toBe(370);
    f.dispose();
  });

  it("accepts the document-end clamp without repeatedly trying to restore an impossible position", async () => {
    const f = await fixture();
    f.moveFrame(2000);
    let storedTop = f.preview.scrollHeight - f.preview.clientHeight;
    const maximum = () => Math.max(0, f.preview.scrollHeight - f.preview.clientHeight);
    Object.defineProperty(f.preview, "scrollTop", {
      get: () => Math.min(storedTop, maximum()),
      set: value => { storedTop = Math.max(0, Math.min(value, maximum())); },
    });
    fireEvent.scroll(f.preview);
    await f.zoom("다이어그램 축소");
    const settledTop = f.preview.scrollTop;
    expect(settledTop).toBe(maximum());
    for (let index = 0; index < 8; index += 1) {
      fireEvent(f.region, new Event(previewLayoutChangeEvent, { bubbles: true }));
      await f.settle();
      expect(f.preview.scrollTop).toBe(settledTop);
    }
    f.dispose();
  });

});
