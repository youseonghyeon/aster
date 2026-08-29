import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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

describe("useFolderBrowser", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(openFolderRoot).mockReset();
    vi.mocked(listFolderChildren).mockReset();
    vi.mocked(openFolderRoot).mockResolvedValue(root);
    vi.mocked(listFolderChildren).mockImplementation((_, directory) =>
      Promise.resolve(listing(directory)),
    );
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
