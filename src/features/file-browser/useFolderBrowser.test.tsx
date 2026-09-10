import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseFolderPath,
  closeFolderRoot,
  confirmFolderFileRemoval,
  listFolderChildren,
  openFolderRoot,
  removeFolderFile,
  type FolderListing,
} from "./folder-gateway";
import { folderBrowserStorageKey } from "./folder-preferences";
import { useFolderBrowser } from "./useFolderBrowser";

vi.mock("./folder-gateway", () => ({
  chooseFolderPath: vi.fn(),
  closeFolderRoot: vi.fn(() => Promise.resolve()),
  confirmFolderFileRemoval: vi.fn(),
  listFolderChildren: vi.fn(),
  openFolderImage: vi.fn(() => Promise.resolve()),
  openFolderRoot: vi.fn(),
  removeFolderFile: vi.fn(() => Promise.resolve()),
}));

const root = { token: 7, path: "/docs", name: "docs" };

function listing(directory: string): FolderListing {
  return { rootToken: root.token, directory, entries: [], truncated: false };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function saveTestRoot() {
  localStorage.setItem(
    folderBrowserStorageKey,
    JSON.stringify({
      rootPath: "/docs",
      expandedPaths: [],
      view: "files",
      sidebarWidth: 280,
    }),
  );
}

describe("useFolderBrowser", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(openFolderRoot).mockReset();
    vi.mocked(chooseFolderPath).mockReset();
    vi.mocked(closeFolderRoot).mockClear();
    vi.mocked(confirmFolderFileRemoval).mockReset();
    vi.mocked(listFolderChildren).mockReset();
    vi.mocked(removeFolderFile).mockClear();
    vi.mocked(openFolderRoot).mockResolvedValue(root);
    vi.mocked(listFolderChildren).mockImplementation((_, directory) =>
      Promise.resolve(listing(directory)),
    );
    vi.mocked(confirmFolderFileRemoval).mockResolvedValue(false);
  });

  it.each(["document", "sidebar", "focus", "document-return"])("discards a delayed reveal after %s changes and ignores duplicate clicks", async (change) => {
    saveTestRoot();
    const { result, rerender } = renderHook(
      (props) => useFolderBrowser(props),
      { initialProps: { isActive: true, currentDocumentPath: "/docs/a.md" } },
    );
    await waitFor(() => expect(result.current.state.directories[""]?.status).toBe("loaded"));
    const pending = deferred<FolderListing>();
    vi.mocked(listFolderChildren).mockReturnValue(pending.promise);
    let request!: Promise<void>;
    act(() => {
      request = result.current.actions.revealCurrentFile("/docs/a.md");
      void result.current.actions.revealCurrentFile("/docs/a.md");
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
    const button = document.createElement("button");
    if (change === "document-return") {
      rerender({ isActive: true, currentDocumentPath: "/docs/b.md" });
      rerender({ isActive: true, currentDocumentPath: "/docs/a.md" });
    }
    if (change === "document") rerender({ isActive: true, currentDocumentPath: "/docs/b.md" });
    if (change === "sidebar") rerender({ isActive: false, currentDocumentPath: "/docs/a.md" });
    if (change === "focus") { document.body.append(button); button.focus(); }
    pending.resolve({ ...listing(""), entries: [{ kind: "markdown", name: "a.md", path: "/docs/a.md", relativePath: "a.md" }] });
    await act(async () => request);
    expect(result.current.revealRequest).toBeNull();
    expect(result.current.isRevealing).toBe(false);
    button.remove();
  });

  it("reveals a nested current document without changing the root or opening a file", async () => {
    saveTestRoot();
    const folder = { name: "nested", relativePath: "nested", path: "/docs/nested", kind: "directory" as const };
    const file = { name: "문서.md", relativePath: "nested/문서.md", path: "/docs/nested/문서.md", kind: "markdown" as const };
    vi.mocked(listFolderChildren).mockImplementation(async (_, directory) => ({ ...listing(directory), entries: directory === "" ? [folder] : [file] }));
    const { result } = renderHook(() => useFolderBrowser({ isActive: true, currentDocumentPath: file.path }));
    await waitFor(() => expect(result.current.state.directories[""]?.status).toBe("loaded"));
    await act(async () => result.current.actions.revealCurrentFile(file.path));
    expect(result.current.state.expandedPaths.has("nested")).toBe(true);
    expect(result.current.state.selectedPath).toBe(file.relativePath);
    expect(result.current.revealRequest?.path).toBe(file.relativePath);
    expect(result.current.state.root).toEqual(root);
    expect(openFolderRoot).toHaveBeenCalledTimes(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a stale root that completes after a newer selection", async () => {
    const first = deferred<typeof root>();
    const second = deferred<typeof root>();
    vi.mocked(chooseFolderPath)
      .mockResolvedValueOnce("/first")
      .mockResolvedValueOnce("/second");
    vi.mocked(openFolderRoot)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));

    let firstSelection!: Promise<void>;
    let secondSelection!: Promise<void>;
    act(() => {
      firstSelection = result.current.actions.chooseRoot();
      secondSelection = result.current.actions.chooseRoot();
    });
    second.resolve({ token: 2, path: "/second", name: "second" });
    await act(async () => secondSelection);
    first.resolve({ token: 1, path: "/first", name: "first" });
    await act(async () => firstSelection);

    expect(result.current.state.root?.path).toBe("/second");
    expect(closeFolderRoot).toHaveBeenCalledWith(1);
  });

  it("restores the saved root and only its expanded directories on activation", async () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: ["guide", "notes/2026"],
        view: "files",
        sidebarWidth: 312,
      }),
    );

    const { result, rerender } = renderHook(
      ({ isActive }) => useFolderBrowser({ isActive }),
      { initialProps: { isActive: false } },
    );

    expect(openFolderRoot).not.toHaveBeenCalled();
    rerender({ isActive: true });

    await waitFor(() => expect(result.current.state.root).toEqual(root));
    await waitFor(() =>
      expect(listFolderChildren).toHaveBeenCalledTimes(3),
    );
    expect(listFolderChildren).toHaveBeenCalledWith(7, "");
    expect(listFolderChildren).toHaveBeenCalledWith(7, "guide");
    expect(listFolderChildren).toHaveBeenCalledWith(7, "notes/2026");
    expect(result.current.sidebarWidth).toBe(312);
  });

  it("clamps and persists a changed sidebar width", () => {
    const { result } = renderHook(() =>
      useFolderBrowser({ isActive: false }),
    );

    act(() => result.current.actions.setSidebarWidth(900));

    expect(result.current.sidebarWidth).toBe(420);
    expect(JSON.parse(localStorage.getItem(folderBrowserStorageKey) ?? "{}"))
      .toMatchObject({ sidebarWidth: 420 });
  });

  it("does not remove or refresh a file when the warning is cancelled", async () => {
    saveTestRoot();
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(result.current.state.root).toEqual(root));
    vi.mocked(listFolderChildren).mockClear();

    await act(async () => {
      await result.current.actions.removeFile({
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      });
    });

    expect(confirmFolderFileRemoval).toHaveBeenCalledWith("guide.md");
    expect(removeFolderFile).not.toHaveBeenCalled();
    expect(listFolderChildren).not.toHaveBeenCalled();
  });

  it("removes an approved file and refreshes only its parent directory first", async () => {
    saveTestRoot();
    vi.mocked(confirmFolderFileRemoval).mockResolvedValue(true);
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(result.current.state.root).toEqual(root));
    vi.mocked(listFolderChildren).mockClear();

    await act(async () => {
      await result.current.actions.removeFile({
        name: "start.md",
        relativePath: "guide/start.md",
        path: "/docs/guide/start.md",
        kind: "markdown",
      });
    });

    expect(removeFolderFile).toHaveBeenCalledWith(7, "guide/start.md");
    expect(listFolderChildren).toHaveBeenCalledWith(7, "guide");
    expect(result.current.removingFilePath).toBeNull();
    expect(result.current.operationError).toBeNull();
  });

  it("drops a removal approved after the folder root changes", async () => {
    saveTestRoot();
    const confirmation = deferred<boolean>();
    vi.mocked(confirmFolderFileRemoval).mockReturnValue(confirmation.promise);
    vi.mocked(chooseFolderPath).mockResolvedValue("/next");
    vi.mocked(openFolderRoot)
      .mockResolvedValueOnce(root)
      .mockResolvedValueOnce({ token: 8, path: "/next", name: "next" });
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(result.current.state.root).toEqual(root));

    let removal!: Promise<void>;
    act(() => {
      removal = result.current.actions.removeFile({
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      });
    });
    await act(async () => result.current.actions.chooseRoot());
    confirmation.resolve(true);
    await act(async () => removal);

    expect(result.current.state.root?.token).toBe(8);
    expect(removeFolderFile).not.toHaveBeenCalled();
  });

  it("blocks duplicate removal and drops approval after unmount", async () => {
    saveTestRoot();
    const confirmation = deferred<boolean>();
    vi.mocked(confirmFolderFileRemoval).mockReturnValue(confirmation.promise);
    const { result, unmount } = renderHook(() =>
      useFolderBrowser({ isActive: true }),
    );
    await waitFor(() => expect(result.current.state.root).toEqual(root));

    let first!: Promise<void>;
    let duplicate!: Promise<void>;
    act(() => {
      first = result.current.actions.removeFile({
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      });
      duplicate = result.current.actions.removeFile({
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      });
    });
    expect(confirmFolderFileRemoval).toHaveBeenCalledOnce();

    unmount();
    confirmation.resolve(true);
    await Promise.all([first, duplicate]);

    expect(removeFolderFile).not.toHaveBeenCalled();
  });

  it("keeps the cached tree and exposes an inline error when removal fails", async () => {
    saveTestRoot();
    vi.mocked(confirmFolderFileRemoval).mockResolvedValue(true);
    vi.mocked(removeFolderFile).mockRejectedValue(new Error("권한이 없습니다"));
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(result.current.state.root).toEqual(root));

    await act(async () => {
      await result.current.actions.removeFile({
        name: "guide.md",
        relativePath: "guide.md",
        path: "/docs/guide.md",
        kind: "markdown",
      });
    });

    expect(result.current.operationError).toBe("권한이 없습니다");
    expect(result.current.state.root).toEqual(root);
  });

  it("schedules one refresh after the adaptive delay and pauses when inactive", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const { rerender } = renderHook(
      ({ isActive }) => useFolderBrowser({ isActive }),
      { initialProps: { isActive: true } },
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(listFolderChildren).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(listFolderChildren).toHaveBeenCalledTimes(2);

    rerender({ isActive: false });
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
  });

  it("retries a cached refresh error on the next error-paced schedule", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const cachedListing: FolderListing = {
      ...listing(""),
      entries: [
        {
          name: "cached.md",
          relativePath: "cached.md",
          path: "/docs/cached.md",
          kind: "markdown",
        },
      ],
    };
    const refreshedListing: FolderListing = {
      ...listing(""),
      entries: [
        {
          name: "refreshed.md",
          relativePath: "refreshed.md",
          path: "/docs/refreshed.md",
          kind: "markdown",
        },
      ],
    };
    vi.mocked(listFolderChildren)
      .mockResolvedValueOnce(cachedListing)
      .mockRejectedValueOnce(new Error("일시적인 오류"))
      .mockResolvedValueOnce(refreshedListing);
    const { result } = renderHook(() =>
      useFolderBrowser({ isActive: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
    expect(result.current.state.directories[""]).toMatchObject({
      status: "error",
      error: "일시적인 오류",
      entries: cachedListing.entries,
    });

    await act(async () => vi.advanceTimersByTimeAsync(59_999));
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(listFolderChildren).toHaveBeenCalledTimes(3);
    expect(result.current.state.directories[""]).toMatchObject({
      status: "loaded",
      error: null,
      entries: refreshedListing.entries,
    });
  });

  it("pauses while hidden, refreshes on return, and clears the unmounted timer", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const originalVisibility = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    const setVisibility = (visibilityState: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: visibilityState,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const { unmount } = renderHook(() =>
      useFolderBrowser({ isActive: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(1);

    act(() => setVisibility("hidden"));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(listFolderChildren).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
    if (originalVisibility) {
      Object.defineProperty(document, "visibilityState", originalVisibility);
    }
  });

  it("refreshes the requested directory first without resetting tree preferences", async () => {
    saveTestRoot();
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));
    act(() => result.current.actions.selectEntry("guide"));
    const before = result.current.state;
    vi.mocked(listFolderChildren).mockClear();

    await act(async () => result.current.actions.refresh("guide"));

    expect(vi.mocked(listFolderChildren).mock.calls).toEqual([[7, "guide"], [7, ""]]);
    expect(result.current.state.root).toBe(before.root);
    expect(result.current.state.expandedPaths).toEqual(before.expandedPaths);
    expect(result.current.state.selectedPath).toBe(before.selectedPath);
  });

  it("retains all distinct directory requests while coalescing a pending refresh", async () => {
    saveTestRoot();
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));
    const pending = deferred<FolderListing>();
    vi.mocked(listFolderChildren).mockClear().mockReturnValueOnce(pending.promise);
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.actions.refresh();
      void result.current.actions.refresh("guide");
      void result.current.actions.refresh("notes");
      void result.current.actions.refresh("guide");
    });
    pending.resolve(listing(""));
    await act(async () => refresh);
    expect(vi.mocked(listFolderChildren).mock.calls).toEqual([
      [7, ""], [7, "guide"], [7, "notes"], [7, ""],
    ]);
  });

  it("ignores a menu refresh captured before the root changed", async () => {
    saveTestRoot();
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));
    const oldMenuRefresh = result.current.actions.refresh;
    vi.mocked(chooseFolderPath).mockResolvedValue("/next");
    vi.mocked(openFolderRoot).mockResolvedValue({ token: 8, path: "/next", name: "next" });
    vi.mocked(listFolderChildren).mockImplementation((rootToken, directory) =>
      Promise.resolve({ ...listing(directory), rootToken }),
    );
    await act(async () => result.current.actions.chooseRoot());
    vi.mocked(listFolderChildren).mockClear();
    await act(async () => oldMenuRefresh("guide"));
    expect(listFolderChildren).not.toHaveBeenCalled();
    await act(async () => result.current.actions.refresh("guide"));
    expect(listFolderChildren).toHaveBeenCalledWith(8, "guide");
  });

  it("coalesces repeated refresh requests into one trailing pass", async () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));
    const pending = deferred<FolderListing>();
    vi.mocked(listFolderChildren)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(listing(""));

    let firstRefresh!: Promise<void>;
    act(() => {
      firstRefresh = result.current.actions.refresh();
      void result.current.actions.refresh();
      void result.current.actions.refresh();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
    pending.resolve(listing(""));
    await act(async () => firstRefresh);

    expect(listFolderChildren).toHaveBeenCalledTimes(3);
  });

  it("restarts the scheduler after visibility changes during a refresh", async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const originalVisibility = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    const setVisibility = (visibilityState: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: visibilityState,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const { result } = renderHook(() =>
      useFolderBrowser({ isActive: true }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    const staleRefresh = deferred<FolderListing>();
    vi.mocked(listFolderChildren)
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValue(listing(""));

    let stalePromise!: Promise<void>;
    act(() => {
      stalePromise = result.current.actions.refresh();
      setVisibility("hidden");
      setVisibility("visible");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(listFolderChildren).toHaveBeenCalledTimes(3);

    staleRefresh.resolve(listing(""));
    await act(async () => stalePromise);
    await act(async () => vi.advanceTimersByTimeAsync(9_999));
    expect(listFolderChildren).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(listFolderChildren).toHaveBeenCalledTimes(4);
    if (originalVisibility) {
      Object.defineProperty(document, "visibilityState", originalVisibility);
    }
  });

  it("keeps detached old-root trailing requests out of the new flight", async () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));
    const oldRefresh = deferred<FolderListing>();
    const newRefresh = deferred<FolderListing>();
    vi.mocked(listFolderChildren).mockImplementation((token, directory) => {
      if (token === 7) return oldRefresh.promise;
      if (token === 8) return newRefresh.promise;
      return Promise.resolve({
        rootToken: token,
        directory,
        entries: [],
        truncated: false,
      });
    });
    vi.mocked(chooseFolderPath).mockResolvedValue("/next");
    vi.mocked(openFolderRoot).mockResolvedValue({
      token: 8,
      path: "/next",
      name: "next",
    });

    let oldPromise!: Promise<void>;
    let choosePromise!: Promise<void>;
    act(() => {
      oldPromise = result.current.actions.refresh();
      choosePromise = result.current.actions.chooseRoot();
    });
    await waitFor(() =>
      expect(listFolderChildren).toHaveBeenCalledWith(8, ""),
    );
    act(() => {
      void result.current.actions.refresh();
      void result.current.actions.refresh();
    });

    oldRefresh.resolve(listing(""));
    await act(async () => oldPromise);
    expect(
      vi.mocked(listFolderChildren).mock.calls.filter(([token]) => token === 8),
    ).toHaveLength(1);

    newRefresh.resolve({
      rootToken: 8,
      directory: "",
      entries: [],
      truncated: false,
    });
    await act(async () => choosePromise);
    expect(
      vi.mocked(listFolderChildren).mock.calls.filter(([token]) => token === 8),
    ).toHaveLength(2);
  });

  it("does not let a stale refresh replace or reschedule a new root", async () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: [],
        view: "files",
        sidebarWidth: 280,
      }),
    );
    const { result } = renderHook(() => useFolderBrowser({ isActive: true }));
    await waitFor(() => expect(result.current.state.root).toEqual(root));
    await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(1));

    const staleRefresh = deferred<FolderListing>();
    vi.mocked(listFolderChildren).mockImplementation((token, directory) => {
      if (token === root.token) return staleRefresh.promise;
      return Promise.resolve({
        rootToken: token,
        directory,
        entries: [],
        truncated: false,
      });
    });
    vi.mocked(chooseFolderPath).mockResolvedValue("/next");
    vi.mocked(openFolderRoot).mockResolvedValue({
      token: 8,
      path: "/next",
      name: "next",
    });

    let refreshPromise!: Promise<void>;
    let choosePromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.actions.refresh();
      choosePromise = result.current.actions.chooseRoot();
    });
    await act(async () => choosePromise);
    staleRefresh.resolve(listing(""));
    await act(async () => refreshPromise);

    expect(result.current.state.root?.path).toBe("/next");
    expect(listFolderChildren).toHaveBeenCalledWith(8, "");
    expect(
      vi.mocked(listFolderChildren).mock.calls.filter(([token]) => token === 7),
    ).toHaveLength(2);
  });
});
