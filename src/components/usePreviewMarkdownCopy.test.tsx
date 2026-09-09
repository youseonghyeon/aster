import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePreviewMarkdownCopy } from "./usePreviewMarkdownCopy";
const mocks = vi.hoisted(() => ({ write: vi.fn(), items: [] as Array<{item?: string; action?: () => void}>, popup: vi.fn(), close: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: {new: vi.fn(async ({items}) => { mocks.items = items; return {popup: mocks.popup, close: mocks.close}; })} }));
vi.mock("@tauri-apps/api/dpi", () => ({ LogicalPosition: class {} }));
vi.mock("../lib/preview-markdown-copy", async (original) => ({...await original<object>(), writeMarkdownClipboard: mocks.write}));
function Preview({content = "제목"}) { const ref = useRef<HTMLElement>(null); const copy = usePreviewMarkdownCopy(ref,content); return <><article ref={ref} onContextMenu={copy.onContextMenu}><h2>{content}</h2></article><textarea aria-label="메모"/>{copy.error && <p role="status">{copy.error}</p>}</>; }
function select(node: Node) { const range=document.createRange(); range.selectNodeContents(node); const s=window.getSelection()!; s.removeAllRanges(); s.addRange(range); }
afterEach(() => { vi.clearAllMocks(); window.getSelection()?.removeAllRanges(); });
describe("preview copy commands", () => {
 it("leaves ordinary copy alone and converts only Shift copy", async () => {
  const {container}=render(<Preview/>); select(container.querySelector('h2')!);
  expect(fireEvent.keyDown(document.body,{key:'c',metaKey:true})).toBe(true); expect(mocks.write).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(document.body,{key:'c',metaKey:true,shiftKey:true})).toBe(false);
  await waitFor(()=>expect(mocks.write).toHaveBeenCalledWith('## 제목'));
 });
 it("does not steal editor copy with a retained preview selection", () => {
  const {container}=render(<Preview/>); select(container.querySelector('h2')!); const input=container.querySelector('textarea')!; input.focus();
  fireEvent.keyDown(input,{key:'C',metaKey:true,shiftKey:true}); expect(mocks.write).not.toHaveBeenCalled();
 });
 it("uses native ordinary Copy and snapshot Markdown action in context menu", async () => {
  const {container}=render(<Preview/>); const heading=container.querySelector('h2')!; select(heading); fireEvent.contextMenu(heading);
  await waitFor(()=>expect(mocks.popup).toHaveBeenCalled()); expect(mocks.items[0].item).toBe('Copy');
  await act(async()=>mocks.items[1].action?.()); expect(mocks.write).toHaveBeenCalledWith('## 제목');
 });
 it("refuses an old menu action after automatic content replacement", async () => {
  const {container,rerender,getByRole}=render(<Preview/>); const heading=container.querySelector('h2')!; select(heading); fireEvent.contextMenu(heading);
  await waitFor(()=>expect(mocks.popup).toHaveBeenCalled()); rerender(<Preview content="새 제목"/>);
  await act(async()=>mocks.items[1].action?.()); expect(mocks.write).not.toHaveBeenCalled(); expect(getByRole('status')).toHaveTextContent('다시 선택');
 });
 it("reports clipboard failure without claiming success", async () => {
  mocks.write.mockRejectedValueOnce(new Error('denied')); const {container,getByRole}=render(<Preview/>); select(container.querySelector('h2')!);
  fireEvent.keyDown(document.body,{key:'c',metaKey:true,shiftKey:true}); await waitFor(()=>expect(getByRole('status')).toHaveTextContent('복사하지 못했습니다'));
 });
});
