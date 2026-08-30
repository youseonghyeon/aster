import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLastOpenedDocumentPath,
  lastOpenedDocumentStorageKey,
  loadInitialDocumentPath,
  loadLastOpenedDocumentPath,
  saveLastOpenedDocumentPath,
} from "./last-opened-document";

describe("last opened document persistence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("round-trips a normalized document path", () => {
    expect(saveLastOpenedDocumentPath("  /docs/guide.md  ")).toBe(true);
    expect(loadLastOpenedDocumentPath()).toBe("/docs/guide.md");
    expect(localStorage.getItem(lastOpenedDocumentStorageKey)).toBe(
      "/docs/guide.md",
    );
  });

  it("ignores empty and unavailable storage", () => {
    expect(saveLastOpenedDocumentPath("  ")).toBe(false);
    expect(loadLastOpenedDocumentPath()).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveLastOpenedDocumentPath("/docs/guide.md")).toBe(false);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadLastOpenedDocumentPath()).toBeNull();
  });

  it("clears a path without leaking storage errors", () => {
    localStorage.setItem(lastOpenedDocumentStorageKey, "/docs/guide.md");
    expect(clearLastOpenedDocumentPath()).toBe(true);
    expect(loadLastOpenedDocumentPath()).toBeNull();
    expect(localStorage.getItem(lastOpenedDocumentStorageKey)).toBe("");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(clearLastOpenedDocumentPath()).toBe(false);
  });

  it("uses a recent-document fallback only before the new key is initialized", () => {
    expect(loadInitialDocumentPath("/docs/recent.md")).toBe("/docs/recent.md");

    expect(clearLastOpenedDocumentPath()).toBe(true);
    expect(loadInitialDocumentPath("/docs/recent.md")).toBeNull();
  });
});
