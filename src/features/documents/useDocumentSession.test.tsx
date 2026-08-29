import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import {
  chooseMarkdownFilePath,
  chooseMarkdownSavePath,
  chooseLeaveDocumentDecision,
  chooseExternalConflictDecision,
  chooseRecoveryDecision,
  confirmReloadDiscard,
  loadRecoveryDraft,
  readMarkdownFile,
  saveMarkdownFile,
  showMarkdownMessage,
} from "./markdown-files";
import { useDocumentSession } from "./useDocumentSession";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

const mockedExternalStatus = vi.hoisted(() => ({
  desktop: false,
  state: null as null | {
    kind: "modified";
    revision: string;
    observationKey: string;
  },
}));

vi.mock("./markdown-files", () => ({
  chooseMarkdownFilePath: vi.fn(),
  chooseMarkdownSavePath: vi.fn(),
  chooseLeaveDocumentDecision: vi.fn(),
  chooseExternalConflictDecision: vi.fn(),
  chooseRecoveryDecision: vi.fn(),
  deleteRecoveryDraft: vi.fn(async () => true),
  enableCloseGuard: vi.fn(async () => undefined),
  confirmReloadDiscard: vi.fn(),
  getMarkdownFileStatus: vi.fn(),
  isDesktopRuntime: vi.fn(() => mockedExternalStatus.desktop),
  loadRecoveryDraft: vi.fn(),
  readMarkdownFile: vi.fn(),
  resolveCloseRequest: vi.fn(async () => undefined),
  saveRecoveryDraft: vi.fn(async () => true),
  saveMarkdownFile: vi.fn(),
  showMarkdownMessage: vi.fn(),
}));

vi.mock("./useExternalFileStatus", () => ({
  useExternalFileStatus: () => ({
    externalFileState: mockedExternalStatus.state,
    visibleExternalFileState: mockedExternalStatus.state,
    setExternalFileState: vi.fn(),
    setDismissedExternalObservationKey: vi.fn(),
    resetExternalFileStatus: vi.fn(),
  }),
}));

const firstFile = {
  path: "/docs/first.md",
  name: "first.md",
  content: "# 첫 문서",
  revision: "first-revision",
  format: { hasBom: false, lineEnding: "lf" as const },
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("document session controller", () => {
  beforeEach(() => {
    vi.mocked(chooseMarkdownFilePath).mockReset();
    vi.mocked(chooseMarkdownSavePath).mockReset();
    vi.mocked(chooseLeaveDocumentDecision).mockReset();
    vi.mocked(chooseExternalConflictDecision).mockReset();
    vi.mocked(chooseRecoveryDecision).mockReset();
    vi.mocked(confirmReloadDiscard).mockReset();
    vi.mocked(saveMarkdownFile).mockReset();
    vi.mocked(readMarkdownFile).mockReset();
    vi.mocked(loadRecoveryDraft).mockReset();
    vi.mocked(showMarkdownMessage).mockReset();
    vi.mocked(showMarkdownMessage).mockResolvedValue(undefined);
    localStorage.clear();
    mockedExternalStatus.desktop = false;
    mockedExternalStatus.state = null;
  });

  it("emits exactly one settled event for cancelled and busy picker outcomes", async () => {
    const events = createAppEventChannel();
    const settled: unknown[] = [];
    events.subscribe("document-open-settled", (payload) => settled.push(payload));
    const picker = deferred<string | null>();
    vi.mocked(chooseMarkdownFilePath).mockReturnValue(picker.promise);
    const { result } = renderHook(() => useDocumentSession({ events }));

    let firstOpen: Promise<string> | undefined;
    act(() => {
      firstOpen = result.current.openFromPicker("picker");
    });
    await act(async () => {
      expect(await result.current.openFromPicker("native")).toBe("busy");
    });
    picker.resolve(null);
    await act(async () => {
      expect(await firstOpen).toBe("cancelled");
    });

    expect(settled).toEqual([
      { source: "native", outcome: "busy" },
      { source: "picker", outcome: "cancelled" },
    ]);
  });

  it("emits one opened, current, and failed outcome for direct commands", async () => {
    const events = createAppEventChannel();
    const settled: unknown[] = [];
    events.subscribe("document-open-settled", (payload) => settled.push(payload));
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockRejectedValueOnce(new Error("읽기 실패"));
    const { result } = renderHook(() => useDocumentSession({ events }));

    await act(async () => {
      expect(await result.current.openDocument(firstFile.path)).toBe("opened");
    });
    await act(async () => {
      expect(await result.current.openDocument(firstFile.path)).toBe("current");
    });
    await act(async () => {
      expect(await result.current.openDocument("/docs/broken.md")).toBe("failed");
    });

    expect(settled).toEqual([
      { source: "recent", outcome: "opened" },
      { source: "recent", outcome: "current" },
      { source: "recent", outcome: "failed" },
    ]);
  });

  it("accepts an edit made during reload confirmation into the approved version", async () => {
    const events = createAppEventChannel();
    const confirmation = deferred<boolean>();
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce({
        ...firstFile,
        content: "# 다시 불러온 문서",
        revision: "second-revision",
      });
    vi.mocked(confirmReloadDiscard).mockReturnValue(confirmation.promise);
    const { result } = renderHook(() => useDocumentSession({ events }));
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 확인 전 수정"));

    let reload: Promise<string> | undefined;
    act(() => {
      reload = result.current.reloadDocument();
    });
    act(() => result.current.editMarkdown("# 확인 중 수정"));
    confirmation.resolve(true);
    await act(async () => {
      expect(await reload).toBe("opened");
    });

    expect(result.current.document.markdown).toBe("# 다시 불러온 문서");
  });

  it("preserves an edit made while reload is reading", async () => {
    const events = createAppEventChannel();
    const reloadRead = deferred<typeof firstFile>();
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockReturnValueOnce(reloadRead.promise);
    vi.mocked(confirmReloadDiscard).mockResolvedValue(true);
    const { result } = renderHook(() => useDocumentSession({ events }));
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# reload 전 수정"));

    let reload: Promise<string> | undefined;
    act(() => {
      reload = result.current.reloadDocument();
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editMarkdown("# 읽는 중 수정"));
    reloadRead.resolve({
      ...firstFile,
      content: "# 적용하면 안 되는 원본",
      revision: "second-revision",
    });
    await act(async () => {
      expect(await reload).toBe("cancelled");
    });

    expect(result.current.document.markdown).toBe("# 읽는 중 수정");
    expect(showMarkdownMessage).toHaveBeenCalledWith(
      expect.stringContaining("현재 내용을 유지했습니다"),
      { title: "현재 변경 내용 유지", kind: "info" },
    );
  });

  it("does not read or emit after unmount while the picker is pending", async () => {
    const events = createAppEventChannel();
    const settled = vi.fn();
    events.subscribe("document-open-settled", settled);
    const picker = deferred<string | null>();
    vi.mocked(chooseMarkdownFilePath).mockReturnValue(picker.promise);
    const { result, unmount } = renderHook(() => useDocumentSession({ events }));
    let opening: Promise<string> | undefined;
    act(() => {
      opening = result.current.openFromPicker("picker");
    });

    unmount();
    picker.resolve("/docs/after-unmount.md");
    await expect(opening).resolves.toBe("cancelled");

    expect(readMarkdownFile).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it("does not flush notes or show a dialog after confirm resolves post-unmount", async () => {
    const events = createAppEventChannel();
    const confirmation = deferred<boolean>();
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce({
        path: "/docs/second.md",
        name: "second.md",
        content: "# 둘째 문서",
        revision: "second-revision",
        format: { hasBom: false, lineEnding: "lf" },
      });
    vi.mocked(chooseLeaveDocumentDecision).mockImplementation(async () =>
      (await confirmation.promise) ? "discard" : "cancel",
    );
    const { result, unmount } = renderHook(() => useDocumentSession({ events }));
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 저장되지 않은 변경"));
    let switching: Promise<string> | undefined;
    act(() => {
      switching = result.current.openDocument("/docs/second.md");
    });
    await act(async () => {
      await Promise.resolve();
    });
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");

    unmount();
    confirmation.resolve(true);
    await expect(switching).resolves.toBe("cancelled");

    expect(storageWrite).not.toHaveBeenCalled();
    expect(showMarkdownMessage).not.toHaveBeenCalled();
    storageWrite.mockRestore();
  });

  it("does not start reload I/O after confirm resolves post-unmount", async () => {
    const events = createAppEventChannel();
    const confirmation = deferred<boolean>();
    vi.mocked(readMarkdownFile).mockResolvedValueOnce(firstFile);
    vi.mocked(confirmReloadDiscard).mockReturnValue(confirmation.promise);
    const { result, unmount } = renderHook(() => useDocumentSession({ events }));
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# reload 대기 변경"));
    let reloading: Promise<string> | undefined;
    act(() => {
      reloading = result.current.reloadDocument();
    });

    unmount();
    confirmation.resolve(true);
    await expect(reloading).resolves.toBe("cancelled");

    expect(readMarkdownFile).toHaveBeenCalledOnce();
  });

  it("does not replace a new edit when initial recovery approval resolves late", async () => {
    mockedExternalStatus.desktop = true;
    const recoveryDecision = deferred<"restore" | "discard">();
    vi.mocked(loadRecoveryDraft).mockResolvedValue({
      version: 1,
      identity: "untitled:test",
      path: null,
      content: "# 복구 초안",
      baseRevision: null,
      updatedAt: 1,
      sequence: 1,
    });
    vi.mocked(chooseRecoveryDecision).mockReturnValue(recoveryDecision.promise);
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(chooseRecoveryDecision).toHaveBeenCalledOnce();

    act(() => result.current.editMarkdown("# 대화상자 중 새 편집"));
    recoveryDecision.resolve("restore");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.document.markdown).toBe("# 대화상자 중 새 편집");
    expect(result.current.document.recovered).toBe(false);
  });

  it("saves an edited document against the revision it opened", async () => {
    vi.mocked(readMarkdownFile).mockResolvedValue(firstFile);
    vi.mocked(saveMarkdownFile).mockResolvedValue({
      kind: "saved",
      document: { ...firstFile, content: "# 저장할 내용", revision: "saved-revision" },
    });
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 저장할 내용"));

    await act(async () => {
      expect(await result.current.saveDocument()).toBe(true);
    });

    expect(saveMarkdownFile).toHaveBeenCalledWith({
      path: firstFile.path,
      content: "# 저장할 내용",
      expectedRevision: "first-revision",
      format: firstFile.format,
    });
    expect(result.current.document.saveStatus).toBe("saved");
  });

  it("keeps edits made while a save is in flight unsaved", async () => {
    const saving = deferred<{
      kind: "saved";
      document: typeof firstFile;
    }>();
    vi.mocked(readMarkdownFile).mockResolvedValue(firstFile);
    vi.mocked(saveMarkdownFile).mockReturnValue(saving.promise);
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 저장 snapshot"));
    let saveResult: Promise<boolean> | undefined;
    act(() => {
      saveResult = result.current.saveDocument();
    });
    act(() => result.current.editMarkdown("# 저장 중 새 편집"));
    saving.resolve({
      kind: "saved",
      document: {
        ...firstFile,
        content: "# 저장 snapshot",
        revision: "saved-revision",
      },
    });

    await act(async () => {
      expect(await saveResult).toBe(false);
    });
    expect(result.current.document.markdown).toBe("# 저장 중 새 편집");
    expect(result.current.document.saveStatus).toBe("modified");
  });

  it("does not leave when a new edit arrives during the save chosen for switching", async () => {
    const secondFile = {
      ...firstFile,
      path: "/docs/second.md",
      name: "second.md",
      content: "# 둘째 문서",
      revision: "second-revision",
    };
    const saving = deferred<{
      kind: "saved";
      document: typeof firstFile;
    }>();
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce(secondFile);
    vi.mocked(chooseLeaveDocumentDecision).mockResolvedValue("save");
    vi.mocked(saveMarkdownFile).mockReturnValue(saving.promise);
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 전환 전 저장 내용"));
    let switching: Promise<string> | undefined;
    act(() => {
      switching = result.current.openDocument(secondFile.path);
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.editMarkdown("# 저장 중 최신 변경"));
    saving.resolve({
      kind: "saved",
      document: {
        ...firstFile,
        content: "# 전환 전 저장 내용",
        revision: "saved-revision",
      },
    });

    await act(async () => {
      expect(await switching).toBe("cancelled");
    });
    expect(result.current.document.path).toBe(firstFile.path);
    expect(result.current.document.markdown).toBe("# 저장 중 최신 변경");
    expect(result.current.document.saveStatus).toBe("modified");
  });

  it("does not commit a target when Markdown changes after leave approval", async () => {
    const secondFile = {
      ...firstFile,
      path: "/docs/second.md",
      name: "second.md",
      content: "# 둘째 문서",
      revision: "second-revision",
    };
    const refreshedTarget = deferred<typeof secondFile>();
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce(secondFile)
      .mockReturnValueOnce(refreshedTarget.promise);
    vi.mocked(chooseLeaveDocumentDecision).mockResolvedValue("discard");
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 승인 전 변경"));
    let switching: Promise<string> | undefined;
    act(() => {
      switching = result.current.openDocument(secondFile.path);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.editMarkdown("# 승인 뒤 새 변경"));
    refreshedTarget.resolve(secondFile);

    await act(async () => {
      expect(await switching).toBe("cancelled");
    });
    expect(result.current.document.path).toBe(firstFile.path);
    expect(result.current.document.markdown).toBe("# 승인 뒤 새 변경");
  });

  it("stops after a confirmed overwrite conflicts a second time", async () => {
    vi.mocked(readMarkdownFile).mockResolvedValue(firstFile);
    vi.mocked(chooseExternalConflictDecision).mockResolvedValue("overwrite");
    vi.mocked(saveMarkdownFile)
      .mockResolvedValueOnce({ kind: "conflict", revision: "second-revision" })
      .mockResolvedValueOnce({ kind: "conflict", revision: "third-revision" });
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 내부 변경"));

    await act(async () => {
      expect(await result.current.saveDocument()).toBe(false);
    });

    expect(saveMarkdownFile).toHaveBeenNthCalledWith(1, {
      path: firstFile.path,
      content: "# 내부 변경",
      expectedRevision: "first-revision",
      format: firstFile.format,
    });
    expect(saveMarkdownFile).toHaveBeenNthCalledWith(2, {
      path: firstFile.path,
      content: "# 내부 변경",
      expectedRevision: "second-revision",
      format: firstFile.format,
    });
    expect(showMarkdownMessage).toHaveBeenCalledWith(
      expect.stringContaining("다시 변경되었습니다"),
      { title: "저장 충돌", kind: "error" },
    );
    expect(result.current.document.saveStatus).toBe("conflict");
  });

  it("opens the existing target when a new document save conflict chooses external", async () => {
    const target = {
      ...firstFile,
      path: "/docs/existing.md",
      name: "existing.md",
      content: "# 기존 파일",
      revision: "existing-revision",
    };
    vi.mocked(chooseMarkdownSavePath).mockResolvedValue(target.path);
    vi.mocked(chooseExternalConflictDecision).mockResolvedValue("external");
    vi.mocked(saveMarkdownFile).mockResolvedValue({
      kind: "conflict",
      revision: target.revision,
    });
    vi.mocked(readMarkdownFile).mockResolvedValue(target);
    const { result } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    act(() => result.current.editMarkdown("# 저장하려던 새 문서"));

    await act(async () => {
      expect(await result.current.saveDocument()).toBe(true);
    });

    expect(result.current.document).toMatchObject({
      path: target.path,
      name: target.name,
      markdown: target.content,
      saveStatus: "saved",
    });
  });

  it("applies a clean external change without emitting a document reset", async () => {
    const events = createAppEventChannel();
    const committed = vi.fn();
    const willApply = vi.fn();
    const applied = vi.fn();
    events.subscribe("document-committed", committed);
    events.subscribe("external-content-will-apply", willApply);
    events.subscribe("external-content-applied", applied);
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce({
        ...firstFile,
        content: "# 외부 변경",
        revision: "external-revision",
      });
    const { result, rerender } = renderHook(() => useDocumentSession({ events }));
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    committed.mockClear();
    mockedExternalStatus.state = {
      kind: "modified",
      revision: "external-revision",
      observationKey: "modified:external-revision",
    };

    rerender();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.document.markdown).toBe("# 외부 변경");
    expect(committed).not.toHaveBeenCalled();
    expect(willApply).toHaveBeenCalledOnce();
    expect(applied).toHaveBeenCalledOnce();
  });

  it("asks before replacing dirty Markdown with an external change", async () => {
    vi.mocked(readMarkdownFile)
      .mockResolvedValueOnce(firstFile)
      .mockResolvedValueOnce({
        ...firstFile,
        content: "# 외부 변경",
        revision: "external-revision",
      });
    vi.mocked(chooseExternalConflictDecision).mockResolvedValue("external");
    const { result, rerender } = renderHook(() =>
      useDocumentSession({ events: createAppEventChannel() }),
    );
    await act(async () => {
      await result.current.openDocument(firstFile.path);
    });
    act(() => result.current.editMarkdown("# 내부 변경"));
    mockedExternalStatus.state = {
      kind: "modified",
      revision: "external-revision",
      observationKey: "modified:external-revision",
    };

    rerender();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(chooseExternalConflictDecision).toHaveBeenCalledWith("first.md");
    expect(result.current.document.markdown).toBe("# 외부 변경");
  });
});
