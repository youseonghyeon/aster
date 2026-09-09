import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentOutline } from "./DocumentOutline";

afterEach(() => vi.useRealTimers());

it("connects idle hiding to the actual outline navigation while preserving search and navigation", () => {
  vi.useFakeTimers();
  const onNavigate = vi.fn();
  const props = { items: [{ id: "one", depth: 1, title: "한글 제목" }, { id: "two", depth: 2, title: "두 번째" }],
    activeHeadingId: "one", documentKey: "doc", isModal: false, onClose: vi.fn(), onNavigate };
  const { rerender } = render(<DocumentOutline {...props} />);
  const nav = screen.getByRole("navigation", { name: "문서 제목" });
  expect(nav).toHaveAttribute("data-transient-scrollbar", "true");
  expect(nav).toHaveAttribute("data-overlay-scrollbar", "true");
  nav.scrollTop = 45;
  rerender(<DocumentOutline {...props} activeHeadingId="two" />);
  fireEvent.scroll(nav);
  expect(nav.style.getPropertyValue("--scrollbar-opacity")).toBe("0");
  expect(nav.scrollTop).toBe(45);
  fireEvent.wheel(nav);
  fireEvent.scroll(nav);
  expect(nav.style.getPropertyValue("--scrollbar-opacity")).toBe("1");
  act(() => { vi.advanceTimersByTime(1250); });
  expect(nav.style.getPropertyValue("--scrollbar-opacity")).toBe("0");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "한글" } });
  expect(screen.queryByRole("button", { name: "두 번째" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "한글 제목" }), { detail: 1 });
  expect(onNavigate).toHaveBeenCalledWith("one", false);
});


it("supports horizontal outline scrolling and keeps visible overlay controls inside the modal focus loop", () => {
  render(<DocumentOutline items={[{ id: "long", depth: 1, title: "긴 한글 제목의 마지막 부분" }]}
    activeHeadingId="long" documentKey="doc" isModal onClose={vi.fn()} onNavigate={vi.fn()} />);
  const nav = screen.getByRole("navigation", { name: "문서 제목" });
  Object.defineProperties(nav, {
    clientWidth: { value: 200 }, clientHeight: { value: 200 },
    scrollWidth: { value: 600 }, scrollHeight: { value: 200 },
  });
  fireEvent.scroll(nav);
  const horizontal = screen.getByRole("scrollbar", { name: "문서 제목 가로 스크롤" });
  expect(screen.queryByRole("scrollbar", { name: "문서 제목 세로 스크롤" })).not.toBeInTheDocument();
  horizontal.focus();
  fireEvent.keyDown(horizontal, { key: "End" });
  expect(nav.scrollLeft).toBe(400);
  fireEvent.keyDown(horizontal, { key: "Tab" });
  const close = screen.getByRole("button", { name: "목차 닫기" });
  expect(close).toHaveFocus();
  fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
  expect(horizontal).toHaveFocus();
});
