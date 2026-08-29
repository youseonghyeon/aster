import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultFolderBrowserPreferences,
  folderBrowserStorageKey,
  loadFolderBrowserPreferences,
  saveFolderBrowserPreferences,
} from "./folder-preferences";

describe("folder browser preferences", () => {
  beforeEach(() => localStorage.clear());

  it("loads a bounded versioned preference shape", () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: ["guide", "guide", "../escape", "/absolute"],
        view: "recent",
        sidebarWidth: 999,
        ignored: "value",
      }),
    );

    expect(loadFolderBrowserPreferences()).toEqual({
      rootPath: "/docs",
      expandedPaths: ["guide"],
      view: "recent",
      sidebarWidth: 420,
    });
  });

  it("falls back for corrupt storage and reports write failures", () => {
    localStorage.setItem(folderBrowserStorageKey, "not-json");
    expect(loadFolderBrowserPreferences()).toEqual(
      defaultFolderBrowserPreferences,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(saveFolderBrowserPreferences(defaultFolderBrowserPreferences)).toBe(
      false,
    );
  });

  it("bounds restored expansion work", () => {
    localStorage.setItem(
      folderBrowserStorageKey,
      JSON.stringify({
        rootPath: "/docs",
        expandedPaths: Array.from({ length: 40 }, (_, index) => `folder-${index}`),
      }),
    );

    expect(loadFolderBrowserPreferences().expandedPaths).toHaveLength(24);
  });
});
