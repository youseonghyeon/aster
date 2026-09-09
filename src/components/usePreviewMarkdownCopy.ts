import { showAppMenu } from "./menu/AppMenu";
import { captureTextSelection, performEditCommand } from "./menu/edit-menu";
import copyIcon from "../assets/icons/copy.svg";
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
    event.preventDefault(); event.stopPropagation();
    const captured = capture();
    const root = rootRef.current;
    if (!root || !captured) return;
    const selection = captureTextSelection(root);
    if (!selection) return;
    const capturedRevision = revisionRef.current;
    try {
      await showAppMenu({ label: "미리보기 복사", target: root, x: event.clientX, y: event.clientY,
        isValid: () => selection.valid() && capturedRevision === revisionRef.current,
        items: [
          { id: "copy", label: "복사", icon: copyIcon, shortcut: "⌘C", key: "c", action: () => {
            if (selection.restore()) void performEditCommand("copy").catch(() => setError("복사하지 못했습니다. 다시 시도해 주세요."));
          } },
          { id: "markdown", label: "Markdown으로 복사", shortcut: "⇧⌘C", key: "c", shift: true, action: () => void captured.copy() },
        ] });
    } catch { setError("복사 메뉴를 열지 못했습니다. 단축키를 사용해 주세요."); }
  };
  return { onContextMenu, error };
}
