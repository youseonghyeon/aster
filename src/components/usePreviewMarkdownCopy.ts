import { useEffect, useRef, useState, type RefObject, type MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { selectedMarkdown, writeMarkdownClipboard } from "../lib/preview-markdown-copy";

export function usePreviewMarkdownCopy(rootRef: RefObject<HTMLElement | null>, revision: string) {
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const [error, setError] = useState<string | null>(null);
  const capture = () => {
    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0).cloneRange();
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const content = selectedMarkdown(root, range);
    const capturedRevision = revisionRef.current;
    const originalText = range.toString();
    return {
      copy: async () => {
        if (!root.isConnected || capturedRevision !== revisionRef.current || !root.contains(range.startContainer) || !root.contains(range.endContainer) || range.toString() !== originalText) {
          setError("문서가 변경됐습니다. 내용을 다시 선택해 주세요."); return;
        }
        if (!content) { setError("이 선택은 Markdown으로 복사할 수 없습니다. 일반 복사를 사용해 주세요."); return; }
        try { await writeMarkdownClipboard(content); setError(null); }
        catch { setError("복사하지 못했습니다. 다시 시도해 주세요."); }
      },
    };
  };
  const captureRef = useRef(capture);
  captureRef.current = capture;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "c") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input,textarea,[contenteditable=true],[role=tree]")) return;
      const root = rootRef.current;
      // Selection can remain in preview while focus moves elsewhere. Never steal that other pane's command.
      const active = document.activeElement;
      if (active && active !== document.body && root && !root.contains(active) && !active.contains(root)) return;
      const captured = captureRef.current();
      if (!captured) return;
      event.preventDefault(); event.stopPropagation(); void captured.copy();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [rootRef]);
  const onContextMenu = async (event: MouseEvent<HTMLElement>) => {
    if (!isTauri()) return;
    const captured = capture();
    if (!captured) return;
    event.preventDefault(); event.stopPropagation();
    const { clientX, clientY } = event;
    try {
      const [{ Menu }, { LogicalPosition }] = await Promise.all([import("@tauri-apps/api/menu"), import("@tauri-apps/api/dpi")]);
      const menu = await Menu.new({ items: [
        { item: "Copy", text: "복사" },
        { text: "Markdown으로 복사", action: () => void captured.copy() },
      ] });
      try { await menu.popup(new LogicalPosition(clientX, clientY)); } finally { await menu.close(); }
    } catch { setError("복사 메뉴를 열지 못했습니다. 단축키를 사용해 주세요."); }
  };
  return { onContextMenu, error };
}
