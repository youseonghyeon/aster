import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentOutline } from "./DocumentOutline";

const native = vi.hoisted(() => ({
  isTauri: true,
  create: vi.fn(), popup: vi.fn(), close: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => native.isTauri }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: native.create } }));
const props = {
  items: [{ id: "heading-0", title: "제목", depth: 2, offset: 0 }],
  activeHeadingId: null, documentKey: "/doc.md", isModal: true,
  onClose: vi.fn(), onNavigate: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks(); native.isTauri = true;
  native.create.mockResolvedValue({ popup: native.popup, close: native.close });
  native.popup.mockResolvedValue(undefined); native.close.mockResolvedValue(undefined);
});
describe("outline context menu", () => {
  it("suppresses the outline menu without adding copy or reload actions", async () => {
    render(<DocumentOutline {...props} />);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 32, clientY: 60 });
    fireEvent(screen.getByRole("navigation"), event);
    expect(event.defaultPrevented).toBe(true);
    await Promise.resolve();
    fireEvent.keyDown(screen.getByRole("button", { name: "제목" }), { key: "F10", shiftKey: true });
    await Promise.resolve();
    expect(native.create).not.toHaveBeenCalled();
    expect(native.popup).not.toHaveBeenCalled();
    expect(props.onNavigate).not.toHaveBeenCalled();
  });
  it("preserves the search input's native editing commands and current query", async () => {
    render(<DocumentOutline {...props} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "제목" } });
    screen.getByRole("button", {name:"목차 닫기"}).focus();
    fireEvent.contextMenu(input);
    await waitFor(() => expect(native.create).toHaveBeenCalled());
    expect(native.create.mock.calls[0][0].items.map((item: {item: string}) => item.item))
      .toEqual(["Undo", "Redo", "Separator", "Cut", "Copy", "Paste", "SelectAll"]);
    expect(input).toHaveValue("제목"); expect(input).toHaveFocus();
  });
  it("handles keyboard menu access without intercepting copy or reload shortcuts", async () => {
    render(<DocumentOutline {...props} />);
    const input = screen.getByRole("searchbox");
    fireEvent.keyDown(input, { key: "F10", shiftKey: true });
    await waitFor(() => expect(native.create).toHaveBeenCalledOnce());
    for (const key of ["c", "r"]) {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, metaKey: true, key });
      fireEvent(input, event); expect(event.defaultPrevented).toBe(false);
    }
    expect(native.create).toHaveBeenCalledOnce();
  });
  it("does not intercept menus outside the outline or in a browser", () => {
    render(<><DocumentOutline {...props} /><div data-testid="outside">outside</div></>);
    const outside = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(screen.getByTestId("outside"), outside); expect(outside.defaultPrevented).toBe(false);
    native.isTauri = false;
    const browser = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("navigation"), browser); expect(browser.defaultPrevented).toBe(false);
    expect(native.create).not.toHaveBeenCalled();
  });
  it("keeps the modal Tab focus boundary", () => {
    render(<DocumentOutline {...props} />);
    const last = screen.getByRole("button", {name:"제목"}); last.focus();
    fireEvent.keyDown(last, {key:"Tab"}); expect(screen.getByRole("button", {name:"목차 닫기"})).toHaveFocus();
  });
});
