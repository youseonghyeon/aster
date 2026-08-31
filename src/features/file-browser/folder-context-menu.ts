import type {
  IconMenuItemOptions,
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
};

export async function showFolderContextMenu({
  entry,
  x,
  y,
  canRemoveFile,
  onReload,
  onRemoveFile,
}: ShowFolderContextMenuOptions) {
  const [{ LogicalPosition }, { Menu, NativeIcon }] = await Promise.all([
    import("@tauri-apps/api/dpi"),
    import("@tauri-apps/api/menu"),
  ]);
  const items: Array<
    IconMenuItemOptions | MenuItemOptions | PredefinedMenuItemOptions
  > = [
    {
      text: "Reload",
      icon: NativeIcon.Refresh,
      action: onReload,
    },
  ];
  if (entry.kind !== "directory") {
    items.push(
      { item: "Separator" },
      {
        text: "Delete",
        icon: NativeIcon.TrashEmpty,
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
