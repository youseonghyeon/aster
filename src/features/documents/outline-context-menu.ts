import { editableTarget, showEditMenu } from "../../components/menu/edit-menu";

/** No menu for outline headings; its search field keeps standard editing actions. */
export async function showOutlineContextMenu(target: HTMLElement, x: number, y: number) {
  const input = editableTarget(target);
  if (!input) return;
  await showEditMenu(input, x, y, (message) => {
    window.dispatchEvent(new CustomEvent("aster:edit-menu-error", { detail: message }));
  });
}
