import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTransientScrollbar } from "./useTransientScrollbar";

function Fixture() {
  const ref = useTransientScrollbar("overlay");
  return <div data-testid="frame" className="overlay-scroll-frame">
    <div ref={ref} data-testid="viewport"><button>긴 한글 파일명.md</button></div>
    <div className="overlay-scrollbar-host" data-testid="host" />
  </div>;
}
function prepare(horizontal = false) {
  const result = render(<Fixture />);
  const viewport = screen.getByTestId("viewport");
  Object.defineProperties(viewport, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { value: horizontal ? 600 : 200 }, scrollHeight: { value: 800 },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
  });
  fireEvent.scroll(viewport);
  return { ...result, viewport, host: screen.getByTestId("host"), frame: screen.getByTestId("frame") };
}
function pointer(target: HTMLElement | Window, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("file scrollbar overlay", () => {
  it("uses a separate non-gutter layer and leaves it non-interactive after idle", () => {
    vi.useFakeTimers();
    const { viewport, host, frame } = prepare();
    expect(viewport).toHaveAttribute("data-overlay-scrollbar", "true");
    expect(viewport.nextElementSibling).toBe(host);
    expect(host).not.toHaveClass("is-visible");
    fireEvent.scroll(viewport); // programmatic changes do not reveal it
    expect(host).not.toHaveClass("is-visible");
    pointer(frame, "pointermove", 195, 30);
    expect(host).toHaveClass("is-visible");
    pointer(frame, "pointerleave", 220, 30);
    act(() => { vi.advanceTimersByTime(1250); });
    expect(host).not.toHaveClass("is-visible");
    expect(screen.getByRole("button", { name: "긴 한글 파일명.md" })).toBeInTheDocument();
  });

  it("maps thumb dragging to native scroll position and stops after release", () => {
    const { viewport } = prepare();
    const track = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
    const thumb = track.firstElementChild as HTMLElement;
    expect(thumb.style.height).toBe("50px");
    pointer(thumb, "pointerdown", 195, 10);
    pointer(window, "pointermove", 195, 35);
    expect(viewport.scrollTop).toBe(100);
    expect(track).toHaveAttribute("aria-valuenow", "100");
    pointer(window, "pointerup", 195, 35);
    pointer(window, "pointermove", 195, 60);
    expect(viewport.scrollTop).toBe(100);
    expect(track).toHaveAttribute("aria-controls", viewport.id);
  });

  it("supports track paging, keyboard focus, both axes and wheel over the visible control", () => {
    const { viewport, host } = prepare(true);
    const vertical = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
    const horizontal = screen.getByRole("scrollbar", { name: "파일 목록 가로 스크롤" });
    pointer(vertical, "pointerdown", 195, 150);
    expect(viewport.scrollTop).toBe(200);
    act(() => { horizontal.focus(); });
    expect(host).toHaveClass("is-visible");
    fireEvent.keyDown(horizontal, { key: "End" });
    expect(viewport.scrollLeft).toBe(400);
    fireEvent.keyDown(horizontal, { key: "Home" });
    expect(viewport.scrollLeft).toBe(0);
    fireEvent.wheel(horizontal, { deltaY: 60, shiftKey: true });
    expect(viewport.scrollLeft).toBe(60);
    fireEvent.keyDown(vertical, { key: "PageUp" });
    expect(viewport.scrollTop).toBe(0);
  });

  it("cleans up the adapter, generated ID, captured drag and pending observers", () => {
    const { viewport, host, unmount } = prepare();
    const track = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
    pointer(track.firstElementChild as HTMLElement, "pointerdown", 195, 10);
    unmount();
    expect(host.children).toHaveLength(0);
    expect(host).not.toHaveClass("is-visible");
    expect(host.style.opacity).toBe("");
    expect(viewport).not.toHaveAttribute("id");
    expect(viewport).not.toHaveAttribute("data-overlay-scrollbar");
    pointer(window, "pointermove", 195, 60);
    expect(viewport.scrollTop).toBe(0);
  });
});


it("keeps nested file scrollports independent with only overflowing tracks present", () => {
  function Nested() {
    const outerRef = useTransientScrollbar("overlay");
    const innerRef = useTransientScrollbar("overlay");
    return <div className="overlay-scroll-frame">
      <div ref={outerRef} data-testid="outer">
        <div className="overlay-scroll-frame">
          <div ref={innerRef} data-testid="inner"><button>문서.md</button></div>
          <div className="overlay-scrollbar-host" data-testid="inner-host" />
        </div>
      </div>
      <div className="overlay-scrollbar-host" data-testid="outer-host" />
    </div>;
  }
  render(<Nested />);
  const outer = screen.getByTestId("outer");
  const inner = screen.getByTestId("inner");
  for (const element of [outer, inner]) {
    Object.defineProperties(element, {
      clientWidth: { value: 200 }, clientHeight: { value: 200 },
      scrollWidth: { value: 200 }, scrollHeight: { value: element === inner ? 800 : 200 },
    });
    fireEvent.scroll(element);
  }
  expect(screen.getAllByRole("scrollbar")).toHaveLength(1);
  fireEvent.wheel(inner, { deltaY: 50 });
  inner.scrollTop = 50;
  fireEvent.scroll(inner);
  expect(screen.getByTestId("inner-host")).toHaveClass("is-visible");
  expect(screen.getByTestId("outer-host")).not.toHaveClass("is-visible");
  expect(outer.scrollTop).toBe(0);
});

it("updates scroll limits after content mutation without revealing an idle overlay", async () => {
  vi.useFakeTimers();
  render(<Fixture />);
  const viewport = screen.getByTestId("viewport");
  let contentHeight = 800;
  Object.defineProperties(viewport, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { value: 200 }, scrollHeight: { get: () => contentHeight },
  });
  fireEvent.scroll(viewport);
  const track = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
  expect(track).toHaveAttribute("aria-valuemax", "600");
  contentHeight = 1200;
  await act(async () => { viewport.append(document.createElement("p")); });
  act(() => { vi.advanceTimersByTime(20); });
  expect(track).toHaveAttribute("aria-valuemax", "1000");
  expect(screen.getByTestId("host")).not.toHaveClass("is-visible");
  contentHeight = 100;
  await act(async () => { viewport.lastElementChild?.remove(); });
  act(() => { vi.advanceTimersByTime(20); });
  expect(screen.queryByRole("scrollbar")).not.toBeInTheDocument();
});

it("reserves a single corner and clamps horizontal dragging to the content end", () => {
  const { viewport } = prepare(true);
  const vertical = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
  const horizontal = screen.getByRole("scrollbar", { name: "파일 목록 가로 스크롤" });
  expect(vertical.style.height).toBe("190px");
  expect(horizontal.style.width).toBe("190px");
  pointer(horizontal.firstElementChild as HTMLElement, "pointerdown", 10, 195);
  pointer(window, "pointermove", 1000, 195);
  expect(viewport.scrollLeft).toBe(400);
  pointer(window, "pointermove", -1000, 195);
  expect(viewport.scrollLeft).toBe(0);
  pointer(window, "pointerup", -1000, 195);
});


it("restores a keyboard-focused track after app activation and preserves zoom gestures", () => {
  const { viewport, host } = prepare();
  const track = screen.getByRole("scrollbar", { name: "파일 목록 세로 스크롤" });
  act(() => { track.focus(); });
  expect(host).toHaveClass("is-visible");
  fireEvent(window, new Event("blur"));
  expect(host).not.toHaveClass("is-visible");
  fireEvent(window, new Event("focus"));
  expect(host).toHaveClass("is-visible");
  fireEvent.wheel(track, { deltaY: 50, ctrlKey: true });
  expect(viewport.scrollTop).toBe(0);
});
