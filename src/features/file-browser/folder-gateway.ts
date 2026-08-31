import { invoke } from "@tauri-apps/api/core";
import { confirm, open } from "@tauri-apps/plugin-dialog";

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

export type FolderMarkdownDocument = {
  path: string;
  name: string;
  content: string;
  revision: string;
  format: { hasBom: boolean; lineEnding: "lf" | "crlf" };
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

export function readFolderMarkdown(
  rootPath: string,
  relativePath: string,
): Promise<FolderMarkdownDocument> {
  return invoke<FolderMarkdownDocument>("read_folder_markdown", {
    rootPath,
    relativePath,
  });
}

export function confirmFolderFileRemoval(fileName: string): Promise<boolean> {
  return confirm(
    `“${fileName}”을 디스크에서 제거합니다. 이 작업은 되돌릴 수 없습니다. 계속할까요?`,
    {
      title: "파일 제거",
      kind: "warning",
      okLabel: "파일 제거",
      cancelLabel: "취소",
    },
  );
}

export function removeFolderFile(
  rootToken: number,
  relativePath: string,
): Promise<void> {
  return invoke<void>("remove_folder_file", { rootToken, relativePath });
}
