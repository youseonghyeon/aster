import { invoke, isTauri } from "@tauri-apps/api/core";
import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";

export type MarkdownTextFormat = {
  hasBom: boolean;
  lineEnding: "lf" | "crlf";
};

export type OpenedMarkdownFile = {
  path: string;
  name: string;
  content: string;
  revision: string;
  format: MarkdownTextFormat;
};

export type SaveMarkdownResult =
  | { kind: "saved"; document: OpenedMarkdownFile }
  | { kind: "conflict"; revision: string | null };

export type RecoveryDraft = {
  version: number;
  identity: string;
  path: string | null;
  content: string;
  baseRevision: string | null;
  updatedAt: number;
  sequence: number;
};

export type RecoveryDraftWrite = Omit<RecoveryDraft, "version" | "updatedAt">;

export type WatchRegistration = { token: number; path: string };
export type MarkdownFileChangedEvent = WatchRegistration;

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

export async function chooseMarkdownSavePath(
  defaultName: string,
): Promise<string | null> {
  const selectedPath = await save({
    title: "Markdown 파일 저장",
    defaultPath: defaultName,
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

export function saveMarkdownFile(request: {
  path: string;
  content: string;
  expectedRevision: string | null;
  format: MarkdownTextFormat;
}): Promise<SaveMarkdownResult> {
  return invoke<SaveMarkdownResult>("save_markdown_file", { request });
}

export function watchMarkdownFile(path: string): Promise<WatchRegistration> {
  return invoke<WatchRegistration>("watch_markdown_file", { path });
}

export function unwatchMarkdownFile(token?: number): Promise<void> {
  return invoke<void>("unwatch_markdown_file", { token });
}

export function saveRecoveryDraft(request: RecoveryDraftWrite): Promise<boolean> {
  return invoke<boolean>("save_recovery_draft", { request });
}

export function loadRecoveryDraft(identity: string): Promise<RecoveryDraft | null> {
  return invoke<RecoveryDraft | null>("load_recovery_draft", { identity });
}

export function deleteRecoveryDraft(
  identity: string,
  sequence: number,
): Promise<boolean> {
  return invoke<boolean>("delete_recovery_draft", {
    request: { identity, sequence },
  });
}

export function enableCloseGuard(): Promise<void> {
  return invoke<void>("enable_close_guard");
}

export function resolveCloseRequest(request: {
  requestId: number;
  allow: boolean;
  discardDraft?: { identity: string; sequence: number } | null;
}): Promise<void> {
  return invoke<void>("resolve_close_request", { request });
}

export function confirmReloadDiscard(): Promise<boolean> {
  return confirm(
    "Aster에서 저장하지 않은 편집 내용을 버리고, 파일에 저장된 내용을 불러옵니다.",
    {
      title: "파일 내용 다시 불러오기",
      kind: "warning",
      okLabel: "편집 내용 버리고 불러오기",
      cancelLabel: "취소",
    },
  );
}

export type LeaveDocumentDecision = "save" | "discard" | "cancel";

export async function chooseLeaveDocumentDecision(
  documentName: string,
  reason: "switch" | "quit",
): Promise<LeaveDocumentDecision> {
  const result = await message(
    reason === "quit"
      ? `“${documentName}”의 변경 내용을 저장하고 Aster를 종료할까요?`
      : `“${documentName}”의 변경 내용을 저장하고 다른 문서를 열까요?`,
    {
      title: "저장되지 않은 변경 내용",
      kind: "warning",
      buttons: { yes: "저장", no: "저장 안 함", cancel: "취소" },
    },
  );
  return result === "저장" ? "save" : result === "저장 안 함" ? "discard" : "cancel";
}

export type ExternalConflictDecision = "external" | "overwrite" | "cancel";

export async function chooseExternalConflictDecision(
  documentName: string,
): Promise<ExternalConflictDecision> {
  const result = await message(
    `다른 앱에서도 “${documentName}” 파일을 수정했습니다. 파일 내용을 불러오면 Aster의 미저장 편집 내용이 사라집니다. Aster 내용을 저장하면 파일의 내용을 덮어씁니다.`,
    {
      title: "어느 내용을 사용할까요?",
      kind: "warning",
      buttons: {
        yes: "파일 내용 불러오기",
        no: "Aster 내용으로 덮어쓰기",
        cancel: "취소",
      },
    },
  );
  return result === "파일 내용 불러오기"
    ? "external"
    : result === "Aster 내용으로 덮어쓰기"
      ? "overwrite"
      : "cancel";
}

export async function chooseRecoveryDecision(
  documentName: string,
  diskChanged: boolean,
): Promise<"restore" | "discard"> {
  const result = await message(
    `“${documentName}”에서 이전에 저장하지 않은 편집 내용이 남아 있습니다. 복구하면 이어서 편집할 수 있습니다. 복구본을 삭제해도 원본 파일은 삭제되지 않습니다.${diskChanged ? "\n\n파일 상태가 달라졌거나 확인되지 않아, 복구 후 저장 시 추가 확인이 필요할 수 있습니다." : ""}`,
    {
      title: "저장하지 않은 편집 내용 발견",
      kind: "warning",
      buttons: { ok: "편집 내용 복구", cancel: "복구본 삭제" },
    },
  );
  return result === "편집 내용 복구" ? "restore" : "discard";
}

export async function showMarkdownMessage(
  content: string,
  options: { title: string; kind: "info" | "warning" | "error" },
): Promise<void> {
  await message(content, options);
}
