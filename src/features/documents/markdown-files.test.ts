import { invoke, isTauri } from "@tauri-apps/api/core";
import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseExternalConflictDecision,
  chooseLeaveDocumentDecision,
  chooseMarkdownFilePath,
  chooseMarkdownSavePath,
  chooseRecoveryDecision,
  confirmReloadDiscard,
  getMarkdownFileStatus,
  isDesktopRuntime,
  readMarkdownFile,
  showMarkdownMessage,
} from "./markdown-files";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
  save: vi.fn(),
}));

describe("markdown file gateway", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(isTauri).mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(message).mockReset();
    vi.mocked(open).mockReset();
    vi.mocked(save).mockReset();
  });

  it("opens only supported Markdown extensions", async () => {
    vi.mocked(open).mockResolvedValue("/docs/readme.md");

    await expect(chooseMarkdownFilePath()).resolves.toBe("/docs/readme.md");
    expect(open).toHaveBeenCalledWith({
      title: "Markdown 파일 열기",
      multiple: false,
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
  });

  it("normalizes a cancelled file dialog", async () => {
    vi.mocked(open).mockResolvedValue(null);

    await expect(chooseMarkdownFilePath()).resolves.toBeNull();
  });

  it("opens a Markdown-only Save As dialog", async () => {
    vi.mocked(save).mockResolvedValue("/docs/new.md");

    await expect(chooseMarkdownSavePath("new.md")).resolves.toBe(
      "/docs/new.md",
    );
    expect(save).toHaveBeenCalledWith({
      title: "Markdown 파일 저장",
      defaultPath: "new.md",
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
  });

  it("uses the backend commands with the selected path", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await readMarkdownFile("/docs/readme.md");
    await getMarkdownFileStatus("/docs/readme.md");

    expect(invoke).toHaveBeenNthCalledWith(1, "read_markdown_file", {
      path: "/docs/readme.md",
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "get_markdown_file_status", {
      path: "/docs/readme.md",
    });
  });

  it("keeps reload confirmation behind a named policy", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await confirmReloadDiscard();

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("다시 불러오면"),
      expect.objectContaining({ okLabel: "다시 불러오기", kind: "warning" }),
    );
  });

  it("maps native decision labels to explicit document actions", async () => {
    vi.mocked(message)
      .mockResolvedValueOnce("저장")
      .mockResolvedValueOnce("저장 안 함")
      .mockResolvedValueOnce("취소")
      .mockResolvedValueOnce("외부 변경 적용")
      .mockResolvedValueOnce("현재 내용으로 덮어쓰기")
      .mockResolvedValueOnce("취소")
      .mockResolvedValueOnce("복구")
      .mockResolvedValueOnce("폐기");

    await expect(chooseLeaveDocumentDecision("one.md", "switch")).resolves.toBe(
      "save",
    );
    await expect(chooseLeaveDocumentDecision("one.md", "quit")).resolves.toBe(
      "discard",
    );
    await expect(chooseLeaveDocumentDecision("one.md", "switch")).resolves.toBe(
      "cancel",
    );
    await expect(chooseExternalConflictDecision("one.md")).resolves.toBe(
      "external",
    );
    await expect(chooseExternalConflictDecision("one.md")).resolves.toBe(
      "overwrite",
    );
    await expect(chooseExternalConflictDecision("one.md")).resolves.toBe(
      "cancel",
    );
    await expect(chooseRecoveryDecision("one.md", false)).resolves.toBe(
      "restore",
    );
    await expect(chooseRecoveryDecision("one.md", true)).resolves.toBe(
      "discard",
    );
  });

  it("delegates runtime checks and messages", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(message).mockResolvedValue("Ok");

    expect(isDesktopRuntime()).toBe(true);
    await showMarkdownMessage("실패", { title: "오류", kind: "error" });

    expect(message).toHaveBeenCalledWith("실패", {
      title: "오류",
      kind: "error",
    });
  });
});
