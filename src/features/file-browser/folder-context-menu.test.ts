import { beforeEach, expect, it, vi } from "vitest";
import { showAppMenu } from "../../components/menu/AppMenu";
import { showFolderContextMenu } from "./folder-context-menu";
vi.mock("../../components/menu/AppMenu", () => ({ showAppMenu: vi.fn(async () => undefined) }));
beforeEach(() => vi.clearAllMocks());
it("uses aligned application menu items with existing file actions", async () => {
  const reload = vi.fn(), remove = vi.fn(), copy = vi.fn(), name = vi.fn();
  await showFolderContextMenu({ entry: { name: "한글.md", relativePath: "한글.md", path: "/docs/한글.md", kind: "markdown" },
    x: 120, y: 80, canRemoveFile: false, onReload: reload, onRemoveFile: remove, onCopyFile: copy, onCopyName: name });
  const options = vi.mocked(showAppMenu).mock.calls[0][0];
  expect(options).toMatchObject({ x: 120, y: 80 });
  const items = options.items.flatMap((item) => "separator" in item ? [] : [item]);
  expect(items.map((item) => item.label)).toEqual(["다시 로드", "복사", "이름 복사", "삭제..."]);
  expect(items[0].icon).toBeTruthy(); expect(items[1].icon).toBeTruthy();
  expect(items[2].icon).toBeUndefined(); expect(items[3].icon).toBeTruthy();
  expect(items[3].enabled).toBe(false);
  items.forEach((item) => item.action());
  for (const action of [reload, remove, copy, name]) expect(action).toHaveBeenCalledOnce();
});
it("only offers reload for directories", async () => {
  await showFolderContextMenu({ entry: { name: "docs", relativePath: "docs", path: "/docs", kind: "directory" },
    x: 0, y: 0, canRemoveFile: false, onReload: vi.fn(), onRemoveFile: vi.fn() });
  expect(vi.mocked(showAppMenu).mock.calls[0][0].items).toEqual([expect.objectContaining({ id: "reload" })]);
});
