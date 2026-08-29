import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type FolderRoot = {
  token: number;
  path: string;
  name: string;
};

export type FolderEntryKind = "directory" | "markdown" | "image";

export type FolderEntry = {
  name: string;
  relativePath: string;
  path: string;
  kind: FolderEntryKind;
};

export type FolderListing = {
  rootToken: number;
  directory: string;
  entries: FolderEntry[];
  truncated: boolean;
};

export async function chooseFolderPath(): Promise<string | null> {
  const selected = await open({
    title: "Markdown 폴더 선택",
    multiple: false,
    directory: true,
  });
  return typeof selected === "string" && selected ? selected : null;
}

export function openFolderRoot(path: string): Promise<FolderRoot> {
  return invoke<FolderRoot>("open_folder", { path });
}

export function listFolderChildren(
  rootToken: number,
  relativePath: string,
): Promise<FolderListing> {
  return invoke<FolderListing>("list_folder_children", {
    request: { rootToken, relativePath },
  });
}

export function closeFolderRoot(rootToken?: number): Promise<void> {
  return invoke<void>("close_folder", { rootToken });
}

export function openFolderImage(
  rootToken: number,
  relativePath: string,
): Promise<void> {
  return invoke<void>("open_folder_image", { rootToken, relativePath });
}
