import { invoke, isTauri } from "@tauri-apps/api/core";
import { confirm, message, open } from "@tauri-apps/plugin-dialog";

export type OpenedMarkdownFile = {
  path: string;
  name: string;
  content: string;
  revision: string;
};

export type MarkdownFileStatus =
  | { kind: "available"; revision: string }
  | { kind: "unavailable"; message: string };

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export async function chooseMarkdownFilePath(): Promise<string | null> {
  const selectedPath = await open({
    title: "Markdown 파일 열기",
    multiple: false,
    directory: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  return selectedPath || null;
}

export function readMarkdownFile(path: string): Promise<OpenedMarkdownFile> {
  return invoke<OpenedMarkdownFile>("read_markdown_file", { path });
}

export function getMarkdownFileStatus(
  path: string,
): Promise<MarkdownFileStatus> {
  return invoke<MarkdownFileStatus>("get_markdown_file_status", { path });
}

export function confirmReloadDiscard(): Promise<boolean> {
  return confirm(
    "다시 불러오면 Aster에서 수정한 Markdown 내용이 사라집니다. 원본 파일을 다시 불러올까요?",
    {
      title: "Markdown 변경 내용 버리기",
      kind: "warning",
      okLabel: "다시 불러오기",
      cancelLabel: "취소",
    },
  );
}

export function confirmDocumentSwitchDiscard(): Promise<boolean> {
  return confirm(
    "다른 문서를 열면 Aster에서 수정한 Markdown 내용이 사라집니다. 문서를 전환할까요?",
    {
      title: "Markdown 변경 내용 버리기",
      kind: "warning",
      okLabel: "문서 전환",
      cancelLabel: "취소",
    },
  );
}

export async function showMarkdownMessage(
  content: string,
  options: { title: string; kind: "info" | "warning" | "error" },
): Promise<void> {
  await message(content, options);
}
