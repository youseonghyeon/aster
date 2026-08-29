import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppEventChannel } from "../../shared/app-events";
import {
  chooseMarkdownFilePath,
  confirmDocumentSwitchDiscard,
  confirmReloadDiscard,
  readMarkdownFile,
  showMarkdownMessage,
} from "./markdown-files";
import { useDocumentSession } from "./useDocumentSession";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

vi.mock("./markdown-files", () => ({
  chooseMarkdownFilePath: vi.fn(),
  confirmDocumentSwitchDiscard: vi.fn(),
  confirmReloadDiscard: vi.fn(),
  getMarkdownFileStatus: vi.fn(),
  isDesktopRuntime: vi.fn(() => false),
  readMarkdownFile: vi.fn(),
  showMarkdownMessage: vi.fn(),
}));

vi.mock("./useExternalFileStatus", () => ({
  useExternalFileStatus: () => ({
    externalFileState: null,
    visibleExternalFileState: null,
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
    vi.mocked(confirmDocumentSwitchDiscard).mockReset();
    vi.mocked(confirmReloadDiscard).mockReset();
    vi.mocked(readMarkdownFile).mockReset();
    vi.mocked(showMarkdownMessage).mockReset();
    vi.mocked(showMarkdownMessage).mockResolvedValue(undefined);
    localStorage.clear();
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
      });
    vi.mocked(confirmDocumentSwitchDiscard).mockReturnValue(
      confirmation.promise,
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
});
