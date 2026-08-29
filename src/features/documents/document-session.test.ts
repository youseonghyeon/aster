import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDocumentNoteStorageKey,
  hasUnsavedMarkdown,
  isDocumentContextCurrent,
  loadDocumentNote,
  saveDocumentNote,
  untitledDocumentNoteStorageKey,
} from "./document-session";

describe("document session policies", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("isolates notes by document path", () => {
    expect(getDocumentNoteStorageKey(null)).toBe(
      untitledDocumentNoteStorageKey,
    );
    expect(getDocumentNoteStorageKey("/docs/readme.md")).toBe(
      "aster:document-note:file:v1:/docs/readme.md",
    );
  });

  it("loads and saves notes without leaking storage failures", () => {
    expect(saveDocumentNote("note", "memo")).toBe(true);
    expect(loadDocumentNote("note")).toBe("memo");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveDocumentNote("note", "next")).toBe(false);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadDocumentNote("note")).toBe("");
  });

  it("compares edits against the active document baseline", () => {
    expect(hasUnsavedMarkdown("draft", null, "draft")).toBe(false);
    expect(hasUnsavedMarkdown("changed", null, "draft")).toBe(true);
    expect(hasUnsavedMarkdown("loaded", "loaded", "draft")).toBe(false);
    expect(hasUnsavedMarkdown("changed", "loaded", "draft")).toBe(true);
  });

  it("rejects stale document operations", () => {
    const expected = {
      generation: 2,
      path: "/docs/readme.md",
      markdownEditVersion: 4,
    };

    expect(isDocumentContextCurrent(expected, expected)).toBe(true);
    expect(
      isDocumentContextCurrent({ ...expected, generation: 3 }, expected),
    ).toBe(false);
    expect(
      isDocumentContextCurrent({ ...expected, path: "/docs/next.md" }, expected),
    ).toBe(false);
    expect(
      isDocumentContextCurrent({ ...expected, markdownEditVersion: 5 }, expected),
    ).toBe(false);
  });
});
