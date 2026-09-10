import { showAppMenu, type AppMenuItem } from "../../components/menu/AppMenu";
import reloadIconUrl from "../../assets/icons/reload.svg";
import trashIconUrl from "../../assets/icons/trash.svg";
import copyIconUrl from "../../assets/icons/copy.svg";
import type { FolderEntry } from "./folder-gateway";

type ShowFolderContextMenuOptions = {
  entry: FolderEntry; x: number; y: number; canRemoveFile: boolean;
  onReload: () => void; onRemoveFile: () => void;
  onCopyFile?: () => void; onCopyName?: () => void;
  target?: HTMLElement; isValid?: () => boolean;
};

export function showFolderContextMenu(options: ShowFolderContextMenuOptions) {
  const items: AppMenuItem[] = [{ id: "reload", label: "다시 로드", icon: reloadIconUrl, action: options.onReload }];
  if (options.entry.kind !== "directory") {
    items.push(
      { separator: true },
      { id: "copy", label: "복사", icon: copyIconUrl, shortcut: "⌘C", key: "c", action: () => options.onCopyFile?.() },
      { id: "copy-name", label: "이름 복사", shortcut: "⇧⌘C", key: "c", shift: true, action: () => options.onCopyName?.() },
      { separator: true },
      { id: "delete", label: "삭제...", icon: trashIconUrl, enabled: options.canRemoveFile, action: options.onRemoveFile },
    );
  }
  return showAppMenu({ label: "파일 메뉴", items, x: options.x, y: options.y,
    target: options.target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : document.body),
    isValid: options.isValid });
}
