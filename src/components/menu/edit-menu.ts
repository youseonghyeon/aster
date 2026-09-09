import { invoke } from "@tauri-apps/api/core";
import { showAppMenu, type AppMenuItem } from "./AppMenu";
import copyIcon from "../../assets/icons/copy.svg";

export type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
export const performEditCommand = (command: EditCommand) => invoke<void>("perform_edit_command", { command });

export function editableTarget(target: Element) {
  const input = target.closest("input,textarea");
  return (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) &&
    input.selectionStart !== null ? input : null;
}

export function showEditMenu(input: HTMLInputElement | HTMLTextAreaElement, x: number, y: number, onError: (message: string) => void) {
  input.focus({ preventScroll: true });
  const { value, selectionStart, selectionEnd, selectionDirection } = input;
  const selected = selectionStart !== selectionEnd;
  const writable = !input.readOnly && !input.disabled;
  const isValid = () => input.isConnected && input.value === value && !input.disabled;
  const run = (command: EditCommand) => {
    if (!isValid()) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    void performEditCommand(command).catch(() => onError("편집 명령을 실행하지 못했습니다. 다시 시도해 주세요."));
  };
  const item = (command: EditCommand, label: string, shortcut: string, key: string, enabled = true, shift = false): AppMenuItem =>
    ({ id: command, label, shortcut, key, shift, enabled, icon: command === "copy" ? copyIcon : undefined, action: () => run(command) });
  return showAppMenu({ label: "편집 메뉴", target: input, x, y, isValid, items: [
    item("undo", "실행 취소", "⌘Z", "z", writable), item("redo", "다시 실행", "⇧⌘Z", "z", writable, true),
    { separator: true }, item("cut", "잘라내기", "⌘X", "x", writable && selected),
    item("copy", "복사", "⌘C", "c", selected), item("paste", "붙여넣기", "⌘V", "v", writable),
    item("selectAll", "전체 선택", "⌘A", "a", value.length > 0),
  ] });
}

export function captureTextSelection(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0).cloneRange();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const text = range.toString();
  const valid = () => root.isConnected && root.contains(range.startContainer) && root.contains(range.endContainer) && range.toString() === text;
  return { range, valid, restore: () => {
    if (!valid()) return false;
    const oldTabIndex = root.getAttribute("tabindex");
    root.setAttribute("tabindex", "-1"); root.focus({ preventScroll: true });
    if (oldTabIndex === null) root.removeAttribute("tabindex"); else root.setAttribute("tabindex", oldTabIndex);
    selection.removeAllRanges(); selection.addRange(range);
    return true;
  } };
}
