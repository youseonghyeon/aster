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
    "다시 불러오면 Aster에서 수정한 Markdown 내용이 사라집니다. 원본 파일을 다시 불러올까요?",
    {
      title: "Markdown 변경 내용 버리기",
      kind: "warning",
      okLabel: "다시 불러오기",
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
    `“${documentName}”이 다른 앱에서도 변경되었습니다. 사용할 내용을 선택해 주세요.`,
    {
      title: "Markdown 변경 충돌",
      kind: "warning",
      buttons: {
        yes: "외부 변경 적용",
        no: "현재 내용으로 덮어쓰기",
        cancel: "취소",
      },
    },
  );
  return result === "외부 변경 적용"
    ? "external"
    : result === "현재 내용으로 덮어쓰기"
      ? "overwrite"
      : "cancel";
}

export async function chooseRecoveryDecision(
  documentName: string,
  diskChanged: boolean,
): Promise<"restore" | "discard"> {
  const result = await message(
    diskChanged
      ? `“${documentName}”의 복구 초안이 있지만 원본도 변경되었습니다. 초안을 복구하면 저장 전 충돌 확인이 필요합니다.`
      : `“${documentName}”에서 저장하지 못한 변경 내용을 발견했습니다. 복구할까요?`,
    {
      title: "변경 내용 복구",
      kind: "warning",
      buttons: { ok: "복구", cancel: "폐기" },
    },
  );
  return result === "복구" ? "restore" : "discard";
}

export async function showMarkdownMessage(
  content: string,
  options: { title: string; kind: "info" | "warning" | "error" },
): Promise<void> {
  await message(content, options);
}
