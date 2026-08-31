import { invoke } from "@tauri-apps/api/core";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseFolderPath,
  confirmFolderFileRemoval,
  removeFolderFile,
} from "./folder-gateway";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
  open: vi.fn(),
}));

describe("folder gateway", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(confirm).mockReset();
    vi.mocked(open).mockReset();
  });

  it("keeps permanent file removal behind a named warning policy", async () => {
    vi.mocked(confirm).mockResolvedValue(true);

    await expect(confirmFolderFileRemoval("guide.md")).resolves.toBe(true);

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("guide.md"),
      expect.objectContaining({
        title: "파일 제거",
        kind: "warning",
        okLabel: "파일 제거",
        cancelLabel: "취소",
      }),
    );
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("되돌릴 수 없습니다"),
      expect.anything(),
    );
  });

  it("sends only the root session and relative path to the delete command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await removeFolderFile(7, "guide/start.md");

    expect(invoke).toHaveBeenCalledWith("remove_folder_file", {
      rootToken: 7,
      relativePath: "guide/start.md",
    });
  });

  it("keeps folder selection behavior unchanged", async () => {
    vi.mocked(open).mockResolvedValue("/docs");

    await expect(chooseFolderPath()).resolves.toBe("/docs");
  });
});
