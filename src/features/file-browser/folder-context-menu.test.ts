import { Menu, NativeIcon } from "@tauri-apps/api/menu";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { showFolderContextMenu } from "./folder-context-menu";

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: { new: vi.fn() },
  NativeIcon: {
    Refresh: "Refresh",
    TrashEmpty: "TrashEmpty",
  },
}));

describe("folder context menu", () => {
  const popup = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    popup.mockClear();
    close.mockClear();
    vi.mocked(Menu.new).mockReset();
    vi.mocked(Menu.new).mockResolvedValue({ popup, close } as never);
  });

  it("keeps the native Reload item and adds confirmed file removal", async () => {
    const onReload = vi.fn();
    const onRemoveFile = vi.fn();

    await showFolderContextMenu({
      entry: {
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      },
      x: 120,
      y: 80,
      canRemoveFile: true,
      onReload,
      onRemoveFile,
    });

    const items = vi.mocked(Menu.new).mock.calls[0]?.[0]?.items ?? [];
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      text: "Reload",
      icon: NativeIcon.Refresh,
    });
    expect(items[1]).toEqual({ item: "Separator" });
    expect(items[2]).toMatchObject({
      text: "Delete",
      icon: NativeIcon.TrashEmpty,
      enabled: true,
    });
    if ("action" in items[0]!) items[0].action?.("reload");
    if ("action" in items[2]!) items[2].action?.("remove");
    expect(onReload).toHaveBeenCalledOnce();
    expect(onRemoveFile).toHaveBeenCalledOnce();
    expect(popup).toHaveBeenCalledWith(
      expect.objectContaining({ x: 120, y: 80 }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("leaves directory menus unchanged with only Reload", async () => {
    await showFolderContextMenu({
      entry: {
        name: "guide",
        relativePath: "guide",
        path: "/docs/guide",
        kind: "directory",
      },
      x: 0,
      y: 0,
      canRemoveFile: false,
      onReload: vi.fn(),
      onRemoveFile: vi.fn(),
    });

    expect(vi.mocked(Menu.new).mock.calls[0]?.[0]?.items).toEqual([
      expect.objectContaining({
        text: "Reload",
        icon: NativeIcon.Refresh,
      }),
    ]);
  });
});
