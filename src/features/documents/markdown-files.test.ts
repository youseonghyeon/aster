import { invoke, isTauri } from "@tauri-apps/api/core";
import { confirm, message, open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseMarkdownFilePath,
  confirmDocumentSwitchDiscard,
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
}));

describe("markdown file gateway", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(isTauri).mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(message).mockReset();
    vi.mocked(open).mockReset();
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

  it("keeps destructive confirmations behind named policies", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await confirmReloadDiscard();
    await confirmDocumentSwitchDiscard();

    expect(confirm).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("다시 불러오면"),
      expect.objectContaining({ okLabel: "다시 불러오기", kind: "warning" }),
    );
    expect(confirm).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("다른 문서를 열면"),
      expect.objectContaining({ okLabel: "문서 전환", kind: "warning" }),
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
