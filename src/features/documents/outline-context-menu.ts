import type { PredefinedMenuItemOptions } from "@tauri-apps/api/menu";

/** Scope the menu to the outline; never disable WebView reload globally. */
export async function showOutlineContextMenu(
  target: HTMLElement,
  x: number,
  y: number,
) {
  const input = target.closest("input, textarea");
  const editable = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement;
  if (editable) input.focus({ preventScroll: true });
  const [{ Menu }, { LogicalPosition }] = await Promise.all([
    import("@tauri-apps/api/menu"),
    import("@tauri-apps/api/dpi"),
  ]);
  if (!target.isConnected) return;
  const items: PredefinedMenuItemOptions[] = editable
    ? [
        { item: "Undo", text: "실행 취소" },
        { item: "Redo", text: "다시 실행" },
        { item: "Separator" },
        { item: "Cut", text: "잘라내기" },
        { item: "Copy", text: "복사" },
        { item: "Paste", text: "붙여넣기" },
        { item: "SelectAll", text: "전체 선택" },
      ]
    : [{ item: "Copy", text: "복사" }];
  const menu = await Menu.new({ items });
  try {
    if (target.isConnected) await menu.popup(new LogicalPosition(x, y));
  } finally {
    await menu.close();
  }
}
