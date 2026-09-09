import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceContextMenu } from "./useWorkspaceContextMenu";
import { dismissAppMenu } from "./AppMenu";
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true, invoke }));
function Workspace() {
 const menu=useWorkspaceContextMenu();
 return <div className="app-shell" onContextMenu={menu.onContextMenu}><textarea aria-label="메모" defaultValue="한글 메모"/><input aria-label="검색" defaultValue="검색어"/><div data-testid="blank"/>{menu.error && <p role="alert">{menu.error}</p>}</div>;
}
afterEach(async()=>{ await act(async()=>dismissAppMenu()); vi.clearAllMocks(); });
it("suppresses a blank area's native menu without adding commands", () => {
 render(<Workspace/>); const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true}); fireEvent(screen.getByTestId('blank'),event);
 expect(event.defaultPrevented).toBe(true); expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
it("copies a selected input through the visible app menu and restores its range", async () => {
 render(<Workspace/>); const input=screen.getByRole('textbox',{name:'메모'}) as HTMLTextAreaElement; input.focus(); input.setSelectionRange(0,2);
 fireEvent.contextMenu(input); const copy=await screen.findByRole('menuitem',{name:'복사'}); input.setSelectionRange(0,0);
 fireEvent.click(copy); await waitFor(()=>expect(invoke).toHaveBeenCalledWith('perform_edit_command',{command:'copy'}));
 expect(input).toHaveFocus(); expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(2);
});
it("executes menu keyboard editing once and reports native failure", async () => {
 render(<Workspace/>); fireEvent.contextMenu(screen.getByRole('textbox',{name:'검색'})); const menu=await screen.findByRole('menu');
 invoke.mockRejectedValueOnce(new Error('inactive')); fireEvent.keyDown(menu,{key:'v',metaKey:true});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('실행하지 못했습니다')); expect(invoke).toHaveBeenCalledTimes(1);
});
it("refuses a command after its input value changed", async () => {
 render(<Workspace/>); const input=screen.getByRole('textbox',{name:'메모'}) as HTMLTextAreaElement;
 fireEvent.contextMenu(input); const paste=await screen.findByRole('menuitem',{name:'붙여넣기'}); input.value='자동 변경'; fireEvent.click(paste);
 await waitFor(()=>expect(screen.queryByRole('menu')).not.toBeInTheDocument()); expect(invoke).not.toHaveBeenCalled();
});
