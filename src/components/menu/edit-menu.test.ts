import { beforeEach, expect, it, vi } from "vitest";
import { showEditMenu, captureTextSelection } from "./edit-menu";
import type { AppMenuOptions, AppMenuItem } from "./AppMenu";
const mocks = vi.hoisted(() => ({ invoke: vi.fn().mockResolvedValue(undefined), show: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("./AppMenu", () => ({ showAppMenu: mocks.show }));
const command = (id: string) => (mocks.show.mock.lastCall![0] as AppMenuOptions).items.find((i) => !("separator" in i) && i.id === id) as Exclude<AppMenuItem, {separator: true}>;
beforeEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });
it("restores Korean input selection before invoking editing without mutating its value", () => {
 const input = document.createElement('textarea'); document.body.append(input); input.value = '안녕 테스트'; input.setSelectionRange(3,6);
 showEditMenu(input, 1,2,vi.fn()); input.setSelectionRange(0,0); command('cut').action();
 expect(input).toHaveFocus(); expect(input.selectionStart).toBe(3); expect(input.selectionEnd).toBe(6);
 expect(input.value).toBe('안녕 테스트'); expect(mocks.invoke).toHaveBeenCalledWith('perform_edit_command',{command:'cut'});
});
it("disables mutations for a read-only source and copy with no selection", () => {
 const input = document.createElement('textarea'); document.body.append(input); input.value='source'; input.readOnly=true;
 showEditMenu(input,0,0,vi.fn());
 for (const id of ['undo','redo','cut','paste','copy']) expect(command(id).enabled).toBe(false);
 expect(command('selectAll').enabled).toBe(true);
});
it("rejects old menu actions after content replacement or removal", () => {
 const input=document.createElement('textarea'); document.body.append(input); input.value='before';
 showEditMenu(input,0,0,vi.fn()); input.value='after'; command('paste').action();
 input.remove(); command('undo').action(); expect(mocks.invoke).not.toHaveBeenCalled();
});
it("reports invocation failure", async () => {
 const input=document.createElement('textarea'); document.body.append(input); const error=vi.fn();
 mocks.invoke.mockRejectedValueOnce(new Error('failed')); showEditMenu(input,0,0,error); command('paste').action();
 await vi.waitFor(()=>expect(error).toHaveBeenCalledWith(expect.stringContaining('실행하지 못했습니다')));
});
it("restores a rich document range and refuses a replaced node", () => {
 const article=document.createElement('article'); article.innerHTML='<h2>제목</h2><p><b>본문</b></p>'; document.body.append(article);
 const range=document.createRange(); range.selectNodeContents(article); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
 const captured=captureTextSelection(article)!; window.getSelection()!.removeAllRanges(); expect(captured.restore()).toBe(true);
 expect(window.getSelection()!.toString()).toBe('제목본문'); article.innerHTML='<p>다른 문서</p>'; expect(captured.valid()).toBe(false);
});
