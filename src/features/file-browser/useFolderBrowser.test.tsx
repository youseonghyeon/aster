import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseFolderPath,
  closeFolderRoot,
  listFolderChildren,
  openFolderRoot,
  type FolderListing,
} from "./folder-gateway";
import { folderBrowserStorageKey } from "./folder-preferences";
import { useFolderBrowser } from "./useFolderBrowser";

vi.mock("./folder-gateway", () => ({
  chooseFolderPath: vi.fn(),
  closeFolderRoot: vi.fn(() => Promise.resolve()),
  listFolderChildren: vi.fn(),
  openFolderImage: vi.fn(() => Promise.resolve()),
  openFolderRoot: vi.fn(),
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

describe("useFolderBrowser", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(openFolderRoot).mockReset();
    vi.mocked(chooseFolderPath).mockReset();
    vi.mocked(closeFolderRoot).mockClear();
    vi.mocked(listFolderChildren).mockReset();
    vi.mocked(openFolderRoot).mockResolvedValue(root);
    vi.mocked(listFolderChildren).mockImplementation((_, directory) =>
      Promise.resolve(listing(directory)),
    );
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
});
