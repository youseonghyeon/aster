import type {
  MenuItemOptions,
  PredefinedMenuItemOptions,
} from "@tauri-apps/api/menu";
import type { FolderEntry } from "./folder-gateway";

type ShowFolderContextMenuOptions = {
  entry: FolderEntry;
  x: number;
  y: number;
  canRemoveFile: boolean;
  onReload: () => void;
  onRemoveFile: () => void;
  onCopyFile?: () => void;
  onCopyName?: () => void;
};

export async function showFolderContextMenu({
  entry,
  x,
  y,
  canRemoveFile,
  onReload,
  onRemoveFile,
  onCopyFile,
  onCopyName,
}: ShowFolderContextMenuOptions) {
  const [{ LogicalPosition }, { Menu }] = await Promise.all([
    import("@tauri-apps/api/dpi"),
    import("@tauri-apps/api/menu"),
  ]);
  const items: Array<
    MenuItemOptions | PredefinedMenuItemOptions
  > = [
    {
      text: "Reload",
      action: onReload,
    },
  ];
  if (entry.kind !== "directory") {
    items.push(
      { item: "Separator" },
      { text: "파일 복사", accelerator: "CmdOrCtrl+C", action: onCopyFile },
      { text: "파일 이름 복사", accelerator: "CmdOrCtrl+Shift+C", action: onCopyName },
      { item: "Separator" },
      {
        text: "Delete",
        enabled: canRemoveFile,
        action: onRemoveFile,
      },
    );
  }

  const menu = await Menu.new({ items });
  try {
    await menu.popup(new LogicalPosition(x, y));
  } finally {
    await menu.close();
  }
}
