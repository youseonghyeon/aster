import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { dismissAppMenu, showAppMenu, type AppMenuOptions } from "./AppMenu";

function setup() {
  const shell = document.createElement("div"); shell.className = "app-shell"; shell.dataset.theme = "night";
  const target = document.createElement("button"); target.textContent = "파일"; shell.append(target); document.body.append(shell);
  target.focus();
  const action = vi.fn(), disabled = vi.fn(), other = vi.fn();
  const options: AppMenuOptions = { label: "파일 메뉴", target, x: 40, y: 50,
    items: [{ id: "copy", label: "복사", icon: "/copy.svg", key: "c", action }, { separator: true },
      { id: "blocked", label: "삭제", enabled: false, action: disabled },
      { id: "name", label: "이름 복사", action: other }] };
  return { shell, target, action, disabled, other, options };
}
async function open(options: AppMenuOptions) {
  act(() => { void showAppMenu(options); });
  return screen.findByRole("menu");
}
afterEach(async () => { await act(async () => dismissAppMenu()); document.body.replaceChildren(); vi.restoreAllMocks(); });

it("inherits the app theme and retains an icon column for empty items", async () => {
  const { options, shell } = setup(); const menu = await open(options);
  expect(shell).toContainElement(menu);
  expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
  for (const item of screen.getAllByRole("menuitem")) expect(item.querySelector('.app-context-menu-icon')).not.toBeNull();
  expect(screen.getByRole("menuitem", { name: "삭제" })).toBeDisabled();
});
it("navigates enabled items and restores the trigger on Escape", async () => {
  const { options, target } = setup(); const menu = await open(options);
  fireEvent.keyDown(menu, { key: "ArrowDown" }); expect(screen.getByRole("menuitem", { name: "이름 복사" })).toHaveFocus();
  fireEvent.keyDown(menu, { key: "Home" }); expect(screen.getByRole("menuitem", { name: "복사" })).toHaveFocus();
  fireEvent.keyDown(menu, { key: "End" }); expect(screen.getByRole("menuitem", { name: "이름 복사" })).toHaveFocus();
  fireEvent.keyDown(menu, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument()); expect(target).toHaveFocus();
});
it("runs a command once and preserves keyboard copy while the menu owns focus", async () => {
  const { options, action } = setup(); const menu = await open(options);
  fireEvent.keyDown(menu, { key: "c", metaKey: true });
  fireEvent.keyDown(menu, { key: "c", metaKey: true });
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument()); expect(action).toHaveBeenCalledOnce();
});
it("does not run disabled or stale commands", async () => {
  const { options, action, disabled } = setup(); let valid = true; options.isValid = () => valid;
  await open(options); fireEvent.click(screen.getByRole("menuitem", { name: "삭제" })); expect(disabled).not.toHaveBeenCalled();
  valid = false; fireEvent.click(screen.getByRole("menuitem", { name: "복사" }));
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument()); expect(action).not.toHaveBeenCalled();
});
it("closes on outside pointer input without stealing the destination focus", async () => {
  const { options, shell } = setup(); const outside = document.createElement("input"); shell.append(outside);
  await open(options); fireEvent.pointerDown(outside); outside.focus();
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument()); expect(outside).toHaveFocus();
});
it("closes on background scroll but allows menu scrolling", async () => {
  const { options, shell } = setup(); const menu = await open(options);
  fireEvent.scroll(menu); expect(menu).toBeInTheDocument();
  fireEvent.scroll(shell); await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
});
it("clamps placement to the window and closes when the target disappears", async () => {
  const { options, target } = setup(); options.x = 2000; options.y = 2000;
  const bounds = { width: 220, height: 160, left: 0, top: 0, right: 220, bottom: 160, x: 0, y: 0, toJSON: () => ({}) };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(bounds);
  const menu = await open(options);
  expect(menu.style.left).toBe(`${window.innerWidth - 228}px`); expect(menu.style.top).toBe(`${window.innerHeight - 168}px`);
  target.remove(); await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
});
it("only keeps one menu open and releases it when dismissed", async () => {
  const { options } = setup(); await open(options); await open({ ...options, label: "두 번째" });
  await waitFor(() => expect(screen.getAllByRole("menu")).toHaveLength(1));
  expect(screen.getByRole("menu")).toHaveAccessibleName("두 번째");
});
