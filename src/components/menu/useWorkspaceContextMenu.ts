import { useEffect, useState, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { editableTarget, showEditMenu, captureTextSelection, performEditCommand } from "./edit-menu";
import { showAppMenu } from "./AppMenu";
import copyIcon from "../../assets/icons/copy.svg";

export function useWorkspaceContextMenu() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const report = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("aster:edit-menu-error", report);
    return () => window.removeEventListener("aster:edit-menu-error", report);
  }, []);
  function onContextMenu(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || !isTauri()) return;
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : event.currentTarget;
    const input = editableTarget(target);
    setError(null);
    if (input) { void showEditMenu(input, event.clientX, event.clientY, setError); return; }
    const captured = captureTextSelection(event.currentTarget);
    if (!captured) return;
    void showAppMenu({ label: "선택 내용", target: target instanceof HTMLElement ? target : event.currentTarget,
      x: event.clientX, y: event.clientY, isValid: captured.valid,
      items: [{ id: "copy", label: "복사", icon: copyIcon, key: "c", shortcut: "⌘C", action: () => {
        if (captured.restore()) void performEditCommand("copy").catch(() => setError("복사하지 못했습니다. 다시 시도해 주세요."));
      } }] });
  }
  return { onContextMenu, error };
}
