import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransientScrollbar } from "./useTransientScrollbar";

function Viewport({ name = "viewport" }: { name?: string }) {
  const ref = useTransientScrollbar();
  return <div ref={ref} data-testid={name}><div data-testid={`${name}-nested`} /></div>;
}
const opacity = (element: HTMLElement) => Number(element.style.getPropertyValue("--scrollbar-opacity"));
function metrics(element: HTMLElement) {
  Object.defineProperties(element, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { value: 400 }, scrollHeight: { value: 800 },
  });
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}),
  });
}
function pointer(element: HTMLElement | Window, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  fireEvent(element, event);
}

describe("transient native scrollbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const original = window.matchMedia;
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...original(query), matches: false }));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("ignores restoration, refresh and nested scrolling without a matching user scroll", () => {
    render(<Viewport />);
    const viewport = screen.getByTestId("viewport");
    fireEvent.scroll(viewport);
    fireEvent.wheel(viewport);
    fireEvent.scroll(screen.getByTestId("viewport-nested"));
    fireEvent.keyDown(viewport, { key: " " });
    pointer(viewport, "pointerleave", 0, 0);
    expect(opacity(viewport)).toBe(0);
    act(() => { vi.advanceTimersByTime(1001); });
    fireEvent.scroll(viewport);
    expect(opacity(viewport)).toBe(0);
  });

  it("keeps user scrolling visible, waits one second then fades without changing geometry or DOM", () => {
    render(<Viewport />);
    const viewport = screen.getByTestId("viewport");
    const nested = viewport.firstChild;
    viewport.scrollTop = 150;
    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    expect(opacity(viewport)).toBe(1);
    act(() => { vi.advanceTimersByTime(900); });
    fireEvent.scroll(viewport); // momentum extends the activity window
    act(() => { vi.advanceTimersByTime(999); });
    expect(opacity(viewport)).toBe(1);
    act(() => { vi.advanceTimersByTime(90); });
    expect(opacity(viewport)).toBeGreaterThan(0);
    expect(opacity(viewport)).toBeLessThan(1);
    act(() => { vi.advanceTimersByTime(120); });
    expect(opacity(viewport)).toBe(0);
    expect(viewport.firstChild).toBe(nested);
    expect(viewport.scrollTop).toBe(150);
    expect(viewport.style.overflow).toBe("");
  });

  it("reveals both edges and preserves native dragging until pointer release", () => {
    render(<Viewport />);
    const viewport = screen.getByTestId("viewport");
    metrics(viewport);
    pointer(viewport, "pointermove", 195, 50);
    expect(opacity(viewport)).toBe(1);
    pointer(viewport, "pointerdown", 195, 50);
    pointer(viewport, "pointerleave", 300, 50);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(opacity(viewport)).toBe(1);
    pointer(window, "pointerup", 300, 50);
    act(() => { vi.advanceTimersByTime(1200); });
    expect(opacity(viewport)).toBe(0);
    pointer(viewport, "pointermove", 50, 195);
    expect(opacity(viewport)).toBe(1);
  });

  it("keeps panels independent and cleans up listeners and animation on unmount", () => {
    const first = render(<Viewport name="one" />);
    render(<Viewport name="two" />);
    const one = screen.getByTestId("one");
    const two = screen.getByTestId("two");
    fireEvent.keyDown(one, { key: "PageDown" });
    fireEvent.scroll(one);
    expect(opacity(one)).toBe(1);
    expect(opacity(two)).toBe(0);
    first.unmount();
    expect(one.hasAttribute("data-transient-scrollbar")).toBe(false);
    fireEvent.wheel(one);
    fireEvent.scroll(one);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(one.style.getPropertyValue("--scrollbar-opacity")).toBe("");
  });

  it("honors reduced motion and hides on application blur", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(<Viewport />);
    const viewport = screen.getByTestId("viewport");
    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(opacity(viewport)).toBe(0);
    fireEvent.wheel(viewport);
    fireEvent.scroll(viewport);
    fireEvent(window, new Event("blur"));
    expect(opacity(viewport)).toBe(0);
  });
});
