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
  expect(nav).not.toHaveAttribute("data-overlay-scrollbar");
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
